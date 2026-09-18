import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { shopifyPublicConfig } from '@/config/shopify-public'

/**
 * **A read must not be able to starve the checkout.**
 *
 * `/api/shopify` metered every operation out of one 60/minute bucket keyed by
 * IP. `GetCart` and `CreateCart` are not interchangeable: refusing the first
 * means the drawer cannot show a total, and refusing the second means the
 * customer cannot buy. They were competing for the same sixty tokens, and the
 * loser was whichever request happened to arrive last.
 *
 * The key is an IP, so the competition is between *people*. Behind a corporate
 * NAT or a mobile carrier's CGNAT the whole network is one caller — browsing
 * traffic from everyone else spends the allowance the one person at the checkout
 * needs. The failure is silent, load-dependent, and lands on the single request
 * in the system that produces revenue.
 *
 * Every case below is written so that it fails if the two prefixes are ever made
 * the same again, which is the way this fix is most likely to be undone: the
 * code would still read as though the buckets were split.
 */

const SHOPIFY_VERSION_HEADER = { 'X-Shopify-API-Version': shopifyPublicConfig.apiVersion }

function shopifyOk(body: unknown = { data: { cart: null } }) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(SHOPIFY_VERSION_HEADER),
    json: async () => body,
  }
}

function req(operation: string, ip: string): NextRequest {
  return new NextRequest('http://localhost/api/shopify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({
      operation,
      variables: { cartId: 'gid://shopify/Cart/1', lines: [] },
    }),
  })
}

/** Fire `n` requests from one IP and report how many were refused. */
async function drain(
  post: (r: NextRequest) => Promise<Response>,
  operation: string,
  ip: string,
  n: number
): Promise<{ refused: number; firstRefusal: Response | null }> {
  let refused = 0
  let firstRefusal: Response | null = null
  for (let i = 0; i < n; i++) {
    const res = await post(req(operation, ip))
    if (res.status === 429) {
      refused++
      firstRefusal ??= res
    }
  }
  return { refused, firstRefusal }
}

let POST: (r: NextRequest) => Promise<Response>

beforeEach(async () => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
  vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(shopifyOk()))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ POST } = await import('@/app/api/shopify/route'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the two budgets are separate', () => {
  it('spending the entire read allowance leaves the write allowance untouched', async () => {
    // The whole point. A customer who has been browsing — or anyone else behind
    // the same NAT — must still be able to create a cart and pay.
    const ip = '203.0.113.40'

    const reads = await drain(POST, 'GetCart', ip, 120)
    expect(reads.refused, 'the read bucket never refused, so this proves nothing').toBeGreaterThan(0)

    const write = await POST(req('CreateCart', ip))
    expect(write.status, 'a read flood consumed the checkout allowance').not.toBe(429)
  })

  it('spending the entire write allowance leaves reads working', async () => {
    // The converse, and it matters for a different reason: a customer who has
    // just been refused a mutation should still be able to see their bag rather
    // than meeting a second failure on the page that explains the first.
    const ip = '203.0.113.41'

    const writes = await drain(POST, 'AddToCart', ip, 60)
    expect(writes.refused).toBeGreaterThan(0)

    const read = await POST(req('GetCart', ip))
    expect(read.status).not.toBe(429)
  })

  it('gives writes a tighter ceiling than reads', async () => {
    // Not merely different buckets — differently sized ones. A genuine checkout
    // is a handful of mutations; a caller needing more than twenty a minute is
    // not shopping. Measured rather than read off the constants, so the
    // assertion survives the constants being renamed.
    const writes = await drain(POST, 'AddToCart', '203.0.113.42', 100)
    const reads = await drain(POST, 'GetCart', '203.0.113.43', 100)

    expect(writes.refused).toBeGreaterThan(reads.refused)
  })

  it('names the bucket on the refusal', async () => {
    const { firstRefusal } = await drain(POST, 'AddToCart', '203.0.113.44', 60)
    expect(firstRefusal?.headers.get('X-RateLimit-Bucket')).toBe('write')
    expect(firstRefusal?.headers.get('Retry-After')).toBe('60')

    const reads = await drain(POST, 'GetCart', '203.0.113.45', 120)
    expect(reads.firstRefusal?.headers.get('X-RateLimit-Bucket')).toBe('read')
  })

  it('keeps counting per IP, so one abusive caller cannot limit the site', async () => {
    const flooded = await drain(POST, 'AddToCart', '203.0.113.46', 60)
    expect(flooded.refused).toBeGreaterThan(0)

    const somebodyElse = await POST(req('AddToCart', '198.51.100.7'))
    expect(somebodyElse.status).not.toBe(429)
  })
})

describe('an unknown operation costs a customer nothing', () => {
  it('refuses with 403 without spending either allowance', async () => {
    // The limiter sits *after* the allowlist deliberately. Metering first would
    // let a flood of garbage operation names consume a real customer's write
    // budget and leave the 403s to the people trying to buy something — the
    // check would be protecting Shopify from requests that never reach it while
    // charging shoppers for them.
    const ip = '203.0.113.47'

    for (let i = 0; i < 100; i++) {
      const res = await POST(req('DropAllCarts', ip))
      expect(res.status).toBe(403)
    }

    expect((await POST(req('CreateCart', ip))).status).not.toBe(429)
    expect((await POST(req('GetCart', ip))).status).not.toBe(429)
  })

  it('does not reach Shopify for an unknown operation', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(shopifyOk())
    vi.stubGlobal('fetch', fetchSpy)

    await POST(req('__proto__', '203.0.113.48'))
    await POST(req('constructor', '203.0.113.48'))
    await POST(req('toString', '203.0.113.48'))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('every persisted operation is classified', () => {
  it('each one meters somewhere, and a cart mutation never meters as a read', async () => {
    // There is no default. A new operation added to `PERSISTED_QUERIES` without
    // a cost is a 403 with a named log line, not a silent assignment to the
    // cheap bucket — because the cheap default is precisely the one that would
    // put a cart mutation on the browsing budget.
    //
    // Derived from behaviour rather than from the table: each operation is
    // driven past the write ceiling (20) but not the read ceiling (60), so a
    // refusal identifies it as a write and the absence of one as a read.
    const expected: Record<string, 'read' | 'write'> = {
      GetCart: 'read',
      CreateCart: 'write',
      AddToCart: 'write',
      UpdateCartLines: 'write',
      RemoveFromCart: 'write',
    }

    let ipSuffix = 100
    for (const [operation, cost] of Object.entries(expected)) {
      const { refused, firstRefusal } = await drain(POST, operation, `198.51.100.${ipSuffix++}`, 40)
      if (cost === 'write') {
        expect(refused, `${operation} was not metered as a write`).toBeGreaterThan(0)
        expect(firstRefusal?.headers.get('X-RateLimit-Bucket')).toBe('write')
      } else {
        expect(refused, `${operation} was metered as a write`).toBe(0)
      }
    }
  })
})
