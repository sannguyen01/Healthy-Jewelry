import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShopifyFetchError } from '@/lib/shopify/client'

// shopifyFetch is imported inside each test after env stubs are set
// to ensure getEnv() picks up the mocked values.

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
})
