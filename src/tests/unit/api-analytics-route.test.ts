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
 * Since 2026-09-27 each event has its own strict schema, held to the event's type in both
 * directions by the compiler (`EVENT_SCHEMAS` and `exact` in the route). These cases pin the
 * runtime half: what a hostile or stale payload produces in the one place these events are
 * stored — which, for anything outside the schema, is nothing.
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

    // Dropped whole, not trimmed. It was trimmed to `{ name, handle }` until 2026-09-27; a
    // record that is partly forged is not partly true (see the forged-beacon block below).
    expect(written()).toEqual([])
    const line = JSON.stringify(log.mock.calls)
    for (const leaked of ['89.00', 'USD', 'someone@example.com', '203.0.113.7', 'not-configured']) {
      expect(line, `the log line carried ${leaked}`).not.toContain(leaked)
    }
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

/**
 * **A forged beacon cannot put a visitor's words into the log.**
 *
 * The route is public, so the legitimate client's types settle nothing about what arrives.
 * Until 2026-09-27 the allowlist was the *union's* field set rather than each event's, so a
 * direct POST could attach `query` — the one free-text field — to `product_viewed`; the only
 * defence was lower-casing and truncating to 64 characters, and an email address, a phone
 * number and an order reference all fit in 64 characters. Every other field was free text or
 * an unbounded number too: `handle` took any string, `productCount` any finite number.
 *
 * Each case here is a payload that reached the log before the change. The rule now: a field
 * the event does not define, or a value outside what the catalogue can produce, drops the
 * **whole** event — a record that is partly forged is not partly true.
 */
describe('POST /api/analytics — a forged beacon', () => {
  const PERSONAL = [
    'customer@example.com',
    'customer@example.com order 10001',
    '+84 90 123 4567',
    '5551234567',
    '#1001',
    'https://example.com/?email=a@b.c',
  ]

  it('drops product_viewed carrying a search query', async () => {
    await POST(
      beacon({
        name: 'product_viewed',
        handle: 'arc-band-titanium',
        collection: 'rings',
        material: 'titanium',
        query: 'customer@example.com order 10001',
      })
    )
    expect(written()).toEqual([])
  })

  it('drops an event whose handle, collection or material is not the catalogue’s', async () => {
    await POST(beacon({ name: 'product_viewed', handle: 'jane@example.com', collection: 'rings', material: 'titanium' }))
    await POST(beacon({ name: 'product_viewed', handle: 'arc-band-titanium', collection: '+84901234567', material: 'titanium' }))
    await POST(beacon({ name: 'collection_viewed', collection: 'jane doe', productCount: 3 }))
    expect(written()).toEqual([])
  })

  it('drops a count that is not a count the catalogue could produce', async () => {
    for (const productCount of [5551234567, -1, 2.5, 1e9]) {
      await POST(beacon({ name: 'collection_viewed', collection: 'rings', productCount }))
    }
    await POST(beacon({ name: 'search_performed', resultCount: 5551234567, facets: [] }))
    expect(written()).toEqual([])
  })

  it('never writes search text, whatever it is called', async () => {
    for (const field of ['query', 'q', 'term', 'text']) {
      await POST(beacon({ name: 'search_performed', resultCount: 0, facets: [], [field]: 'customer@example.com' }))
    }
    expect(written()).toEqual([])
  })

  it('keeps the words out of the log whichever field or event carries them', async () => {
    // Generative rather than hand-picked: every personal-data sample, in every field any
    // event defines, on every event name. A hand-picked list is the input somebody thought
    // of (ADR 028); this is every place the input could go.
    const FIELDS = ['handle', 'collection', 'material', 'productCount', 'resultCount', 'facets', 'query']
    for (const name of ['product_viewed', 'collection_viewed', 'search_performed']) {
      for (const field of FIELDS) {
        for (const sample of PERSONAL) {
          await POST(beacon({ name, [field]: field === 'facets' ? [sample] : sample }))
          await POST(
            beacon({
              name,
              handle: 'arc-band-titanium',
              collection: 'rings',
              material: 'titanium',
              productCount: 3,
              resultCount: 1,
              facets: [],
              [field]: field === 'facets' ? [sample] : sample,
            })
          )
        }
      }
    }
    const everything = JSON.stringify(log.mock.calls)
    for (const sample of PERSONAL) expect(everything, `the log carried ${sample}`).not.toContain(sample)
  })

  it('still writes the legitimate event of every kind, exactly', async () => {
    await POST(beacon({ name: 'product_viewed', handle: 'arc-band-titanium', collection: 'rings', material: 'titanium' }))
    await POST(beacon({ name: 'collection_viewed', collection: 'earrings', productCount: 4 }))
    await POST(beacon({ name: 'search_performed', resultCount: 0, facets: ['niobium', 'earrings'] }))
    expect(written()).toEqual([
      { name: 'product_viewed', handle: 'arc-band-titanium', collection: 'rings', material: 'titanium' },
      { name: 'collection_viewed', collection: 'earrings', productCount: 4 },
      { name: 'search_performed', resultCount: 0, facets: ['niobium', 'earrings'] },
    ])
  })
})
