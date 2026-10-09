// Healthy Jewelry — shared per-IP rate limiting for public API routes
//
// Extracted from `api/contact/route.ts`, which grew this after a security
// audit found an in-memory limiter that could not work across serverless
// invocations. The cart proxy that used to sit at `/api/shopify` had no limiter
// at all, which made the hardened route the *less* attractive target of the two.
//
// One implementation, four callers today (`/api/contact`, `/api/analytics`,
// `/api/health`, `/search`), so they cannot drift apart the way copies would.
//
// ## Runtime: Node only, and checked rather than assumed
//
// Bucket keys are derived with `node:crypto` (see `ipKeyDerivation` below),
// which the Edge runtime does not provide. Every caller runs on the Node
// runtime today — none exports `runtime = 'edge'`, and there is no middleware —
// and `rateLimit.test.ts` walks the tree and fails if an importer ever declares
// Edge. Web Crypto would run on both, but it is async-only and would make key
// derivation a second awaited step on every request path for a runtime nothing
// here uses; if one ever does, that test is where the decision gets re-made.

import { createHash, createHmac } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * What a route does when the limiter itself fails.
 *
 * ## Why this is a declared field rather than a default
 *
 * It used to be neither. `upstash.limit()` rejects on any Redis failure — a
 * network blip, a revoked token, a paused database — and nothing caught it.
 * `/api/shopify`, `/api/contact` and `/api/analytics` all `await`ed it
 * unguarded, so a rate-limiter outage became a **500 on every cart mutation**:
 * add-to-bag, quantity edits, and checkout initiation, site-wide.
 *
 * Meanwhile `/api/health` told the operator, in as many words:
 *
 *   > 'Upstash is configured but did not answer. Rate limits are failing open.'
 *
 * They were not failing open. They were failing 500, at the till.
 *
 * The failure mode was known — `api-health-route.test.ts` has mocked
 * `upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))` since the health
 * route was written — and tested in exactly the one place that handled it.
 *
 * ## Why the two postures are not a global default
 *
 * The right answer differs per route and the difference is not small:
 *
 *   · `allow` — losing the limiter costs quota; refusing costs a real visitor
 *     a page or a measurement. `/api/analytics`, `/api/health` and `/search`
 *     take this. (The cart proxy took it too, when losing checkout cost revenue.)
 *   · `deny`  — `/api/contact` sends email through a paid API. An unmetered
 *     contact form is money and reputation, so a limiter it cannot consult
 *     refuses rather than guesses.
 *
 * A single global posture would have to be wrong for one of them, which is why
 * this is a required field with no default: a new route must decide, and a
 * reviewer can see what it decided.
 */
export type RateLimitFailurePosture = 'allow' | 'deny'

/**
 * How a client IP becomes a bucket key, as reported by `/api/health`.
 *
 *   · `keyed`   — HMAC-SHA256 under `RATE_LIMIT_KEY_SECRET`. Without the secret a
 *                 stored key cannot be linked back to an address, even by
 *                 enumerating all of them.
 *   · `unkeyed` — SHA-256 of a fixed, versioned prefix and the IP. **Pseudonymous,
 *                 not anonymous**: the prefix is in this public repository, and the
 *                 IPv4 space is small enough to enumerate, so anyone holding a key
 *                 and this file can recover the address. What it does buy is that
 *                 the raw address is never written to Redis or to the in-memory
 *                 map, and that an operator reading keys sees no addresses.
 *
 * The privacy page describes both, because which one is live is a deployment
 * setting rather than a property of the code.
 */
export type IpKeying = 'keyed' | 'unkeyed'

/**
 * Domain separation for the unkeyed derivation.
 *
 * Versioned so that changing the derivation is a new namespace rather than a
 * silent collision with keys an older deployment wrote: every bucket would reset
 * once, which is harmless, instead of two schemes sharing a key space, which is
 * not. The separator is a NUL, which no IP string contains, so no `ip` can be
 * chosen to make the prefix ambiguous.
 */
export const UNKEYED_KEY_DOMAIN = 'hj-rate-limit-key/v1'

/**
 * The shortest `RATE_LIMIT_KEY_SECRET` that counts as a key.
 *
 * An HMAC under a four-character secret is brute-forceable alongside the IPv4
 * space, and reporting `keyed` for it would be a health endpoint vouching for a
 * protection that is not there. Thirty-two characters is what
 * `openssl rand -base64 48` comfortably exceeds. A shorter value is treated as
 * absent — `unkeyed`, which `/api/health` then shows — and logged once.
 */
export const MIN_KEY_SECRET_LENGTH = 32

export interface IpKeyDerivation {
  readonly mode: IpKeying
  /** The bucket key for one client IP. Deterministic, so every instance agrees. */
  readonly key: (ip: string) => string
}

/**
 * The pure half of key derivation: a secret (or none) in, a derivation out.
 *
 * Deterministic across instances and deploys by construction — no salt is
 * generated at runtime, because a per-instance salt would give each Lambda its
 * own key space and quietly turn the distributed limiter back into
 * `limit × instances`, the exact defect `distributed` exists to report.
 */
export function ipKeyDerivation(secret: string | undefined): IpKeyDerivation {
  if (secret !== undefined && secret.length >= MIN_KEY_SECRET_LENGTH) {
    return {
      mode: 'keyed',
      key: (ip) => createHmac('sha256', secret).update(ip, 'utf8').digest('hex'),
    }
  }
  return {
    mode: 'unkeyed',
    key: (ip) =>
      createHash('sha256').update(`${UNKEYED_KEY_DOMAIN}\0${ip}`, 'utf8').digest('hex'),
  }
}

let warnedShortSecret = false

/** Read `RATE_LIMIT_KEY_SECRET` once per limiter, saying so if it is set but too short. */
function derivationFromEnv(): IpKeyDerivation {
  const secret = process.env.RATE_LIMIT_KEY_SECRET
  if (secret && secret.length < MIN_KEY_SECRET_LENGTH && !warnedShortSecret) {
    warnedShortSecret = true
    // The length, never the value.
    console.error(
      `[rateLimit] RATE_LIMIT_KEY_SECRET is set but shorter than ${MIN_KEY_SECRET_LENGTH} ` +
        'characters, so it is ignored and client IPs fall back to the unkeyed derivation. ' +
        "/api/health reports ipKeying: 'unkeyed' until it is replaced."
    )
  }
  return ipKeyDerivation(secret)
}

export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number
  /** Window length, in Upstash's duration syntax (e.g. '1 h', '1 m'). */
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  /** Redis key prefix, so routes never share a bucket. */
  prefix: string
  /**
   * What to do when the limiter cannot answer. Required — see
   * `RateLimitFailurePosture`. There is deliberately no default, because the
   * absence of a decision here is what turned a Redis outage into a checkout
   * outage.
   */
  onError: RateLimitFailurePosture
}

/** What a diagnostic round-trip found. Never returned by the request path. */
export type RateLimiterHealth = 'ok' | 'unreachable' | 'not-configured'

export interface RateLimiter {
  /**
   * True when this request should be refused.
   *
   * **Never throws.** A failure to reach the limiter resolves to the policy's
   * `onError` posture, because this is the request path and a shopper is waiting
   * on it. That guarantee is the whole point of `onError` — and it is why
   * `check()` exists below.
   */
  isLimited: (ip: string) => Promise<boolean>

  /**
   * A diagnostic round-trip that reports a failure truthfully instead of
   * absorbing it into a posture.
   *
   * `/api/health` used to get this signal by catching an exception out of
   * `isLimited`. That worked only while `isLimited` was allowed to throw —
   * which was the defect: three routes 500'd at the till because nothing caught
   * it. Fixing the request path would have silently blinded the health check,
   * since a swallowed error is indistinguishable from a successful call.
   *
   * So the two questions get two methods. *"Should I refuse this request?"* must
   * never throw and must answer under any conditions. *"Is the limiter actually
   * reachable?"* must never lie. A health check that reads its answer out of
   * another function's exception behaviour is coupled to an implementation
   * detail, and this is what that coupling cost.
   */
  check: () => Promise<RateLimiterHealth>
  /**
   * Whether this limiter is durable across serverless invocations.
   *
   * False means Upstash is not configured and the in-memory fallback is in
   * use — which on Vercel means each Lambda instance counts separately, so the
   * effective limit is `limit × instances`. Exposed rather than hidden so a
   * caller (and a test) can assert the difference instead of assuming.
   */
  readonly distributed: boolean
  /**
   * How client IPs are turned into bucket keys — see `IpKeying`.
   *
   * Decided once, when the limiter is built, from the environment it was built
   * in, exactly like `distributed`. Neither implementation ever stores or sends
   * the raw IP: the Upstash identifier and the in-memory map key are both the
   * derived key.
   */
  readonly keying: IpKeying
}

const WINDOW_UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

function parseWindowMs(window: RateLimitPolicy['window']): number {
  const [rawAmount, unit] = window.split(' ') as [string, keyof typeof WINDOW_UNIT_MS]
  const amount = Number.parseInt(rawAmount, 10)
  return (Number.isNaN(amount) ? 1 : amount) * (WINDOW_UNIT_MS[unit] ?? WINDOW_UNIT_MS.h)
}

/**
 * How many distinct IPs the in-memory map holds before it sweeps expired keys.
 *
 * The previous implementation walked the **entire map on every call** to prune
 * expired entries — O(n) per request, on a route allowing 120 requests a minute.
 * Sweeping on a size threshold instead makes the cost amortised: each call
 * prunes only its own key, and a full sweep happens once per `MAX_TRACKED_IPS`
 * new arrivals rather than once per request.
 *
 * The bound also matters on its own. An unbounded map in a long-lived Lambda is
 * a leak, and the old code's per-call prune was load-bearing for that reason —
 * so removing it without a replacement bound would have traded a CPU cost for a
 * memory one.
 */
const MAX_TRACKED_IPS = 10_000

/**
 * In-memory fallback. NOT multi-instance safe — see `distributed` above.
 * Kept only so local development and CI behave without Redis credentials.
 *
 * ## A sliding window, matching Upstash
 *
 * This used to be a **fixed** window: `resetAt` was set on the first hit and
 * never moved, so a caller could spend the full allowance at the end of one
 * window and the full allowance again at the start of the next — `2 × limit` in
 * quick succession. The Upstash path has always used `Ratelimit.slidingWindow`.
 *
 * Two implementations behind one interface, and the interface declared exactly
 * one difference between them (`distributed`) while three existed. Today the
 * divergence is masked because Upstash is unconfigured, so every environment
 * runs this path — which means the limiter's behaviour would have changed
 * silently on the day somebody completed the UPSTASH-REDIS item in STATE.md.
 * Arming a defect by doing the right thing is the shape worth removing.
 */
function createLocalLimiter(policy: RateLimitPolicy, derivation: IpKeyDerivation): RateLimiter {
  const windowMs = parseWindowMs(policy.window)
  /**
   * Per derived key — never per raw IP — the timestamps of recent hits, oldest
   * first. A heap snapshot of a long-lived Lambda is a log like any other.
   */
  const hits = new Map<string, number[]>()

  /** Drop timestamps that have slid out of the window. */
  const fresh = (stamps: number[], now: number): number[] => {
    const cutoff = now - windowMs
    // The array is ordered, so the survivors are a suffix — find its start
    // rather than filtering the whole thing.
    let i = 0
    while (i < stamps.length && stamps[i] <= cutoff) i++
    return i === 0 ? stamps : stamps.slice(i)
  }

  const sweep = (now: number): void => {
    for (const [key, stamps] of hits) {
      const kept = fresh(stamps, now)
      if (kept.length === 0) hits.delete(key)
      else hits.set(key, kept)
    }
  }

  return {
    distributed: false,
    keying: derivation.mode,
    // Not "ok". This limiter works perfectly and is still the degraded state —
    // per-instance counting on Vercel means the effective limit is
    // `limit x instances`. Reporting health here would be reporting that the
    // fallback is functioning, which is true and not the question asked.
    check: async () => 'not-configured' as const,
    isLimited: async (ip: string) => {
      const now = Date.now()
      const key = derivation.key(ip)

      // Amortised, not per-call. See MAX_TRACKED_IPS.
      if (hits.size > MAX_TRACKED_IPS) sweep(now)

      const current = fresh(hits.get(key) ?? [], now)

      if (current.length >= policy.limit) {
        // Store the pruned list even when refusing, so a caller hammering a
        // limit does not keep an ever-growing array of expired timestamps.
        hits.set(key, current)
        return true
      }

      current.push(now)
      hits.set(key, current)
      return false
    },
  }
}

/**
 * A limiter backed by Upstash Redis when it is configured, and by an
 * in-memory map when it is not.
 *
 * Constructed once per module (routes are modules), never per request.
 *
 * The Upstash call is wrapped **here**, once, rather than at each call site.
 * Three hand-rolled try/catch blocks in three routes is the shape this module
 * was extracted to eliminate — its own header records that it "used to be two
 * hand-rolled copies" — and a posture duplicated three times is a posture that
 * drifts.
 */
export function createRateLimiter(policy: RateLimitPolicy): RateLimiter {
  const derivation = derivationFromEnv()

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return createLocalLimiter(policy, derivation)
  }

  const upstash = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: policy.prefix,
  })

  return {
    distributed: true,
    keying: derivation.mode,
    check: async () => {
      try {
        // The round-trip is the test; the verdict is irrelevant. What is being
        // established is that Upstash answered at all — a typo'd URL, a revoked
        // token and a paused database all leave the env vars set and every real
        // limit check failing.
        await upstash.limit('__health__')
        return 'ok' as const
      } catch {
        return 'unreachable' as const
      }
    },
    isLimited: async (ip: string) => {
      try {
        // The derived key, never `ip`. This identifier is what Upstash stores as
        // part of the Redis key, so this line is the whole of the difference
        // between the privacy page's claim and a database of visitor addresses.
        const { success } = await upstash.limit(derivation.key(ip))
        return !success
      } catch (err) {
        // `error`, not `warn`. A configured limiter that cannot be consulted is
        // a degraded deployment, and on an `allow` posture it is the only signal
        // that the ceiling is currently absent — there is no 429 to notice and
        // no failed request to trace.
        console.error(
          `[rateLimit] ${policy.prefix}: limiter unreachable, failing ${policy.onError}`,
          err
        )
        return policy.onError === 'deny'
      }
    },
  }
}

/**
 * The caller's IP, as far as it can be known behind Vercel's proxy.
 *
 * `x-forwarded-for` is a comma-separated chain and the *first* entry is the
 * original client; taking the whole header would bucket every request from one
 * proxy path together, and taking the last would bucket by Vercel's own edge.
 *
 * ## The assumption, and where it was checked
 *
 * That reasoning is correct **only if the platform overwrites a client-supplied
 * `x-forwarded-for` rather than appending to it.** If it appended, the first
 * entry would be attacker-controlled, and rotating it would defeat every limiter
 * in this codebase — including `/api/contact`'s 5/hour guard on a paid email API.
 *
 * Open from 2026-09-15 (the sandbox that wrote this had no public-web egress, and a
 * trust boundary is not something to settle from memory — ADR 018). **Settled
 * 2026-10-04 against Vercel's own documentation** (vercel.com/docs/headers/request-headers,
 * read through the Vercel documentation connector): "Vercel overwrites this header and
 * does not forward external IPs to prevent spoofing, unless a trusted proxy is enabled
 * for Enterprise customers." So on this deployment the first entry is Vercel's, not
 * the client's. The condition that would reopen it is named in that sentence: enabling
 * a trusted proxy in front of Vercel makes the chain the proxy's to write, and this
 * function would then have to take the entry that proxy appends.
 *
 * `rateLimit.test.ts` asserts what this function does, in both the single-entry
 * and multi-entry cases.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
