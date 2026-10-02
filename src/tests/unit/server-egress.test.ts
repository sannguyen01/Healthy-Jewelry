import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'

import { parseEgress, judgeEgress } from '../../../scripts/lib/egress.mjs'

/**
 * **Where the server sends bytes, observed rather than assumed.**
 *
 * ## Which side of the network this covers
 *
 * Contract §12 approves egress per side, and each side needs a different harness:
 *
 * | Side | Harness | Sees |
 * |---|---|---|
 * | browser | `e2e/support/test.ts` (automatic Playwright fixture) | every request a page makes, plus CSP violations |
 * | **server** | **this file** | every `globalThis.fetch` a route handler makes |
 *
 * The browser fixture cannot see this side at all: a route handler calling a payment host
 * from inside a Vercel function never appears in a page's network log. This file is the
 * only check on that half, which is why it exists.
 *
 * ## Why the SDKs are not mocked
 *
 * Every other route test here mocks `resend` and `@upstash/*` so it can run offline. Doing
 * that here would make the test vacuous: a mocked SDK never calls `fetch`, so the recorded
 * list would be empty and every assertion would pass by having nothing to judge. Instead
 * only `fetch` is stubbed — the real Resend SDK and the real Upstash client build their own
 * requests, and those requests are what gets recorded. Two anti-vacuity assertions prove
 * the stub is actually in the path: each scenario must be seen reaching the hosts it should.
 *
 * ## What this does not see
 *
 * Only `globalThis.fetch`. A handler that opened a raw socket, or an SDK that brought its
 * own HTTP client, would be invisible. The webhook route is not exercised: it answers only
 * an HMAC-signed delivery, makes no outbound call, and is deleted under WS-F.
 */

const CONTRACT = resolve(__dirname, '../../../COMMERCE-ELIMINATION-CONTRACT.md')
const policy = parseEgress(readFileSync(CONTRACT, 'utf8'))

const recorded: string[] = []

/**
 * A stand-in network that answers the shapes the two SDKs expect, well enough that the
 * handlers proceed past their first call. Whether a handler *succeeds* is not this file's
 * question — the route tests own that — only where it tried to go.
 */
function fakeNetwork(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  recorded.push(url)
  const { hostname, pathname } = new URL(url)
  const json = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

  if (hostname.endsWith('.upstash.io')) {
    const body = typeof init?.body === 'string' ? init.body : '[]'
    const reply = (cmd: unknown) =>
      Array.isArray(cmd) && String(cmd[0]).toUpperCase() === 'PING' ? { result: 'PONG' } : { result: 0 }
    if (pathname.includes('pipeline') || pathname.includes('multi-exec')) {
      return json((JSON.parse(body) as unknown[]).map(reply))
    }
    return json(reply(JSON.parse(body)))
  }
  if (hostname === 'api.resend.com') {
    return json(pathname.startsWith('/emails') ? { id: 'mock-email-id' } : { data: [] })
  }
  return json({})
}

let ipCounter = 10
const ip = () => `198.51.100.${ipCounter++}`

function contactRequest(): NextRequest {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip() },
    body: JSON.stringify({
      name: 'Egress Probe',
      email: 'probe@example.com',
      subject: 'Server egress',
      message: 'Where does this request go, and nowhere else?',
    }),
  })
}

function judge(urls: string[]) {
  return judgeEgress(urls, { ...policy, side: 'server' })
}

beforeEach(() => {
  recorded.length = 0
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(fakeNetwork))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the contract this harness judges against', () => {
  it('parses a server allowlist and a denylist, so neither judgement is against an empty list', () => {
    expect(policy.allowed.filter((row) => row.side === 'server').length).toBeGreaterThan(0)
    expect(policy.forbidden.length).toBeGreaterThan(0)
  })
})

describe('with Upstash and Resend configured', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://egress-probe.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock_upstash_token')
    vi.stubEnv('RESEND_API_KEY', 'mock_resend_key')
  })

  it('/api/health reaches the rate-limit store and the mail provider, and nothing else', async () => {
    const { GET } = await import('@/app/api/health/route')
    await GET(new Request('http://localhost/api/health', { headers: { 'x-forwarded-for': ip() } }))

    const hosts = recorded.map((u) => new URL(u).hostname)
    // Anti-vacuity: the stub is in the path of both real SDKs.
    expect(hosts.some((h) => h.endsWith('.upstash.io')), `recorded: ${hosts.join(', ')}`).toBe(true)
    expect(hosts).toContain('api.resend.com')
    expect(judge(recorded)).toEqual([])
  })

  it('/api/contact reaches only approved hosts, whatever the limiter decides', async () => {
    const { POST } = await import('@/app/api/contact/route')
    await POST(contactRequest())

    expect(recorded.length, 'the distributed limiter was never asked').toBeGreaterThan(0)
    expect(judge(recorded)).toEqual([])
  })
})

describe('with only Resend configured (in-memory limiter)', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('RESEND_API_KEY', 'mock_resend_key')
  })

  it('/api/contact delivers through the mail provider and nothing else', async () => {
    const { POST } = await import('@/app/api/contact/route')
    const res = await POST(contactRequest())

    expect(res.status).toBe(200)
    expect(recorded.some((u) => u.startsWith('https://api.resend.com/emails'))).toBe(true)
    expect(judge(recorded)).toEqual([])
  })

  it.each([
    ['/api/analytics', async () => {
      const { POST } = await import('@/app/api/analytics/route')
      return POST(
        new NextRequest('http://localhost/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip() },
          body: JSON.stringify({ name: 'collection_viewed', collection: 'rings', productCount: 4 }),
        })
      )
    }],
    ['/api/sitemap', async () => (await import('@/app/api/sitemap/route')).GET()],
    ['/api/version', async () => (await import('@/app/api/version/route')).GET()],
  ] as const)('%s calls nobody', async (_route, invoke) => {
    await invoke()
    expect(recorded).toEqual([])
  })
})

describe('the harness can fail', () => {
  it('a recorded call to a §13 host is a finding, even beside approved ones', () => {
    const forbiddenHost = policy.forbidden[0].host
    const findings = judge(['https://api.resend.com/emails', `https://${forbiddenHost}/x`])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('forbidden-origin')
  })

  it('a recorded call to a host §12 does not approve is a finding', () => {
    expect(judge(['https://unapproved.example/collect'])[0].code).toBe('unapproved-origin')
  })
})
