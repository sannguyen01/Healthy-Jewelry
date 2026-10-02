import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = () => 'sliding-window'
    limit = async () => ({ success: true })
  },
}))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({}) } }))

/**
 * **`/api/analytics` — the sink, and exactly what it writes down.**
 *
 * `e2e/analytics.spec.ts` asserts from the page side that nothing reaches this route
 * without consent. What nothing asserted was what the route *keeps* once something does
 * reach it — and on 2026-09-25 the answer turned out to include five fields no event
 * defines any more: `value`, `currency`, `quantity`, `itemCount`, `reason`. The price
 * and cart fields of the deleted commerce events, still copied from any request body into
 * the log line, on a site that publishes no prices.
 *
 * The allowlist is now held to the event union's field set by the compiler
 * (`satisfies Record<EventField, …>` in the route). These cases pin the runtime half:
 * what a hostile or stale payload produces in the one place these events are stored.
 */

const { POST } = await import('@/app/api/analytics/route')

let ip = 0
function beacon(body: unknown): NextRequest {
  ip += 1
  return new NextRequest('http://localhost/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${ip % 250}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

let log: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  log.mockRestore()
})

/** The JSON half of every `[analytics] {json}` line written during the test. */
function written(): Record<string, unknown>[] {
  return log.mock.calls
    .filter((call) => call[0] === '[analytics]')
    .map((call) => JSON.parse(String(call[1])) as Record<string, unknown>)
}

describe('POST /api/analytics', () => {
  it('writes an event with exactly the fields its union arm defines', async () => {
    const res = await POST(
      beacon({ name: 'product_viewed', handle: 'arc-band-titanium', collection: 'rings', material: 'titanium' })
    )
    expect(res.status).toBe(204)
    expect(written()).toEqual([
      { name: 'product_viewed', handle: 'arc-band-titanium', collection: 'rings', material: 'titanium' },
    ])
  })

  it('drops price, cart and identity fields a stale or hostile client sends', async () => {
    // The five commerce fields the allowlist carried until 2026-09-25, plus the two a
    // caller is most likely to invent. None of them may reach the log.
    await POST(
      beacon({
        name: 'product_viewed',
        handle: 'arc-band-titanium',
        value: '89.00',
        currency: 'USD',
        quantity: 2,
        itemCount: 3,
        reason: 'not-configured',
        email: 'someone@example.com',
        ip: '203.0.113.7',
      })
    )

    const [event] = written()
    expect(Object.keys(event).sort()).toEqual(['handle', 'name'])
    const line = JSON.stringify(log.mock.calls)
    for (const leaked of ['89.00', 'USD', 'someone@example.com', '203.0.113.7', 'not-configured']) {
      expect(line, `the log line carried ${leaked}`).not.toContain(leaked)
    }
  })

  it('lower-cases and truncates the search query at the route, not only at the client', async () => {
    await POST(beacon({ name: 'search_performed', query: 'X'.repeat(200), resultCount: 0 }))
    await POST(beacon({ name: 'search_performed', query: '  Titanium RING  ', resultCount: 3 }))
    const [long, short] = written()
    expect(long.query).toBe('x'.repeat(64))
    expect(long.resultCount).toBe(0)
    expect(short.query).toBe('titanium ring')
  })

  it('writes nothing for an event name outside the union, and still answers 204', async () => {
    for (const name of ['add_to_bag', 'checkout_failed', 'page_view', '']) {
      expect((await POST(beacon({ name, handle: 'x' }))).status).toBe(204)
    }
    expect(written()).toEqual([])
  })

  it('writes nothing for a body that is not a JSON object', async () => {
    for (const body of ['not json', '"a string"', 'null', '[]']) {
      expect((await POST(beacon(body))).status).toBe(204)
    }
    expect(written()).toEqual([])
  })
})
