import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyPublicConfig } from '@/config/shopify-public'

/**
 * **`getProducts` pagination: the bound, the stalls, and the silent fallback.**
 *
 * The loop this file guards was:
 *
 * ```ts
 * while (hasMore && all.length < maxItems) {
 *   const page = (await shopifyFetch(GET_PRODUCTS, { first: 50, after: cursor })).data
 *   const { edges, pageInfo } = page.products
 *   all.push(...edges.map(...))
 *   hasMore = pageInfo.hasNextPage
 *   cursor  = pageInfo.endCursor
 * }
 * ```
 *
 * Four separate things are wrong with it, and none is reachable from the tests
 * that existed — `shopify-index.test.ts` covered one two-page walk where every
 * page behaved, which is the case that never breaks:
 *
 *   1. `maxItems` is tested before the fetch and the fetch asks for a fixed 50,
 *      so the returned array overshoots by up to 49. `getProducts(10)` returned
 *      fifty products.
 *   2. `hasNextPage: true` with `edges: []` — an ordinary answer for a page
 *      whose nodes are all outside the storefront's publication scope — leaves
 *      `all.length` unchanged and `hasMore` true. The loop never exits.
 *   3. A server that echoes the cursor it was given re-serves page one forever,
 *      accumulating duplicates until `maxItems`.
 *   4. `.data` is `undefined` for a 200 carrying neither `data` nor `errors`, so
 *      `page.products` threw a `TypeError` into a `catch` that reports only
 *      `ShopifyFetchError`. The site served the bundled catalogue and logged
 *      nothing — the exact silence `reportFallback` exists to end.
 *
 * Cases 2 and 3 are *non-terminating*, which is why each one here asserts a
 * bounded call count rather than only a returned value: a test that merely
 * awaited the result would hang the suite rather than fail it.
 */

const VALID_DOMAIN = 'test-store.myshopify.com'
const VALID_TOKEN = 'test-token-abc123'

function productNode(id: string) {
  return {
    id: `gid://shopify/Product/${id}`,
    handle: `product-${id}`,
    title: `Product ${id}`,
    description: 'A titanium piece.',
    tags: ['rings', 'titanium'],
    priceRange: { minVariantPrice: { amount: '89.00', currencyCode: 'USD' } },
    compareAtPriceRange: { minVariantPrice: null },
    variants: {
      edges: [
        {
          node: {
            id: `gid://shopify/ProductVariant/${id}-a`,
            title: '5',
            availableForSale: true,
            price: { amount: '89.00', currencyCode: 'USD' },
            compareAtPrice: null,
            selectedOptions: [{ name: 'Size', value: '5' }],
          },
        },
      ],
    },
    collections: { edges: [{ node: { handle: 'rings', title: 'Rings' } }] },
  }
}

/** Headers included because `shopifyFetch` reads the API version off them (ADR 009). */
function mockJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'x-shopify-api-version': shopifyPublicConfig.apiVersion }),
    json: async () => body,
  }
}

function page(opts: { ids: string[]; hasNextPage: boolean; endCursor: string | null }) {
  return mockJsonResponse({
    data: {
      products: {
        pageInfo: { hasNextPage: opts.hasNextPage, endCursor: opts.endCursor },
        edges: opts.ids.map((id) => ({ node: productNode(id) })),
      },
    },
  })
}

/** The `first:` value sent on call `n`, read back off the request body. */
function requestedFirst(mockFetch: ReturnType<typeof vi.fn>, n: number): number {
  const init = mockFetch.mock.calls[n]?.[1] as RequestInit | undefined
  const body = JSON.parse(String(init?.body)) as { variables?: { first?: number } }
  return Number(body.variables?.first)
}

/** The `after:` cursor sent on call `n`. */
function requestedAfter(mockFetch: ReturnType<typeof vi.fn>, n: number): string | null {
  const init = mockFetch.mock.calls[n]?.[1] as RequestInit | undefined
  const body = JSON.parse(String(init?.body)) as { variables?: { after?: string | null } }
  return body.variables?.after ?? null
}

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', VALID_DOMAIN)
  vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', VALID_TOKEN)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('maxItems is a ceiling, not a suggestion', () => {
  it('never returns more products than asked for, even when one page holds more', async () => {
    // The old loop asked for a fixed 50 and checked the ceiling only between
    // pages, so this call returned every one of the fifty.
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        page({ ids: Array.from({ length: 50 }, (_, i) => String(i)), hasNextPage: true, endCursor: 'c1' })
      )
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(10)

    expect(products).toHaveLength(10)
  })

  it('asks the server for only what is still owed', async () => {
    // Slicing the response would satisfy the assertion above on its own while
    // still transferring five times the data. The request is the other half.
    const mockFetch = vi.fn().mockResolvedValue(page({ ids: ['1'], hasNextPage: false, endCursor: 'c1' }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts, PRODUCTS_PAGE_SIZE } = await import('@/lib/shopify')
    await getProducts(10)

    expect(requestedFirst(mockFetch, 0)).toBe(10)
    expect(PRODUCTS_PAGE_SIZE).toBe(50)
  })

  it('caps the page size at PRODUCTS_PAGE_SIZE when far more is owed', async () => {
    const mockFetch = vi.fn().mockResolvedValue(page({ ids: ['1'], hasNextPage: false, endCursor: 'c' }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts, PRODUCTS_PAGE_SIZE } = await import('@/lib/shopify')
    await getProducts(500)

    expect(requestedFirst(mockFetch, 0)).toBe(PRODUCTS_PAGE_SIZE)
  })

  it('narrows the request as the budget is spent across pages', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        page({ ids: Array.from({ length: 50 }, (_, i) => `a${i}`), hasNextPage: true, endCursor: 'c1' })
      )
      .mockResolvedValueOnce(page({ ids: ['b0'], hasNextPage: false, endCursor: 'c2' }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(60)

    expect(requestedFirst(mockFetch, 0)).toBe(50)
    expect(requestedFirst(mockFetch, 1), 'the second page asked for 50 again').toBe(10)
    expect(products).toHaveLength(51)
  })

  it('rejects a non-positive ceiling at the call site instead of degrading quietly', async () => {
    // Deliberately a throw, not a fallback. Every other failure in this function
    // returns the bundled catalogue, so validating inside the try would turn a
    // caller's bug into a storefront silently serving static data.
    const { getProducts } = await import('@/lib/shopify')

    await expect(getProducts(0)).rejects.toThrow(RangeError)
    await expect(getProducts(-1)).rejects.toThrow(/positive integer/)
    await expect(getProducts(2.5)).rejects.toThrow(/positive integer/)
    await expect(getProducts(Number.NaN)).rejects.toThrow(/positive integer/)
  })
})

describe('pagination that stops making progress terminates and says so', () => {
  it('stops when a page claims more but returns no edges', async () => {
    // `hasNextPage: true, edges: []` is what Shopify answers for a page whose
    // nodes are all outside the storefront's publication scope. Under the old
    // loop `all.length` never grew, so `all.length < maxItems` stayed true and
    // `hasMore` stayed true: an unbounded request loop inside a server render.
    //
    // **The cursor advances on every call here, deliberately.** The first draft
    // of this fixture returned the same `endCursor` each time, which meant the
    // cursor-echo check terminated the loop on call two — so deleting the
    // empty-edges check entirely left all sixteen tests green. A mutation run
    // caught it. With a moving cursor nothing but this check can stop the walk.
    let n = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      n += 1
      return page({ ids: [], hasNextPage: true, endCursor: `cursor-${n}` })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(250)

    expect(mockFetch.mock.calls.length, 'the walk continued past an empty page').toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: 'pagination-stalled',
        detail: expect.stringContaining('no edges'),
      })
    )
    // Nothing was collected, so the bundled catalogue is served — and reported.
    expect(products.length).toBe(17)
  })

  it('stops when the server does not advance the cursor', async () => {
    // A cursor echoed back re-serves page one. The old loop would have returned
    // `maxItems` copies of the same fifty products, which is worse than an
    // error: a catalogue page of duplicates looks like data.
    const mockFetch = vi
      .fn()
      .mockResolvedValue(page({ ids: ['1', '2'], hasNextPage: true, endCursor: 'stuck' }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(250)

    // Call 1 sends `after: null` and receives `stuck`; call 2 sends `after:
    // stuck` and receives `stuck` again, which is where the stall is visible.
    expect(requestedAfter(mockFetch, 0)).toBeNull()
    expect(requestedAfter(mockFetch, 1)).toBe('stuck')
    expect(mockFetch.mock.calls.length, 'the loop did not terminate').toBe(2)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'pagination-stalled' })
    )
    // **Two, not four.** Both requests returned the same two products. Detecting
    // the stall after appending would terminate the loop and still hand the
    // caller each product twice — a duplicate catalogue, which is worse than an
    // error because nothing downstream can tell it from a real one. The first
    // draft of this fix checked after the push and this assertion is what caught
    // it.
    expect(products).toHaveLength(2)
    expect(new Set(products.map((pr) => pr.handle)).size).toBe(2)
  })

  it('stops when the cursor comes back null while more is claimed', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(page({ ids: ['1'], hasNextPage: true, endCursor: null }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    await getProducts(250)

    expect(mockFetch.mock.calls.length).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'pagination-stalled' })
    )
  })

  it('stops the moment the ceiling is reached rather than fetching a page it cannot use', async () => {
    // Every page well-formed, every page advancing, the store simply larger than
    // the ceiling. 250 / 50 = five full pages, and then it stops — it does not
    // issue a sixth request and discard the result.
    let n = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      n += 1
      return page({
        ids: Array.from({ length: 50 }, (_, i) => `p${n}-${i}`),
        hasNextPage: true,
        endCursor: `cursor-${n}`,
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(250)

    expect(mockFetch.mock.calls.length).toBe(5)
    expect(products).toHaveLength(250)
  })

  it('warns — without falling back — when it stops at the ceiling with more available', async () => {
    // One product per page, which `first: n` permits: `n` is a maximum, not a
    // quota. This is the case that showed the page budget could not be derived
    // as `ceil(maxItems / PRODUCTS_PAGE_SIZE)` — that arithmetic assumes full
    // pages, and with short ones it exhausted the budget having collected one
    // product against a ceiling of two.
    let n = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      n += 1
      return page({ ids: [`p${n}`], hasNextPage: true, endCursor: `cursor-${n}` })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts(2)

    // Truncation is `maxItems` working, not a failure: real products are
    // returned and no fallback is reported.
    expect(products).toHaveLength(2)
    expect(mockFetch.mock.calls.length).toBe(2)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ceiling'))
  })

  it('spends at most MAX_PRODUCT_REQUESTS round-trips however short the pages are', async () => {
    // The cost bound, isolated from the correctness one. Every page here makes
    // genuine progress — a new cursor and a new product — so no stall check
    // fires and nothing stops this walk except the request budget. Without it a
    // server dribbling one product per page turns a 250-product ceiling into 250
    // sequential Shopify round-trips inside one server render.
    let n = 0
    const mockFetch = vi.fn().mockImplementation(async () => {
      n += 1
      return page({ ids: [`p${n}`], hasNextPage: true, endCursor: `cursor-${n}` })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts, MAX_PRODUCT_REQUESTS } = await import('@/lib/shopify')
    const products = await getProducts(250)

    expect(MAX_PRODUCT_REQUESTS).toBe(10)
    expect(mockFetch.mock.calls.length).toBe(MAX_PRODUCT_REQUESTS)
    expect(products).toHaveLength(MAX_PRODUCT_REQUESTS)
    // Reported, not absorbed: the caller asked for 250 and got 10.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ceiling'))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn about a ceiling when the catalogue simply ends', async () => {
    const mockFetch = vi.fn().mockResolvedValue(page({ ids: ['1'], hasNextPage: false, endCursor: 'c' }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    await getProducts(1)

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('ceiling'))
  })
})

describe('a malformed response is reported, not absorbed', () => {
  it('reports malformed-response for a 200 carrying no data field', async () => {
    // `shopifyFetch` throws on GraphQL `errors`, so this is the one malformed
    // shape that arrives as a value. It used to become a TypeError, and the
    // catch reported only ShopifyFetchError — so the log said nothing at all.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({})))

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts()

    expect(products.length).toBe(17)
    // **The detail, not just the reason.** Deleting the explicit
    // `if (!body?.products)` guard makes `body.products` throw a TypeError into
    // the catch, which also reports `malformed-response` — so asserting the
    // reason alone left the guard untested, and a mutation run proved it. The
    // two paths are distinguishable only by what they say, and they need to be:
    // a well-formed 200 with no products field is a schema or permissions
    // problem at Shopify, while a TypeError is a bug on this side.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: 'malformed-response',
        detail: 'response carried no products field',
      })
    )
  })

  it('reports malformed-response when data is present but products is not', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ data: {} })))

    const { getProducts } = await import('@/lib/shopify')
    await getProducts()

    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: 'malformed-response',
        detail: 'response carried no products field',
      })
    )
  })

  it('returns without a second request when the shape is wrong', async () => {
    // The guard returns rather than breaking: a server answering 200 with no
    // products field will answer the next page the same way, and spending the
    // rest of the request budget to confirm it helps nobody.
    const mockFetch = vi.fn().mockResolvedValue(mockJsonResponse({ data: {} }))
    vi.stubGlobal('fetch', mockFetch)

    const { getProducts } = await import('@/lib/shopify')
    await getProducts(250)

    expect(mockFetch.mock.calls.length).toBe(1)
  })

  it('names a non-Shopify exception rather than swallowing it', async () => {
    // Not a throwing `fetch`: `shopifyFetch` already wraps a network throw in a
    // `ShopifyFetchError`, so that path reports `fetch-failed` and always did.
    // The uncovered branch is a throw from *inside* the try but *outside*
    // `shopifyFetch` — and `mapShopifyProduct` supplies one, since it reads
    // `node.variants.edges` with no guard. A product node that reaches the
    // mapper without a `variants` field is a real possibility: `first: 1` on the
    // variants connection plus a product whose only variant is unpublished
    // returns a node the query shape does not promise.
    const nodeWithoutVariants = { ...productNode('1') } as Record<string, unknown>
    delete nodeWithoutVariants.variants

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          data: {
            products: {
              pageInfo: { hasNextPage: false, endCursor: 'c' },
              edges: [{ node: nodeWithoutVariants }],
            },
          },
        })
      )
    )

    const { getProducts } = await import('@/lib/shopify')
    const products = await getProducts()

    expect(products.length).toBe(17)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reason: 'malformed-response',
        detail: expect.stringContaining('TypeError'),
      })
    )
  })

  it('still reports fetch-failed, by that name, for a real Shopify error', async () => {
    // The pre-existing branch must not have been folded into the new one: an
    // outage and a malformed payload need different responses.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-shopify-api-version': shopifyPublicConfig.apiVersion }),
        json: async () => ({ errors: [{ message: 'Throttled' }] }),
      })
    )

    const { getProducts } = await import('@/lib/shopify')
    await getProducts()

    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'fetch-failed' })
    )
  })
})
