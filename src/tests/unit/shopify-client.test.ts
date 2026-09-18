import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShopifyFetchError } from '@/lib/shopify/client'
import { shopifyPublicConfig } from '@/config/shopify-public'

// shopifyFetch is imported inside each test after env stubs are set
// to ensure getEnv() picks up the mocked values.

/**
 * What Shopify actually puts on a response, including the error ones.
 *
 * `X-Shopify-API-Version` is present on every Shopify reply and is how a
 * fall-forward is detected (ADR 009), so a mock omitting it is the wrong shape
 * rather than a simpler one. It is on the failure mocks too, deliberately: a
 * retired version can *cause* the error, so that is exactly when knowing which
 * version answered matters most.
 */
function shopifyHeaders(apiVersion: string = shopifyPublicConfig.apiVersion): Headers {
  return new Headers({ 'x-shopify-api-version': apiVersion })
}

describe('ShopifyFetchError', () => {
  it('is an instance of Error', () => {
    const err = new ShopifyFetchError('something went wrong')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name ShopifyFetchError', () => {
    const err = new ShopifyFetchError('oops')
    expect(err.name).toBe('ShopifyFetchError')
  })

  it('exposes the status property', () => {
    const err = new ShopifyFetchError('bad status', 500)
    expect(err.status).toBe(500)
  })

  it('exposes the errors array', () => {
    const errors = [{ message: 'Not found' }]
    const err = new ShopifyFetchError('graphql error', 200, errors)
    expect(err.errors).toEqual(errors)
  })

  it('has undefined status and errors when not provided', () => {
    const err = new ShopifyFetchError('network issue')
    expect(err.status).toBeUndefined()
    expect(err.errors).toBeUndefined()
  })

  it('message is accessible', () => {
    const err = new ShopifyFetchError('test message', 404)
    expect(err.message).toBe('test message')
  })
})

describe('shopifyFetch', () => {
  const VALID_DOMAIN = 'test-store.myshopify.com'
  const VALID_TOKEN = 'test-token-abc123'

  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('throws ShopifyFetchError when NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const { shopifyFetch } = await import('@/lib/shopify/client')

    await expect(shopifyFetch('{ shop { name } }')).rejects.toThrow(
      'Missing required environment variable: NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN'
    )
  })

  it('throws ShopifyFetchError on network error', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed'))
    vi.stubGlobal('fetch', mockFetch)

    const { shopifyFetch } = await import('@/lib/shopify/client')

    await expect(shopifyFetch('{ shop { name } }')).rejects.toThrow(ShopifyFetchError)
    await expect(shopifyFetch('{ shop { name } }')).rejects.toThrow('Network error')
  })

  it('throws ShopifyFetchError on HTTP error response', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: shopifyHeaders(),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { shopifyFetch } = await import('@/lib/shopify/client')

    await expect(shopifyFetch('{ shop { name } }')).rejects.toThrow(ShopifyFetchError)
    await expect(shopifyFetch('{ shop { name } }')).rejects.toThrow('HTTP 500')
  })

  it('returns data on successful response', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const payload = { data: { product: { id: '1' } } }
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: shopifyHeaders(),
      json: async () => payload,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { shopifyFetch } = await import('@/lib/shopify/client')

    const result = await shopifyFetch<{ product: { id: string } }>('{ product { id } }')
    expect(result.data).toEqual({ product: { id: '1' } })
  })

  it('throws ShopifyFetchError when response contains GraphQL errors', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const payload = { data: null, errors: [{ message: 'Not found' }] }
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: shopifyHeaders(),
      json: async () => payload,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { shopifyFetch } = await import('@/lib/shopify/client')

    await expect(shopifyFetch('{ product { id } }')).rejects.toThrow(ShopifyFetchError)
    await expect(shopifyFetch('{ product { id } }')).rejects.toThrow('Not found')
  })

  it('calls fetch with POST method and correct headers', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)

    const payload = { data: { shop: { name: 'Test' } } }
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: shopifyHeaders(),
      json: async () => payload,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { shopifyFetch } = await import('@/lib/shopify/client')
    await shopifyFetch('{ shop { name } }')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(VALID_DOMAIN)
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token']).toBe(
      VALID_TOKEN
    )
  })

  /**
   * **The caching options, which decide whether a page is ever revalidated.**
   *
   * These six branches were the last uncovered ones in this file, and the file
   * was sitting at exactly 80.0% branch coverage — passing the new per-file
   * floor by zero margin, so the next unrelated edit would have failed the gate
   * for nobody's mistake. They are also not cosmetic: `next.tags` is what the
   * Shopify webhook's `revalidateTag` calls act on, so a request that fails to
   * register its tags is a page that no webhook can ever refresh.
   */
  describe('cache options reach fetch in the shape Next expects', () => {
    // The enclosing `beforeEach` only *clears* stubs — each test in this file
    // sets its own, so these cases set theirs too rather than relying on a
    // sibling having run first.
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
      vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)
    })

    async function callWith(options?: {
      cache?: RequestCache
      revalidate?: number
      tags?: string[]
    }) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: shopifyHeaders(),
        json: async () => ({ data: { shop: { name: 'HJ' } } }),
      })
      vi.stubGlobal('fetch', mockFetch)
      const { shopifyFetch } = await import('@/lib/shopify/client')
      await shopifyFetch('{ shop { name } }', undefined, options)
      return (mockFetch.mock.calls[0] as [string, RequestInit])[1]
    }

    it('sets next.revalidate alone when only a window is given', async () => {
      const init = await callWith({ revalidate: 3600 })
      expect(init.next).toEqual({ revalidate: 3600 })
      expect(init.cache).toBeUndefined()
    })

    it('sets next.tags alone when only tags are given', async () => {
      const init = await callWith({ tags: ['products'] })
      expect(init.next).toEqual({ tags: ['products'] })
    })

    it('sets both when both are given', async () => {
      const init = await callWith({ revalidate: 60, tags: ['products', 'product:arc-band'] })
      expect(init.next).toEqual({ revalidate: 60, tags: ['products', 'product:arc-band'] })
    })

    it('honours revalidate: 0, which `!== undefined` exists to distinguish from absent', async () => {
      // `0` is falsy. A truthiness check here would silently drop "never cache
      // this" and fall through to the `cache` branch instead.
      const init = await callWith({ revalidate: 0 })
      expect(init.next).toEqual({ revalidate: 0 })
    })

    it('falls through to cache only when neither revalidate nor tags is given', async () => {
      const init = await callWith({ cache: 'no-store' })
      expect(init.cache).toBe('no-store')
      expect(init.next).toBeUndefined()
    })

    it('ignores cache when a revalidate window is also given', async () => {
      // Next rejects `cache` and `next.revalidate` together; sending both is the
      // configuration error this branch ordering exists to prevent.
      const init = await callWith({ cache: 'no-store', revalidate: 3600 })
      expect(init.next).toEqual({ revalidate: 3600 })
      expect(init.cache).toBeUndefined()
    })

    it('sends neither when no options are given at all', async () => {
      const init = await callWith()
      expect(init.next).toBeUndefined()
      expect(init.cache).toBeUndefined()
    })

    it('sends an empty variables object rather than omitting the field', async () => {
      // Shopify rejects a GraphQL request whose `variables` is absent for an
      // operation that declares any, and `?? {}` is what stops that.
      const init = await callWith()
      expect(JSON.parse(String(init.body)).variables).toEqual({})
    })
  })
})
