import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'

/**
 * Upstash mocked at the module boundary, matching `api-health-route.test.ts`.
 * Hand-rolling its wire format would test a fixture's fidelity to a protocol we
 * do not own, and the real client retries for seconds before giving up.
 */
const upstashLimit = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = () => 'sliding-window'
    limit = (id: string) => upstashLimit(id)
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({}) },
}))

/**
 * **The module three public routes depend on, which had no test file at all.**
 *
 * `vitest.config.ts` includes `src/lib/**` in coverage at an 80% threshold, so
 * `rateLimit.ts` reported as covered — incidentally, through its callers. What
 * none of those callers exercised was the behaviour that mattered.
 *
 * ## The two defects this file exists because of
 *
 * **1. `isLimited` could throw, and three routes awaited it unguarded.**
 * `upstash.limit()` rejects on any Redis failure. `/api/shopify` (`:50`),
 * `/api/contact` (`:20`) and `/api/analytics` (`:80`) had no try/catch, so a
 * Redis blip returned **500 on every cart mutation** — add-to-bag, quantity
 * edits, checkout initiation, site-wide. Meanwhile `/api/health` told the
 * operator *"Rate limits are failing open."* They were failing 500, at the till.
 *
 * The most uncomfortable detail: `api-health-route.test.ts:118` has mocked
 * `upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))` since that route
 * was written. The failure mode was known, modelled, and tested in exactly the
 * one place that handled it.
 *
 * **2. The two implementations disagreed about what a window is.** The in-memory
 * fallback was a *fixed* window; the Upstash path uses `slidingWindow`. The
 * `RateLimiter` interface declared exactly one difference between them
 * (`distributed`) while three existed — the algorithm, the burst behaviour, and
 * the pruning cost. Today every environment runs the in-memory path because
 * Upstash is unconfigured (STATE.md item 5), so the divergence was invisible and
 * would have appeared the day somebody completed that item. **Arming a defect by
 * doing the right thing** is the shape worth testing against.
 *
 * ## What is deliberately asserted about `clientIp`
 *
 * Its trust assumption is **unverified** — see the function's own doc comment.
 * These tests pin what it does *today*, in both the single- and multi-entry
 * cases, so whichever way the question resolves the change is a one-line edit
 * against a test that already states the contract. Pinning current behaviour is
 * not the same as endorsing it, and the comments below say which is which.
 */

const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RATE_LIMIT_KEY_SECRET'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  upstashLimit.mockReset()
  vi.useRealTimers()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.useRealTimers()
})

/** Build a limiter with Upstash configured. */
async function withUpstash(policy: Partial<Parameters<typeof build>[0]> = {}) {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
  return build(policy)
}

/** Build a limiter with Upstash absent, so the in-memory path is used. */
async function withoutUpstash(policy: Partial<Parameters<typeof build>[0]> = {}) {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  return build(policy)
}

async function build(policy: {
  limit?: number
  window?: `${number} ${'s' | 'm' | 'h' | 'd'}`
  prefix?: string
  onError?: 'allow' | 'deny'
} = {}) {
  vi.resetModules()
  const { createRateLimiter } = await import('@/lib/utils/rateLimit')
  return createRateLimiter({
    limit: policy.limit ?? 3,
    window: policy.window ?? '1 m',
    prefix: policy.prefix ?? 'hj:test',
    onError: policy.onError ?? 'allow',
  })
}

describe('the request path never throws — it honours the declared posture', () => {
  it("resolves false (allow) when Upstash rejects and onError is 'allow'", async () => {
    const limiter = await withUpstash({ onError: 'allow' })
    upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))

    // The assertion that matters is that this RESOLVES. Before this change it
    // rejected, and the three routes above it had no catch.
    await expect(limiter.isLimited('1.2.3.4')).resolves.toBe(false)
  })

  it("resolves true (refuse) when Upstash rejects and onError is 'deny'", async () => {
    const limiter = await withUpstash({ onError: 'deny' })
    upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(limiter.isLimited('1.2.3.4')).resolves.toBe(true)
  })

  it('still reports Upstash’s real verdict when Upstash answers', async () => {
    const limiter = await withUpstash()
    upstashLimit.mockResolvedValue({ success: false })
    await expect(limiter.isLimited('1.2.3.4')).resolves.toBe(true)

    upstashLimit.mockResolvedValue({ success: true })
    await expect(limiter.isLimited('1.2.3.4')).resolves.toBe(false)
  })

  it('logs the failure at error level, naming the prefix and the posture', async () => {
    // On an `allow` posture there is no 429 to notice and no failed request to
    // trace, so this log line is the ONLY signal that the ceiling is absent.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The prefix was `hj:shopify`, the cart proxy's bucket, until that route went. Any
    // `allow`-posture prefix exercises the same line; this one still exists.
    const limiter = await withUpstash({ prefix: 'hj:analytics', onError: 'allow' })
    upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))

    await limiter.isLimited('1.2.3.4')

    expect(spy).toHaveBeenCalledOnce()
    expect(String(spy.mock.calls[0][0])).toContain('hj:analytics')
    expect(String(spy.mock.calls[0][0])).toContain('allow')
    spy.mockRestore()
  })
})

describe('check() reports truthfully instead of absorbing the failure', () => {
  it('is "unreachable" when Upstash rejects — the signal isLimited can no longer give', async () => {
    const limiter = await withUpstash()
    upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(limiter.check()).resolves.toBe('unreachable')
  })

  it('is "ok" when Upstash answers, whatever the verdict', async () => {
    const limiter = await withUpstash()
    // The verdict is irrelevant; that it answered at all is the test.
    upstashLimit.mockResolvedValue({ success: false })
    await expect(limiter.check()).resolves.toBe('ok')
  })

  it('is "not-configured" on the in-memory path, not "ok"', async () => {
    // The fallback works perfectly and is still the degraded state: per-instance
    // counting on Vercel means the effective limit is `limit x instances`.
    // Reporting "ok" would report that the fallback functions, which is true and
    // not the question /api/health asks.
    const limiter = await withoutUpstash()
    await expect(limiter.check()).resolves.toBe('not-configured')
    expect(limiter.distributed).toBe(false)
  })
})

describe('the in-memory fallback is a sliding window, matching Upstash', () => {
  it('refuses once the limit is reached inside the window', async () => {
    const limiter = await withoutUpstash({ limit: 3, window: '1 m' })
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(true)
  })

  it('does not allow 2x the limit across a boundary — the fixed-window defect', async () => {
    // **The discriminating case, and it took two attempts to find one.**
    //
    // The obvious test — spend the allowance at t=0, check it is still refused at
    // t=59s — passes under a fixed window *and* a sliding one, because neither has
    // expired anything yet. So does "allowed again at t=61s": both let the caller
    // through, for different reasons. A mutation that reverted the implementation
    // to a fixed window left the first draft of this test entirely green.
    //
    // What separates them is spending the allowance ACROSS the boundary rather
    // than at the start of it:
    //
    //   t=0    1 hit          fixed: window anchored here, resets at t=60
    //   t=59   2 hits         both: 3 in flight, the 4th is refused
    //   t=61   fixed  -> the anchor expired, the count resets, 3 MORE allowed:
    //                    5 requests inside 2 seconds, against a limit of 3
    //          sliding-> only the t=0 hit aged out, the two from t=59 remain,
    //                    so exactly 1 is allowed and the next is refused
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))
    const limiter = await withoutUpstash({ limit: 3, window: '1 m' })

    expect(await limiter.isLimited('ip')).toBe(false)

    vi.setSystemTime(new Date('2026-09-15T00:00:59Z'))
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip'), 'the 4th hit inside the window').toBe(true)

    vi.setSystemTime(new Date('2026-09-15T00:01:01Z'))
    expect(
      await limiter.isLimited('ip'),
      'the t=0 hit has aged out, so exactly one slot is free'
    ).toBe(false)
    expect(
      await limiter.isLimited('ip'),
      'a fixed window would allow this — the two hits from t=59s are still inside ' +
        'the trailing minute, and a sliding window counts them'
    ).toBe(true)
  })

  it('lets the window slide — a hit expires exactly one window after it was taken', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))

    const limiter = await withoutUpstash({ limit: 1, window: '1 m' })
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(true)

    vi.setSystemTime(new Date('2026-09-15T00:01:01Z'))
    expect(await limiter.isLimited('ip')).toBe(false)
  })

  it('counts each IP separately', async () => {
    const limiter = await withoutUpstash({ limit: 1 })
    expect(await limiter.isLimited('a')).toBe(false)
    expect(await limiter.isLimited('b')).toBe(false)
    expect(await limiter.isLimited('a')).toBe(true)
  })

  it('does not grow an unbounded array for an IP that keeps hammering a limit', async () => {
    // A refused request must still prune. Otherwise the timestamp list for an
    // abusive IP grows without bound for as long as it keeps being refused —
    // trading the O(n)-per-call prune this replaced for a memory leak.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))

    const limiter = await withoutUpstash({ limit: 1, window: '1 m' })
    expect(await limiter.isLimited('ip')).toBe(false)
    for (let i = 0; i < 50; i++) {
      vi.setSystemTime(new Date(Date.now() + 1000))
      expect(await limiter.isLimited('ip')).toBe(true)
    }

    // Past the window, the single real hit has expired and the 50 refusals left
    // nothing behind.
    vi.setSystemTime(new Date('2026-09-15T00:02:00Z'))
    expect(await limiter.isLimited('ip')).toBe(false)
  })
})

describe('the map is bounded, so the fallback is not a leak', () => {
  it('sweeps expired keys once the tracked-IP threshold is crossed', async () => {
    // The previous implementation pruned the WHOLE map on every call — O(n) per
    // request on a route allowing 120/minute. Sweeping on a size threshold makes
    // that amortised, but only if the sweep actually happens: removing the
    // per-call prune without a replacement bound would have traded a CPU cost for
    // an unbounded Map in a long-lived Lambda.
    //
    // 10,001 distinct IPs is what it takes to cross MAX_TRACKED_IPS. That is a lot
    // of iterations for one assertion, and it is the only way to reach this branch
    // at all — which is precisely why it was the one part of this module coverage
    // reported as unexercised.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))

    const limiter = await withoutUpstash({ limit: 1, window: '1 m' })
    for (let i = 0; i < 10_001; i++) {
      expect(await limiter.isLimited(`ip-${i}`)).toBe(false)
    }

    // Every one of those hits is now outside the window, so the next arrival
    // triggers a sweep that finds nothing worth keeping. The observable
    // consequence is that a previously-seen IP is allowed again rather than being
    // refused on a stale entry.
    vi.setSystemTime(new Date('2026-09-15T00:02:00Z'))
    expect(await limiter.isLimited('ip-0')).toBe(false)

    // And the sweep must not have thrown away a LIVE entry on its way past.
    expect(await limiter.isLimited('ip-0')).toBe(true)
  })
})

describe('window parsing', () => {
  it.each([
    ['1 s', 1_000],
    ['1 m', 60_000],
    ['2 h', 7_200_000],
    ['1 d', 86_400_000],
  ] as const)('%s expires after %d ms', async (window, ms) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))

    const limiter = await withoutUpstash({ limit: 1, window })
    expect(await limiter.isLimited('ip')).toBe(false)
    expect(await limiter.isLimited('ip')).toBe(true)

    vi.setSystemTime(new Date(Date.now() + ms + 1))
    expect(await limiter.isLimited('ip')).toBe(false)
  })
})

describe('clientIp — pinning current behaviour, including the unverified part', () => {
  async function clientIp() {
    vi.resetModules()
    return (await import('@/lib/utils/rateLimit')).clientIp
  }

  it('takes x-forwarded-for when present', async () => {
    const fn = await clientIp()
    expect(fn(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('takes the FIRST entry of a chain', async () => {
    // **This is the unverified assumption, pinned rather than endorsed.** It is
    // correct only if the platform overwrites a client-supplied x-forwarded-for
    // rather than appending to it. If it appends, this first entry is
    // attacker-controlled and rotating it defeats every limiter here, including
    // /api/contact's 5/hour guard on a paid email API.
    //
    // Not checked against Vercel's documentation as of 2026-09-15 — the review
    // sandbox had no public-web egress, and a trust boundary is not something to
    // settle from memory (ADR 018). This test is what makes the eventual answer a
    // one-line change against a stated contract.
    const fn = await clientIp()
    expect(fn(new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1, 10.0.0.2' }))).toBe(
      '198.51.100.9'
    )
  })

  it('trims whitespace around an entry', async () => {
    const fn = await clientIp()
    expect(fn(new Headers({ 'x-forwarded-for': '  203.0.113.7 , 10.0.0.1' }))).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', async () => {
    const fn = await clientIp()
    expect(fn(new Headers({ 'x-real-ip': '203.0.113.8' }))).toBe('203.0.113.8')
  })

  it('falls back past an empty x-forwarded-for rather than bucketing on ""', async () => {
    // An empty first entry used to be returned verbatim, which would have put
    // every such request in one shared bucket keyed on the empty string.
    const fn = await clientIp()
    expect(fn(new Headers({ 'x-forwarded-for': '', 'x-real-ip': '203.0.113.8' }))).toBe(
      '203.0.113.8'
    )
  })

  it('returns "unknown" when neither header is present', async () => {
    // Every anonymous caller then shares one bucket. That is the conservative
    // answer — it over-limits rather than under-limits — and it is why the value
    // is a sentinel rather than something derived.
    const fn = await clientIp()
    expect(fn(new Headers())).toBe('unknown')
  })
})

/**
 * **The privacy page said the IP was "hashed and short-lived". It was neither.**
 *
 * Until 2026-09-25 both implementations keyed buckets on the raw address: `upstash.limit(ip)`
 * wrote it into a Redis key, and the in-memory map held it for the life of the Lambda. The
 * claim was written in good faith and checked by nothing, which is the whole of
 * [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md) in one
 * sentence of a privacy policy.
 *
 * ## Known answers from outside Node
 *
 * The two digests below were computed with coreutils and OpenSSL, not with `node:crypto`:
 *
 * ```
 * printf '%s\0%s' 'hj-rate-limit-key/v1' '203.0.113.7' | sha256sum
 * printf '%s' '203.0.113.7' | openssl dgst -sha256 -hmac 'test-only-key-0123456789abcdef-0123456789'
 * ```
 *
 * Asserting the derivation against `createHash(...)` in the test would only prove the code
 * agrees with a copy of itself ([ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 * An independent tool also pins what matters operationally: the key is a function of the
 * IP alone, so every instance and every deploy computes the same one, and a distributed
 * limiter stays distributed. The first draft of the `sha256sum` line lost its NUL
 * separator to `printf` reading `\0203` as one octal escape — the kind of disagreement a
 * known answer exists to surface, found here before it could be mistaken for the code's.
 */
describe('bucket keys are pseudonymised, never the raw IP', () => {
  const IP = '203.0.113.7'
  const UNKEYED_DIGEST = '0d5fc9837e131db040ac1fa9bfdf0d5cb95ee635d8cb47b0a6b644f65ffbdb31'
  // Test-only, and deliberately shaped like nothing a scanner would call a credential.
  const TEST_KEY = 'test-only-key-0123456789abcdef-0123456789'
  const KEYED_DIGEST = '1d7c34931acfbf3759ab9fa4246553222d874622e15fed8f9eb44c4f3c4fd0c7'

  async function derivation() {
    vi.resetModules()
    return (await import('@/lib/utils/rateLimit')).ipKeyDerivation
  }

  it('unkeyed: SHA-256 of the versioned prefix, a NUL and the IP', async () => {
    const derive = await derivation()
    expect(derive(undefined).mode).toBe('unkeyed')
    expect(derive(undefined).key(IP)).toBe(UNKEYED_DIGEST)
  })

  it('keyed: HMAC-SHA256 of the IP under RATE_LIMIT_KEY_SECRET', async () => {
    const derive = await derivation()
    expect(derive(TEST_KEY).mode).toBe('keyed')
    expect(derive(TEST_KEY).key(IP)).toBe(KEYED_DIGEST)
  })

  it('a different key gives a different bucket, and neither contains the address', async () => {
    const derive = await derivation()
    const other = derive(`${TEST_KEY}-rotated`).key(IP)
    expect(other).not.toBe(KEYED_DIGEST)
    for (const key of [other, KEYED_DIGEST, UNKEYED_DIGEST]) {
      expect(key).toMatch(/^[0-9a-f]{64}$/)
      expect(key).not.toContain(IP)
    }
  })

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['one short of the floor', 'x'.repeat(31)],
  ])('a secret that is %s is not a key — the mode says unkeyed rather than vouching for it', async (_label, secret) => {
    const derive = await derivation()
    expect(derive(secret).mode).toBe('unkeyed')
    expect(derive(secret).key(IP)).toBe(UNKEYED_DIGEST)
  })

  it('Upstash is handed the derived key, never the address', async () => {
    // This identifier becomes part of a Redis key. It is the line the privacy claim rests on.
    delete process.env.RATE_LIMIT_KEY_SECRET
    const limiter = await withUpstash()
    upstashLimit.mockResolvedValue({ success: true })

    await limiter.isLimited(IP)

    expect(limiter.keying).toBe('unkeyed')
    expect(upstashLimit).toHaveBeenCalledWith(UNKEYED_DIGEST)
    expect(upstashLimit.mock.calls.flat().join(' ')).not.toContain(IP)
  })

  it('uses the HMAC when the secret is set, and reports that it does', async () => {
    process.env.RATE_LIMIT_KEY_SECRET = TEST_KEY
    const limiter = await withUpstash()
    upstashLimit.mockResolvedValue({ success: true })

    await limiter.isLimited(IP)

    expect(limiter.keying).toBe('keyed')
    expect(upstashLimit).toHaveBeenCalledWith(KEYED_DIGEST)
  })

  it('two independently built limiters agree on the key — distributed limiting still works', async () => {
    // A per-instance salt would give every Lambda its own key space: each would count only
    // its own share of a caller's requests, which is `limit x instances` again, the defect
    // `distributed` exists to report — and invisible, because `distributed` would still
    // read true.
    process.env.RATE_LIMIT_KEY_SECRET = TEST_KEY
    upstashLimit.mockResolvedValue({ success: true })

    await (await withUpstash()).isLimited(IP)
    await (await withUpstash()).isLimited(IP)

    expect(upstashLimit.mock.calls.map((c) => c[0])).toEqual([KEYED_DIGEST, KEYED_DIGEST])
  })

  it('the in-memory fallback reports its keying too, and still counts per caller', async () => {
    process.env.RATE_LIMIT_KEY_SECRET = TEST_KEY
    const limiter = await withoutUpstash({ limit: 1 })
    expect(limiter.keying).toBe('keyed')
    expect(await limiter.isLimited('198.51.100.1')).toBe(false)
    expect(await limiter.isLimited('198.51.100.2')).toBe(false)
    expect(await limiter.isLimited('198.51.100.1')).toBe(true)
  })

  it('says once, by length and never by value, that a short secret was ignored', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const shortKey = 'too-short-to-count'
    process.env.RATE_LIMIT_KEY_SECRET = shortKey

    vi.resetModules()
    const { createRateLimiter } = await import('@/lib/utils/rateLimit')
    const policy = { limit: 1, window: '1 m', prefix: 'hj:test', onError: 'allow' } as const
    const first = createRateLimiter(policy)
    createRateLimiter({ ...policy, prefix: 'hj:test-2' })

    expect(first.keying).toBe('unkeyed')
    expect(spy).toHaveBeenCalledOnce()
    expect(String(spy.mock.calls[0][0])).toContain('RATE_LIMIT_KEY_SECRET')
    expect(spy.mock.calls.flat().join(' ')).not.toContain(shortKey)
    spy.mockRestore()
  })
})

/**
 * **`node:crypto` is only safe while every caller runs on Node.**
 *
 * The Edge runtime has no `node:crypto`. Nothing here uses Edge today — checked, not
 * assumed: every module that imports the limiter is walked and none may export
 * `runtime = 'edge'`. The day one does, this fails with the choice to make (Web Crypto,
 * async, in `ipKeyDerivation`) rather than the build failing on a module-resolution error
 * that names neither.
 */
describe('every caller of the limiter runs on the Node runtime', () => {
  const SRC = resolve(__dirname, '../..')

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === 'tests' || entry === 'node_modules') continue
        sourceFiles(full, out)
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(full)
      }
    }
    return out
  }

  /** `export const runtime = 'edge'`, read from the AST so a comment saying it does not count. */
  function declaresEdge(sf: ts.SourceFile): boolean {
    return sf.statements.some(
      (st) =>
        ts.isVariableStatement(st) &&
        st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true &&
        st.declarationList.declarations.some(
          (d) =>
            ts.isIdentifier(d.name) &&
            d.name.text === 'runtime' &&
            d.initializer !== undefined &&
            ts.isStringLiteralLike(d.initializer) &&
            d.initializer.text === 'edge'
        )
    )
  }

  const importers = sourceFiles(SRC)
    .map((file) => ({ file, sf: parseSource(file, readFileSync(file, 'utf8')) }))
    .filter(({ sf }) => importsFrom(sf, '@/lib/utils/rateLimit').length > 0)

  it('finds the callers it is meant to be checking', () => {
    // Four today. A scan that found none would pass the assertion below vacuously.
    expect(importers.map(({ file }) => relative(SRC, file)).sort()).toEqual([
      'app/api/analytics/route.ts',
      'app/api/contact/route.ts',
      'app/api/health/route.ts',
      'app/search/page.tsx',
    ])
  })

  it('none of them declares the Edge runtime', () => {
    const edge = importers.filter(({ sf }) => declaresEdge(sf)).map(({ file }) => relative(SRC, file))
    expect(
      edge,
      'These import the rate limiter and run on Edge, where node:crypto does not exist. ' +
        'Move ipKeyDerivation to Web Crypto (crypto.subtle, async) or keep the caller on Node.'
    ).toEqual([])
  })

  it('the detector recognises the declaration it is looking for', () => {
    expect(declaresEdge(parseSource('x.ts', "export const runtime = 'edge'"))).toBe(true)
    expect(declaresEdge(parseSource('x.ts', "// export const runtime = 'edge'"))).toBe(false)
    expect(declaresEdge(parseSource('x.ts', "export const runtime = 'nodejs'"))).toBe(false)
  })
})
