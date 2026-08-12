import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { shopifyPublicConfig } from '@/config/shopify-public'

// next/cache is server-only; mock it before importing the route
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const { POST } = await import('@/app/api/shopify/route')

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReq(
  body: unknown,
  opts: { contentLength?: number; contentType?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': opts.contentType ?? 'application/json',
  }
  if (opts.contentLength !== undefined) {
    headers['content-length'] = String(opts.contentLength)
  }
  return new NextRequest('http://localhost/api/shopify', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const ALLOWED_BODY = { operation: 'GetCart', variables: { cartId: 'gid://shopify/Cart/1' } }

// Shopify returns this shape on success
const SHOPIFY_SUCCESS = { data: { cart: null } }

/**
 * Shopify stamps every response with the version that served it, and this route
 * reads it to detect a fall-forward (ADR 009). Without it these mocks provoke a
 * real "API VERSION MISMATCH" error on a passing test — and a warning that fires
 * when nothing is wrong is how a reader learns to skip the one that matters.
 */
const SHOPIFY_VERSION_HEADER = { 'X-Shopify-API-Version': shopifyPublicConfig.apiVersion }

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/shopify', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('request validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const req = makeReq('not-json', { contentType: 'application/json' })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/invalid json/i)
    })

    it('returns 400 when operation field is missing', async () => {
      const req = makeReq({ variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/operation/i)
    })

    it('returns 400 when operation is an empty string', async () => {
      const req = makeReq({ operation: '', variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when operation is not a string', async () => {
      const req = makeReq({ operation: 123, variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when variables field is missing', async () => {
      const req = makeReq({ operation: 'GetCart' })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/variables/i)
    })

    it('returns 413 when content-length header exceeds limit', async () => {
      const req = makeReq(ALLOWED_BODY, { contentLength: 99_999 })
      const res = await POST(req)
      expect(res.status).toBe(413)
    })

    it('returns 403 for an operation key not in the persisted-query map', async () => {
      const req = makeReq({ operation: 'DeleteProduct', variables: { id: '1' } })
      const res = await POST(req)
      expect(res.status).toBe(403)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/operation not permitted/i)
    })

    // Regression: a plain {}-literal persisted-query map inherits from
    // Object.prototype, so these keys would resolve to a truthy inherited
    // function and slip past the "unknown operation" check.
    for (const operation of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      it(`returns 403 for the inherited-prototype operation key "${operation}"`, async () => {
        const req = makeReq({ operation, variables: {} })
        const res = await POST(req)
        expect(res.status).toBe(403)
      })
    }

    it('ignores a client-supplied query string — only the operation key is trusted', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'test-token')
      let sentBody: string | undefined
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        sentBody = init?.body as string
        return new Response(JSON.stringify(SHOPIFY_SUCCESS), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...SHOPIFY_VERSION_HEADER },
        })
      })
      const req = makeReq({
        operation: 'GetCart',
        // An attacker-controlled query string smuggled alongside a valid
        // operation key. It must never reach Shopify.
        query: 'mutation DeleteEverything { productDelete(input: {}) { deletedProductId } }',
        variables: { cartId: 'gid://shopify/Cart/1' },
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(sentBody).toBeDefined()
      const parsedBody = JSON.parse(sentBody as string) as { query: string }
      expect(parsedBody.query).not.toMatch(/DeleteEverything|productDelete/)
      expect(parsedBody.query).toMatch(/query GetCart/)
    })
  })

  describe('allowed operations reach Shopify', () => {
    const allowedOps = ['GetCart', 'CreateCart', 'AddToCart', 'UpdateCartLines', 'RemoveFromCart']

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'test-token')
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(SHOPIFY_SUCCESS), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...SHOPIFY_VERSION_HEADER },
        })
      )
    })

    for (const operation of allowedOps) {
      it(`allows operation: ${operation}`, async () => {
        const req = makeReq({ operation, variables: { cartId: 'gid://shopify/Cart/1' } })
        const res = await POST(req)
        expect(res.status).toBe(200)
      })
    }
  })

  describe('Shopify integration errors', () => {
    it('returns 503 when NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'some-token')
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(503)
    })

    it('returns 503 when SHOPIFY_STOREFRONT_ACCESS_TOKEN is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', '')
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(503)
    })

    it('returns 502 when fetch throws a network error', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      vi.mocked(fetch).mockRejectedValue(new Error('Network failure'))
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(502)
    })

    it('propagates non-OK Shopify status code', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      // Version header present even on the 401: Shopify stamps every response, and
      // a rejected credential is not a reason to also report a phantom version drift.
      vi.mocked(fetch).mockResolvedValue(
        new Response('Unauthorized', { status: 401, headers: SHOPIFY_VERSION_HEADER })
      )
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('returns 502 when Shopify response body is not valid JSON', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      vi.mocked(fetch).mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'text/plain', ...SHOPIFY_VERSION_HEADER },
        })
      )
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(502)
    })

    it('returns 200 and Shopify data on successful proxy', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(SHOPIFY_SUCCESS), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...SHOPIFY_VERSION_HEADER },
        })
      )
      const req = makeReq(ALLOWED_BODY)
      const res = await POST(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual(SHOPIFY_SUCCESS)
    })

    it('calls fetch with correct Shopify endpoint and headers', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'mystore.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'secret-token')
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(SHOPIFY_SUCCESS), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...SHOPIFY_VERSION_HEADER },
        })
      )
      const req = makeReq(ALLOWED_BODY)
      await POST(req)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('mystore.myshopify.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Shopify-Storefront-Access-Token': 'secret-token',
          }),
        })
      )
    })
  })
})

/**
 * This route is public and unauthenticated by necessity — the browser has to
 * reach it — and it spends the store's Shopify API quota and creates real
 * carts. It had no limiter at all, while `/api/contact` (which sends an email)
 * had one added after a security audit. The softer target was the one that
 * costs money.
 */
describe('rate limiting', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { cart: null } }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function reqFrom(ip: string): NextRequest {
    return new NextRequest('http://localhost/api/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ operation: 'GetCart', variables: { cartId: 'gid://x/1' } }),
    })
  }

  it('refuses a caller that exceeds the window', async () => {
    const ip = '203.0.113.10'
    let sawLimit = false
    // The limit is deliberately generous (a real checkout is several
    // operations), so this pushes well past it rather than guessing the exact
    // boundary — the contract is "there is a ceiling", not "it is exactly 60".
    for (let i = 0; i < 80; i += 1) {
      const res = await POST(reqFrom(ip))
      if (res.status === 429) {
        sawLimit = true
        break
      }
    }
    expect(sawLimit, 'the proxy never rate-limited an abusive caller').toBe(true)
  })

  it('tells the caller when to come back', async () => {
    const ip = '203.0.113.11'
    let limited: Response | null = null
    for (let i = 0; i < 80; i += 1) {
      const res = await POST(reqFrom(ip))
      if (res.status === 429) {
        limited = res
        break
      }
    }
    expect(limited?.headers.get('Retry-After')).toBeTruthy()
  })

  it('buckets by client IP, so one abuser cannot lock out everyone', async () => {
    const abuser = '203.0.113.12'
    for (let i = 0; i < 80; i += 1) await POST(reqFrom(abuser))

    // A different shopper, on a different address, is unaffected.
    const res = await POST(reqFrom('198.51.100.7'))
    expect(res.status).not.toBe(429)
  })

  it('reads the original client from a proxy chain, not the edge', async () => {
    // `x-forwarded-for` is a chain; taking the last entry would bucket every
    // request behind Vercel's own edge into one, and the first genuine shopper
    // would rate-limit the entire site.
    const { clientIp } = await import('@/lib/utils/rateLimit')
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.20, 70.41.3.18, 150.172.238.178' })
    expect(clientIp(headers)).toBe('203.0.113.20')
  })
})
