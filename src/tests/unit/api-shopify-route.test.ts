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
  opts: { contentLength?: number; contentType?: string } = {},
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

const ALLOWED_BODY = {
  query: 'query GetProducts { products { edges { node { id } } } }',
  variables: {},
}

// Shopify returns this shape on success
const SHOPIFY_SUCCESS = { data: { products: { edges: [] } } }

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

    it('returns 400 when query field is missing', async () => {
      const req = makeReq({ variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/query/i)
    })

    it('returns 400 when query is an empty string', async () => {
      const req = makeReq({ query: '', variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when query is not a string', async () => {
      const req = makeReq({ query: 123, variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when variables field is missing', async () => {
      const req = makeReq({ query: 'query GetProducts { products { edges { node { id } } } }' })
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

    it('returns 403 for an anonymous operation (no name)', async () => {
      const req = makeReq({ query: 'query { products { edges { node { id } } } }', variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(403)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/operation not permitted/i)
    })

    it('returns 403 for a mutation not in the allowlist', async () => {
      const req = makeReq({
        query: 'mutation DeleteProduct($id: ID!) { productDelete(input: { id: $id }) { deletedProductId } }',
        variables: { id: '1' },
      })
      const res = await POST(req)
      expect(res.status).toBe(403)
    })

    it('returns 403 for an unknown query name', async () => {
      const req = makeReq({ query: 'query GetSecret { secretData { id } }', variables: {} })
      const res = await POST(req)
      expect(res.status).toBe(403)
    })
  })

  describe('allowed operations reach Shopify', () => {
    const allowedOps = [
      { name: 'GetProductByHandle', query: 'query GetProductByHandle($handle: String!) { productByHandle(handle: $handle) { id } }', variables: { handle: 'test' } },
      { name: 'GetProducts', query: 'query GetProducts { products(first: 10) { edges { node { id } } } }', variables: {} },
      { name: 'GetCollections', query: 'query GetCollections { collections(first: 4) { edges { node { id } } } }', variables: {} },
      { name: 'CreateCart', query: 'mutation CreateCart($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { id checkoutUrl } } }', variables: { lines: [] } },
    ]

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'test-token')
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(SHOPIFY_SUCCESS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    for (const op of allowedOps) {
      it(`allows operation: ${op.name}`, async () => {
        const req = makeReq({ query: op.query, variables: op.variables })
        const res = await POST(req)
        expect(res.status).toBe(200)
      })
    }
  })

  describe('Shopify integration errors', () => {
    it('returns 503 when NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'some-token')
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
      const res = await POST(req)
      expect(res.status).toBe(503)
    })

    it('returns 503 when SHOPIFY_STOREFRONT_ACCESS_TOKEN is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', '')
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
      const res = await POST(req)
      expect(res.status).toBe(503)
    })

    it('returns 502 when fetch throws a network error', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      vi.mocked(fetch).mockRejectedValue(new Error('Network failure'))
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
      const res = await POST(req)
      expect(res.status).toBe(502)
    })

    it('propagates non-OK Shopify status code', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test.myshopify.com')
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'token')
      vi.mocked(fetch).mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      )
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
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
        }),
      )
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
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
        }),
      )
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
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
        }),
      )
      const req = makeReq({
        query: 'query GetProducts { products(first: 1) { edges { node { id } } } }',
        variables: {},
      })
      await POST(req)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('mystore.myshopify.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Shopify-Storefront-Access-Token': 'secret-token',
          }),
        }),
      )
    })
  })
})
