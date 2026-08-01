import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

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
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
      vi.mocked(fetch).mockResolvedValue(new Response('Unauthorized', { status: 401 }))
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
          headers: { 'Content-Type': 'text/plain' },
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
          headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
