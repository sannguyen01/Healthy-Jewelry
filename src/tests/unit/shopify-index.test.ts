import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyPublicConfig } from '@/config/shopify-public'

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

/**
 * Headers included on purpose. Real Shopify responses always carry
 * `X-Shopify-API-Version`, and `shopifyFetch` reads it to detect a fall-forward
 * (ADR 009). A mock without it is not a smaller version of a Shopify response —
 * it is a different shape, and this project has already been burned by fixtures
 * that agreed with the code rather than with the store.
 */
function mockJsonResponse(body: unknown, apiVersion: string = shopifyPublicConfig.apiVersion) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'x-shopify-api-version': apiVersion }),
    json: async () => body,
  }
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
      expect.stringContaining('no recognised collection'),
      expect.objectContaining({ handle: 'arc-band-titanium', ignored: [] })
    )
  })

  /**
   * The live case, through the whole mapper rather than the parser alone.
   *
   * `arc-band-titanium` really is in `['frontpage', 'rings']`, built-in first, and the
   * old `edges[0] as HJCollectionHandle` cast produced `'frontpage'` — a value the type
   * says cannot exist, which the product page then linked to as `/shop/frontpage`, a
   * hard 404 under `dynamicParams = false`.
   */
  it("maps a product in Shopify's built-in frontpage collection to its real one", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            product: shopifyProductNode({
              collections: {
                edges: [
                  { node: { handle: 'frontpage', title: 'Home page' } },
                  { node: { handle: 'rings', title: 'Rings' } },
                ],
              },
            }),
          },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')

    expect(product?.collection).toBe('rings')
    // Silently, too: a built-in is expected, and warning about it every render is
    // how the one warning that matters gets filtered out.
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('no recognised collection'),
      expect.anything()
    )
  })

  it('names an unservable collection rather than only reporting the fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            product: shopifyProductNode({
              collections: { edges: [{ node: { handle: 'spectrum', title: 'Spectrum' } }] },
            }),
          },
        })
      )
    )
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')

    expect(product?.collection).toBe('rings')
    // "Defaulted to rings" and "defaulted to rings because this product lives in a
    // collection with no page" call for different responses from whoever reads the log.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no recognised collection'),
      expect.objectContaining({ ignored: ['spectrum'] })
    )
  })

  it('returns null — not the static fallback — when a configured Shopify answers with no product', async () => {
    // A well-formed `data: { product: null }` is Shopify's authoritative "this handle
    // does not exist", not a platform failure. Falling back here would serve a
    // fabricated-GID static product that renders but cannot complete checkout — see the
    // getProduct doc comment and docs/adr/004-static-fallback-is-not-a-data-source.md.
    // `arc-band-titanium` is deliberately a handle the static catalogue *does* have, so
    // this proves the null wins over the fallback rather than merely being untested.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ data: { product: null } })))
    const { getProduct } = await import('@/lib/shopify')
    const product = await getProduct('arc-band-titanium')
    expect(product).toBeNull()
  })

  it('still falls back to static data when Shopify is unreachable, unlike a real null product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'empty-response' })
    )
    errorSpy.mockRestore()
  })

  it('getProductsByCollection falls back to static, reporting collection-not-found, when the handle matches no Shopify collection', async () => {
    // `collection: null` (handle drift between the Next.js route and Shopify Admin)
    // used to be indistinguishable from an empty-but-real collection — both hit the
    // same `edges.length === 0` branch and logged identically as `empty-response`.
    // The product list still degrades the same way (an empty list carries no
    // fabricated-page risk, unlike getProduct's single-entity case), but the fallback
    // reason must name the actual cause so handle drift doesn't hide in logs that are
    // expected to be noisy during a normal restock gap.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockJsonResponse({ data: { collection: null } }))
    )
    const { getProductsByCollection } = await import('@/lib/shopify')
    const products = await getProductsByCollection('bracelets')
    expect(products.length).toBeGreaterThan(0)
    expect(products.every((p) => p.collection === 'bracelets')).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'collection-not-found' })
    )
    errorSpy.mockRestore()
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

  it('searchProducts falls back to the static catalogue when the Shopify search fails', async () => {
    // Previously asserted `[]`, which encoded a real defect: an empty result is
    // rendered as a confident `No results for "arc band"`, telling the customer
    // the product does not exist when the truth is that Shopify did not answer.
    // Every sibling fetcher already degrades to the static catalogue; search was
    // the only one that did not, and nothing noticed because — until the search
    // page was migrated off `hj-data` — nothing called it.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { searchProducts } = await import('@/lib/shopify')

    const results = await searchProducts('arc band')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((p) => p.title.toLowerCase().includes('arc band'))).toBe(true)
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
