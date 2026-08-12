import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  healthy: boolean
  hint?: string
}

/** Load the route fresh so its module-scope limiter is built under this env. */
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

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
    upstashLimit.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reports not-configured and 503 when Upstash env vars are absent', async () => {
    stubUpstash(false)
    const GET = await loadRoute()

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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
    const GET = await loadRoute()

    const raw = await (await GET()).text()

    expect(raw).not.toContain('example.upstash.io')
    expect(raw).not.toContain('test-token')
    expect(raw).not.toMatch(/UPSTASH_REDIS_REST_TOKEN["']?\s*:/)
  })

  it('is not cached', async () => {
    // A cached answer describes whatever the environment was at cache time.
    stubUpstash(false)
    const GET = await loadRoute()

    expect((await GET()).headers.get('Cache-Control')).toContain('no-store')
  })
})
