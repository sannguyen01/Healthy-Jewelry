import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'

/**
 * Reports whether the deployment's out-of-band dependencies actually work.
 *
 * ## Why this exists
 *
 * `createRateLimiter` silently falls back to an in-memory map when
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent. On Vercel
 * that map lives per Lambda instance, so the effective limit is
 * `limit × concurrent instances` rather than `limit` — the same single-instance
 * weakness a security audit already corrected once for `/api/contact`, quietly
 * reintroduced for `/api/shopify`, which is unauthenticated and creates carts.
 *
 * `/api/contact` has the same shape of gap: PR #32 made a missing
 * `RESEND_API_KEY` fail honestly at request time (503, no more silent
 * `{ success: true }`) instead of lying, but that failure is still only
 * visible to whoever happens to submit the form. `resend` below is the same
 * "checkable rather than invisible" treatment already given to Redis.
 *
 * Nothing about either gap is visible from the outside on its own. Neither
 * errors, neither logs, and each only manifests under exactly the condition
 * it exists to catch.
 *
 * ## Configured is not the same as working
 *
 * Reporting presence alone would only prove an env var is *set*. A typo'd
 * Upstash URL, a revoked token, a paused database, or a revoked Resend key all
 * leave "configured" true while the thing it configures is dead. So this
 * endpoint spends one real round-trip against each and reports what actually
 * happened. A health check that goes green while the thing it checks is
 * broken is worse than no check at all.
 *
 * `resend` is checked via `apiKeys.list()` — an authenticated, side-effect-free
 * call that validates the key without sending any mail, deliberately, since a
 * scheduled health probe sending real email every few minutes would itself be
 * the kind of silent surprise this file exists to prevent.
 *
 * `resend` is informational only: it does not affect `healthy` or the response
 * status code, which stay scoped to rate-limiting as before. Whether a
 * misconfigured Resend key should fail a *scheduled* smoke run is a decision
 * for whoever wires this into `production-smoke.yml` — this project has twice
 * shipped an alarm that fires on a state its own owner already knows about
 * (see the 2026-08-13 architecture notes in STATE.md), and `RESEND_API_KEY`
 * being unset is exactly that: a known, tracked, already-open item, not a
 * surprise.
 *
 * ## What it deliberately does not return
 *
 * No env values, no URLs, no tokens, no key material — statuses and booleans
 * only. The endpoint is public, so it says whether each mechanism works, never
 * how it is wired.
 */

// Never prerendered: a build-time answer would describe the build machine's
// environment, not the running deployment's, and would then be cached as fact.
export const dynamic = 'force-dynamic'

type RedisStatus = 'ok' | 'unreachable' | 'not-configured'
type ResendStatus = 'ok' | 'unreachable' | 'not-configured'

// Module scope, per rateLimit.ts's own guidance ("constructed once per module,
// never per request"). A per-request limiter would allocate a fresh Map on every
// call, which for the in-memory fallback means it could never observe a limit.
//
// **30/min, not 1,000,000.** The ceiling used to be effectively absent, with a
// comment saying so on purpose: "this bucket exists to be written to, not to gate
// anything." Each individually-reasonable decision on this route was correct; the
// composition was not. Public, `no-store`, no authentication, a limiter that
// refuses nothing, and — below — one Upstash round-trip **and one authenticated
// Resend API call per request. An unauthenticated caller could spend the store's
// Upstash quota and its Resend quota at the rate they could issue GETs, and
// tripping Resend's own per-account limits degrades the contact form, which is a
// real customer-facing consequence rather than a billing one.
//
// `onError: 'allow'` — a rate limiter that cannot be consulted must not make a
// health endpoint unreachable, since "is anything working?" is exactly the
// question being asked when Redis is down.
const probe = createRateLimiter({
  limit: 30,
  window: '1 m',
  prefix: 'hj:health',
  onError: 'allow',
})

/**
 * How long a computed verdict is reused.
 *
 * This is the control that actually removes the amplification. A limiter caps
 * how many requests are *served*; the cache caps how many third-party
 * round-trips are *spent*, which is the part that costs money and can trip
 * somebody else's quota.
 *
 * ## Why this cannot fossilise the smoke check
 *
 * `production-smoke.yml` asserts this endpoint on a six-hourly cron
 * (`SMOKE_CRON_INTERVAL_HOURS`). A cached verdict would be worthless to it if the
 * TTL ever approached that interval — the run would read an answer computed for
 * somebody else, and a check that cannot observe the thing it checks is
 * documentation ([ADR 020](../../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).
 *
 * Thirty seconds against six hours is a ratio of 720:1, so every scheduled run
 * recomputes from scratch. `api-health-route.test.ts` asserts that relationship
 * against the smoke schedule's own constant rather than against a number typed
 * here twice, so raising this TTL toward the cron interval fails the suite.
 *
 * ## The honest limit
 *
 * Module scope on Vercel is per-instance, so this bounds the spend per Lambda
 * rather than globally: N concurrent instances means up to N computations per
 * window. That is a far smaller number than "per request" and it is not one.
 * Stated here rather than left for somebody to discover, which is the same rule
 * `docs/controls.json` applies to a `knownLimit`.
 */
const VERDICT_TTL_MS = 30_000

interface CachedVerdict {
  at: number
  redis: RedisStatus
  resend: ResendStatus
  distributed: boolean
}

// No exported reset seam, deliberately. A Next.js `route.ts` may export only
// route handlers and a fixed set of config keys — anything else is a type error,
// the same constraint `api/webhooks/shopify/route.ts` records for its topic
// table. Tests get a clean cache by re-importing the module under
// `vi.resetModules()`, which is what their `loadRoute()` helper already does.
let cachedVerdict: CachedVerdict | null = null

/**
 * `apiKeys.list()` authenticates the key against Resend's API without
 * sending anything — the same "spend a real round-trip" treatment as the
 * Redis probe above, without the side effect a send would have.
 */
async function checkResend(): Promise<ResendStatus> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return 'not-configured'

  try {
    const { error } = await new Resend(apiKey).apiKeys.list()
    return error ? 'unreachable' : 'ok'
  } catch {
    return 'unreachable'
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (await probe.isLimited(clientIp(request.headers))) {
    // 429 rather than a stale verdict. A caller past 30/min is not asking a
    // question in good faith, and handing them a cached answer would still be
    // work done on their behalf.
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }
    )
  }

  const now = Date.now()
  const fresh = cachedVerdict && now - cachedVerdict.at < VERDICT_TTL_MS ? cachedVerdict : null

  // `check()`, not a try/catch around `isLimited`.
  //
  // This route used to read its answer out of an exception thrown by the request
  // path. That coupled the health check to `isLimited` being allowed to throw —
  // which was itself the defect it was built to detect: three routes returned 500
  // at the till on an Upstash blip. Fixing the request path would have blinded
  // this check silently, because a swallowed error looks exactly like success.
  const redis: RedisStatus = fresh ? fresh.redis : await probe.check()

  // The expensive half. `apiKeys.list()` is an authenticated call to a paid third
  // party, and it ran unconditionally on every request. Behind the TTL it runs at
  // most once per window per instance — and the six-hourly smoke run, which is the
  // only caller that needs a fresh answer, always finds the cache cold.
  const resend = fresh ? fresh.resend : await checkResend()

  if (!fresh) {
    cachedVerdict = { at: now, redis, resend, distributed: probe.distributed }
  }

  const healthy = probe.distributed && redis === 'ok'

  return NextResponse.json(
    {
      // True only when limits are genuinely shared across serverless instances.
      rateLimitDistributed: probe.distributed,
      redis,
      // Informational only — does not affect `healthy` or the status code.
      // See the file-level doc comment for why this stays non-blocking.
      resend,
      healthy,
      hint: healthy
        ? undefined
        : probe.distributed
          ? 'Upstash is configured but did not answer. Each limiter falls back to its ' +
            'declared onError posture: /api/shopify and /api/analytics allow, ' +
            '/api/contact refuses. Until 2026-09-15 this line read "rate limits are ' +
            'failing open" while all three actually threw, returning 500 at the till.'
          : 'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset in this ' +
            'environment, so rate limits count per Lambda instance rather than globally. ' +
            'Vercel scopes env vars per environment — set them for Preview as well as Production.',
    },
    {
      // 503 when degraded, so a monitor can act on the status code alone without
      // parsing the body.
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
