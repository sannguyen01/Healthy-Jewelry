import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const VALID_DOMAIN = 'test-store.myshopify.com'
const VALID_TOKEN = 'test-token-abc123'

function shopifyProductNode(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'arc-band-titanium',
    title: 'Arc Band',
    description: 'A titanium ring.',
    tags: ['rings', 'titanium'],
    priceRange: { minVariantPrice: { amount: '89.00', currencyCode: 'USD' } },
    compareAtPriceRange: { minVariantPrice: null },
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/1-a',
            title: '5',
            availableForSale: true,
            price: { amount: '89.00', currencyCode: 'USD' },
            compareAtPrice: null,
            selectedOptions: [{ name: 'Size', value: '5' }],
          },
        },
        {
          node: {
            id: 'gid://shopify/ProductVariant/1-b',
            title: '6',
            availableForSale: true,
            price: { amount: '89.00', currencyCode: 'USD' },
            compareAtPrice: null,
            selectedOptions: [{ name: 'Size', value: '6' }],
          },
        },
      ],
    },
    collections: { edges: [{ node: { handle: 'rings', title: 'Rings' } }] },
    ...overrides,
  }
}

function mockJsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  warnSpy.mockRestore()
})

describe('lib/shopify/index — not configured (falls back to static data)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', '')
  })

  it('getProduct returns the static product by handle', async () => {
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.handle).toBe('arc-band-titanium')
  })

  it('getProduct returns null for an unknown handle', async () => {
    const { getProduct } = await import('@/lib/shopify')
    expect(await getProduct('does-not-exist')).toBeNull()
  })

  it('getProducts returns the full static catalog', async () => {
    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts()
    expect(products.length).toBe(17)
  })

  it('getProductsByCollection returns static products for that collection', async () => {
    const { getProductsByCollection } = await import('@/lib/shopify')
    const products = await getProductsByCollection('bracelets')
    expect(products.every((p) => p.collection === 'bracelets')).toBe(true)
  })

  it('searchProducts filters the static catalog by query', async () => {
    const { searchProducts } = await import('@/lib/shopify')
    const results = await searchProducts('titanium')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((p) => p.tags.includes('titanium'))).toBe(true)
  })

  it('getBestsellers returns static bestseller products', async () => {
    const { getBestsellers } = await import('@/lib/shopify')
    const results = await getBestsellers()
    expect(results.every((p) => p.badge === 'Bestseller')).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })

  it('getNewArrivals returns static new-arrival products', async () => {
    const { getNewArrivals } = await import('@/lib/shopify')
    const results = await getNewArrivals()
    expect(results.every((p) => p.badge === 'New')).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('lib/shopify/index — configured (live Shopify mapping)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)
  })

  it('getProduct maps a Shopify product, including its full variants array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockJsonResponse({ data: { product: shopifyProductNode() } }))
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')

    expect(product?.handle).toBe('arc-band-titanium')
    expect(product?.price).toBe('89.00')
    expect(product?.collection).toBe('rings')
    expect(product?.variants).toHaveLength(2)
    expect(product?.defaultVariantId).toBe('gid://shopify/ProductVariant/1-a')
  })

  it('maps the bestseller tag to a Bestseller badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ tags: ['rings', 'bestseller'] }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.badge).toBe('Bestseller')
  })

  it('maps the new tag to a New badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ data: { product: shopifyProductNode({ tags: ['rings', 'new'] }) } })
        )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.badge).toBe('New')
  })

  it('bestseller tag takes priority over new when both are present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ tags: ['rings', 'bestseller', 'new'] }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.badge).toBe('Bestseller')
  })

  it('maps an active compare-at price to a Sale badge when no bestseller/new tag is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            product: shopifyProductNode({
              compareAtPriceRange: { minVariantPrice: { amount: '130.00', currencyCode: 'USD' } },
            }),
          },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.badge).toBe('Sale')
    expect(product?.compareAtPrice).toBe('130.00')
  })

  it('treats a "0.0" compare-at price as no discount (null, no Sale badge)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            product: shopifyProductNode({
              compareAtPriceRange: { minVariantPrice: { amount: '0.0', currencyCode: 'USD' } },
            }),
          },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.compareAtPrice).toBeNull()
    expect(product?.badge).toBeNull()
  })

  it('has no badge when there is no bestseller/new tag and no compare-at price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockJsonResponse({ data: { product: shopifyProductNode() } }))
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.badge).toBeNull()
  })

  it('resolves svgType from a svg: tag when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ tags: ['rings', 'svg:ring-dome'] }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.svgType).toBe('ring-dome')
  })

  it('falls back to a handle-keyword heuristic for svgType when no svg: tag is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ handle: 'bar-necklace-titanium', tags: [] }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('bar-necklace-titanium')
    expect(product?.svgType).toBe('necklace-drop')
  })

  it('warns and defaults svgType to ring-arc when no tag or handle keyword matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ handle: 'mystery-item', tags: [] }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('mystery-item')
    expect(product?.svgType).toBe('ring-arc')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('svg type unresolved'),
      expect.objectContaining({ handle: 'mystery-item' })
    )
  })

  it('falls back rather than passing an unknown svg tag through to the renderer', async () => {
    // The live catalog tags products `svg:ring-halo`, `svg:charm-star` and six
    // other names. Those used to be cast straight to HJSvgType and handed to
    // JewelrySVG, which returned null — a blank tile with no error anywhere.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            product: shopifyProductNode({
              handle: 'invented-item',
              tags: ['svg:not-a-real-shape'],
            }),
          },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('invented-item')
    expect(product?.svgType).toBe('ring-arc')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('svg type unresolved'),
      expect.objectContaining({ unknownTag: 'not-a-real-shape' })
    )
  })

  it('warns and defaults collection to rings when the product has no collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { product: shopifyProductNode({ collections: { edges: [] } }) },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.collection).toBe('rings')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing collection'),
      expect.objectContaining({ handle: 'arc-band-titanium' })
    )
  })

  it('falls back to static data when Shopify returns no product for the handle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ data: { product: null } })))
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.handle).toBe('arc-band-titanium')
  })

  it('falls back to static data when the Shopify fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product?.handle).toBe('arc-band-titanium')
  })

  it('getProducts paginates through Shopify pages and maps every product', async () => {
    const page1 = {
      data: {
        products: {
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          edges: [{ node: shopifyProductNode({ id: 'gid://shopify/Product/1' }) }],
        },
      },
    }
    const page2 = {
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
          edges: [{ node: shopifyProductNode({ id: 'gid://shopify/Product/2' }) }],
        },
      },
    }
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(page1))
      .mockResolvedValueOnce(mockJsonResponse(page2))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts()
    expect(products).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('getProducts falls back to static data when Shopify returns zero products', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { products: { pageInfo: { hasNextPage: false, endCursor: '' }, edges: [] } },
        })
      )
    )
    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts()
    expect(products.length).toBe(17)
  })

  it('getProductsByCollection maps live Shopify products for the collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: { collection: { products: { edges: [{ node: shopifyProductNode() }] } } },
        })
      )
    )
    const { getProductsByCollection } = await import('@/lib/shopify')
    const products = await getProductsByCollection('rings')
    expect(products).toHaveLength(1)
    expect(products[0].collection).toBe('rings')
  })

  it('getProductsByCollection falls back to static when the collection has no products', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(mockJsonResponse({ data: { collection: { products: { edges: [] } } } }))
    )
    const { getProductsByCollection } = await import('@/lib/shopify')
    const products = await getProductsByCollection('bracelets')
    expect(products.length).toBeGreaterThan(0)
    expect(products.every((p) => p.collection === 'bracelets')).toBe(true)
  })

  it('searchProducts maps live Shopify search results', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ data: { search: { edges: [{ node: shopifyProductNode() }] } } })
        )
    )
    const { searchProducts } = await import('@/lib/shopify')
    const results = await searchProducts('arc band')
    expect(results).toHaveLength(1)
  })

  it('searchProducts returns an empty array when the Shopify search fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { searchProducts } = await import('@/lib/shopify')
    expect(await searchProducts('arc band')).toEqual([])
  })

  it('getBestsellers queries Shopify with a bestseller tag filter and maps results', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ data: { products: { edges: [{ node: shopifyProductNode() }] } } })
      )
    vi.stubGlobal('fetch', mockFetch)

    const { getBestsellers } = await import('@/lib/shopify')
    const results = await getBestsellers()
    expect(results).toHaveLength(1)
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as { query: string }
    expect(body.query).toContain('GetBestsellers')
  })

  it('getBestsellers falls back to static data when Shopify returns zero results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockJsonResponse({ data: { products: { edges: [] } } }))
    )
    const { getBestsellers } = await import('@/lib/shopify')
    const results = await getBestsellers()
    expect(results.every((p) => p.badge === 'Bestseller')).toBe(true)
  })

  it('getNewArrivals queries Shopify with a new tag filter and maps results', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ data: { products: { edges: [{ node: shopifyProductNode() }] } } })
      )
    vi.stubGlobal('fetch', mockFetch)

    const { getNewArrivals } = await import('@/lib/shopify')
    const results = await getNewArrivals()
    expect(results).toHaveLength(1)
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as { query: string }
    expect(body.query).toContain('GetNewArrivals')
  })

  it('getNewArrivals falls back to static data when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { getNewArrivals } = await import('@/lib/shopify')
    const results = await getNewArrivals()
    expect(results.every((p) => p.badge === 'New')).toBe(true)
  })
})
