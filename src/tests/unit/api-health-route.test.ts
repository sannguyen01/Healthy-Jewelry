import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Upstash is mocked at the module boundary rather than at `fetch`.
 *
 * Hand-rolling its wire format would test our fixture's fidelity to a protocol
 * we do not own, and the real client retries a failing request several times
 * before giving up — four seconds per case, for no signal. What is under test
 * here is this route's mapping from "did Redis answer?" to a status code.
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
 * Resend is mocked the same way and for the same reason: this route's job is
 * mapping "did the key authenticate?" to a status, not re-verifying Resend's
 * own SDK. `apiKeys.list()` is the specific call under test, chosen because it
 * authenticates without sending mail — a real send here would be a side effect
 * of a health check nobody asked for.
 */
const resendApiKeysList = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    apiKeys = { list: () => resendApiKeysList() }
  },
}))

/**
 * The endpoint exists to answer one question honestly: *are rate limits
 * actually shared across serverless instances right now?*
 *
 * The failure mode worth guarding is not "it returns the wrong boolean" — it is
 * "it returns a reassuring boolean while the thing is broken." `distributed`
 * only reflects whether two env vars are set; a typo'd URL, a revoked token or a
 * paused database all leave it `true` while every limit check fails open. So the
 * cases below pin the *degraded* answers as hard as the healthy one.
 */

interface HealthBody {
  rateLimitDistributed: boolean
  redis: 'ok' | 'unreachable' | 'not-configured'
  resend: 'ok' | 'unreachable' | 'not-configured'
  healthy: boolean
  hint?: string
}

/**
 * A request for the route to read a caller IP from.
 *
 * The IP varies per call by default. These tests assert the route's *verdict*,
 * and a shared IP would mean each `describe` block silently spends the same
 * 30/min bucket — so a test added later would fail for a reason that has nothing
 * to do with what it asserts. Pass a fixed IP explicitly where the limiter
 * itself is the subject.
 */
let ipCounter = 0
function healthRequest(ip?: string): Request {
  ipCounter += 1
  return new Request('http://localhost/api/health', {
    headers: { 'x-forwarded-for': ip ?? `10.0.0.${ipCounter % 250}` },
  })
}

/** Load the route fresh so its module-scope limiter and verdict cache are new. */
async function loadRoute() {
  vi.resetModules()
  const { GET } = await import('@/app/api/health/route')
  return GET
}

function stubUpstash(configured: boolean) {
  if (configured) {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  } else {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  }
}

function stubResend(apiKey: string | null) {
  vi.stubEnv('RESEND_API_KEY', apiKey ?? '')
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
    upstashLimit.mockReset()
    resendApiKeysList.mockReset()
    // Every test that doesn't care about Resend still exercises `checkResend`,
    // since it always runs — default to "not configured" so pre-existing
    // rate-limit assertions aren't affected by an unrelated destructure.
    stubResend(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reports not-configured and 503 when Upstash env vars are absent', async () => {
    stubUpstash(false)
    const GET = await loadRoute()

    const res = await GET(healthRequest())
    const body = (await res.json()) as HealthBody

    expect(body.rateLimitDistributed).toBe(false)
    expect(body.redis).toBe('not-configured')
    expect(body.healthy).toBe(false)
    // 503 so a monitor can act on the status alone.
    expect(res.status).toBe(503)
    // The hint has to name the per-environment trap; setting the vars for
    // Production only is the way this gets "fixed" and stays broken.
    expect(body.hint).toMatch(/Preview/)
  })

  it('reports unreachable and 503 when Upstash is configured but does not answer', async () => {
    // The case the naive version gets wrong: env vars present, Redis dead, and
    // a green light anyway.
    stubUpstash(true)
    upstashLimit.mockRejectedValue(new Error('ECONNREFUSED'))
    const GET = await loadRoute()

    const res = await GET(healthRequest())
    const body = (await res.json()) as HealthBody

    expect(body.rateLimitDistributed).toBe(true)
    expect(body.redis).toBe('unreachable')
    expect(body.healthy).toBe(false)
    expect(res.status).toBe(503)
    expect(body.hint).toMatch(/failing open/i)
  })

  it('reports healthy and 200 when Redis answers', async () => {
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    const GET = await loadRoute()

    const res = await GET(healthRequest())
    const body = (await res.json()) as HealthBody

    expect(body.rateLimitDistributed).toBe(true)
    expect(body.redis).toBe('ok')
    expect(body.healthy).toBe(true)
    expect(res.status).toBe(200)
    expect(body.hint).toBeUndefined()
  })

  it('never leaks credentials or URLs', async () => {
    // The route is public. It may say whether the mechanism works; it may not
    // say how it is wired.
    stubUpstash(true)
    upstashLimit.mockRejectedValue(new Error('nope'))
    stubResend('re_test_key')
    resendApiKeysList.mockResolvedValue({ data: [], error: null })
    const GET = await loadRoute()

    const raw = await (await GET(healthRequest())).text()

    expect(raw).not.toContain('example.upstash.io')
    expect(raw).not.toContain('test-token')
    expect(raw).not.toContain('re_test_key')
    expect(raw).not.toMatch(/UPSTASH_REDIS_REST_TOKEN["']?\s*:/)
    expect(raw).not.toMatch(/RESEND_API_KEY["']?\s*:/)
  })

  /**
   * `resend` deliberately never changes `healthy` or the status code — the
   * cases above already pin `healthy` to rate-limiting alone regardless of
   * Resend's state. These pin the informational field on its own.
   */
  it('reports resend as not-configured when RESEND_API_KEY is unset', async () => {
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    stubResend(null)
    const GET = await loadRoute()

    const body = (await (await GET(healthRequest())).json()) as HealthBody

    expect(body.resend).toBe('not-configured')
    expect(resendApiKeysList).not.toHaveBeenCalled()
  })

  it('reports resend as ok when the key authenticates', async () => {
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    stubResend('re_test_key')
    resendApiKeysList.mockResolvedValue({ data: [], error: null })
    const GET = await loadRoute()

    const body = (await (await GET(healthRequest())).json()) as HealthBody

    expect(body.resend).toBe('ok')
  })

  it('reports resend as unreachable when the key is revoked or invalid', async () => {
    // Configured true and dead is exactly the case `redis` guards against for
    // Upstash — a revoked or mistyped Resend key looks identical to a working
    // one until something actually calls the API.
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    stubResend('re_revoked_key')
    resendApiKeysList.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'API key is invalid' },
    })
    const GET = await loadRoute()

    const body = (await (await GET(healthRequest())).json()) as HealthBody

    expect(body.resend).toBe('unreachable')
  })

  it('reports resend as unreachable when the API call throws', async () => {
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    stubResend('re_test_key')
    resendApiKeysList.mockRejectedValue(new Error('ECONNREFUSED'))
    const GET = await loadRoute()

    const body = (await (await GET(healthRequest())).json()) as HealthBody

    expect(body.resend).toBe('unreachable')
  })

  it("resend's state never overrides healthy or the status code", async () => {
    // rate-limiting is fine, Resend is broken — healthy must still be true,
    // since /api/health's status code is a monitor's signal for rate-limiting
    // specifically, not a general-purpose "is anything wrong" flag.
    stubUpstash(true)
    upstashLimit.mockResolvedValue({ success: true })
    stubResend('re_revoked_key')
    resendApiKeysList.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'API key is invalid' },
    })
    const GET = await loadRoute()

    const res = await GET(healthRequest())
    const body = (await res.json()) as HealthBody

    expect(body.resend).toBe('unreachable')
    expect(body.healthy).toBe(true)
    expect(res.status).toBe(200)
  })

  it('is not cached', async () => {
    // A cached answer describes whatever the environment was at cache time.
    stubUpstash(false)
    const GET = await loadRoute()

    expect((await GET(healthRequest())).headers.get('Cache-Control')).toContain('no-store')
  })
})

/**
 * **The composition, not any one decision, was the defect.**
 *
 * Each choice on this route reviewed clean in isolation: spend a real round-trip
 * so "configured" cannot pass for "working"; never gate the probe, so it cannot
 * refuse a real caller; stay public, because a health endpoint nobody can reach
 * answers nobody. Together they made an unauthenticated amplifier — one Upstash
 * command and one **authenticated, paid** Resend API call per GET, with a limiter
 * of 1,000,000/min in front of it.
 *
 * Resend enforces per-account rate limits, so the reachable consequence was not
 * only a bill: tripping them degrades `/api/contact`, a route this project has
 * already had to fix once for silently dropping customer inquiries.
 */
describe('GET /api/health — the amplification is bounded', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    upstashLimit.mockReset()
    resendApiKeysList.mockReset()
  })

  it('spends one Resend call for many requests, not one per request', async () => {
    stubUpstash(true)
    stubResend('re_test_key')
    upstashLimit.mockResolvedValue({ success: true })
    resendApiKeysList.mockResolvedValue({ data: [], error: null })

    const GET = await loadRoute()
    for (let i = 0; i < 10; i++) await GET(healthRequest())

    // Ten requests, one computation. Before the verdict cache this was ten
    // authenticated calls to a paid third party, on a public endpoint.
    expect(resendApiKeysList).toHaveBeenCalledTimes(1)
  })

  it('serves the same verdict from the cache, not a fresh guess', async () => {
    stubUpstash(true)
    stubResend('re_test_key')
    upstashLimit.mockResolvedValue({ success: true })
    resendApiKeysList.mockResolvedValue({ data: [], error: null })

    const GET = await loadRoute()
    const first = (await (await GET(healthRequest())).json()) as HealthBody
    const second = (await (await GET(healthRequest())).json()) as HealthBody

    expect(second).toEqual(first)
  })

  it('refuses past the limit rather than serving a cached answer', async () => {
    // A caller past 30/min is not asking in good faith, and handing them the
    // cache would still be work done on their behalf.
    stubUpstash(false)
    stubResend(null)

    const GET = await loadRoute()
    const ip = '203.0.113.99'
    let refused: Response | null = null
    for (let i = 0; i < 40; i++) {
      const res = await GET(healthRequest(ip))
      if (res.status === 429) {
        refused = res
        break
      }
    }

    expect(refused, 'the limiter never refused across 40 requests from one IP').not.toBeNull()
    expect(refused?.headers.get('Retry-After')).toBe('60')
  })

  it('counts each caller separately, so one abuser cannot deny everyone else', async () => {
    stubUpstash(false)
    stubResend(null)

    const GET = await loadRoute()
    for (let i = 0; i < 40; i++) await GET(healthRequest('198.51.100.1'))

    const other = await GET(healthRequest('198.51.100.2'))
    expect(other.status).not.toBe(429)
  })
})

/**
 * The TTL cannot be raised until it fossilises the check that reads this route.
 *
 * `production-smoke.yml` asserts `/api/health` on a six-hourly cron. If the
 * cached verdict's lifetime ever approached that interval, a scheduled run would
 * read an answer computed for somebody else — and a check that cannot observe
 * the thing it checks is documentation (ADR 020).
 *
 * Asserted against the smoke schedule's own exported constant rather than a
 * number typed here a second time, so the relationship is checked rather than
 * restated. A number in prose is a claim like any other (ADR 025).
 */
describe('the verdict TTL stays far below the interval that reads it', () => {
  it('is at most a hundredth of the smoke cron interval', async () => {
    const { SMOKE_CRON_INTERVAL_HOURS } = await import('../../../scripts/lib/smoke-schedule.mjs')
    const source = readFileSync(
      resolve(__dirname, '../../app/api/health/route.ts'),
      'utf8'
    )
    const declared = Number(source.match(/const VERDICT_TTL_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ''))

    expect(Number.isFinite(declared), 'VERDICT_TTL_MS not found in the route').toBe(true)

    const intervalMs = SMOKE_CRON_INTERVAL_HOURS * 60 * 60 * 1000
    expect(
      declared,
      `VERDICT_TTL_MS is ${declared}ms against a ${SMOKE_CRON_INTERVAL_HOURS}h smoke ` +
        `interval. Raising it toward that interval would let a scheduled run read a ` +
        `verdict computed for another caller, which is a check that cannot observe ` +
        `what it checks.`
    ).toBeLessThanOrEqual(intervalMs / 100)
  })
})
