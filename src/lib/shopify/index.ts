import { shopifyConfig } from '@/config/shopify'
import type { CurrencyCode } from '@/lib/utils/formatPrice'
import { shopifyFetch, ShopifyFetchError } from './client'
import {
  GET_PRODUCT_BY_HANDLE,
  GET_PRODUCTS,
  GET_PRODUCTS_BY_COLLECTION,
  GET_BESTSELLERS,
  GET_NEW_ARRIVALS,
  SEARCH_PRODUCTS,
} from './queries/products'
import { PRODUCTS_TAG, productTag, collectionTag } from './cacheTags'
import { parseMaterial, parseSvgType, parseCollection, isHJCollectionHandle } from './tags'
import type { HJProduct, HJCollection, Product } from '@/lib/catalog/types'
import {
  getAllProducts as staticGetAllProducts,
  getProductByHandle as staticGetProductByHandle,
  getProductsByCollection as staticGetProductsByCollection,
  getBestsellers as staticGetBestsellers,
  getNewArrivals as staticGetNewArrivals,
  hjCollections,
} from '@/lib/data/hj-data'

/**
 * Narrows Shopify's free-form currency string to the codes formatPrice knows.
 * An unrecognised code falls back to USD *and warns*, because silently
 * mislabelling money is the failure this whole field exists to prevent.
 */
function normaliseCurrency(code: string | undefined): CurrencyCode {
  const supported: readonly CurrencyCode[] = ['USD', 'VND', 'EUR', 'GBP']
  if (code && (supported as readonly string[]).includes(code)) {
    return code as CurrencyCode
  }
  if (code) {
    console.warn(
      `[shopify] unsupported currency "${code}" — falling back to USD. Add it to CurrencyCode in src/lib/utils/formatPrice.ts.`
    )
  }
  return 'USD'
}

function isShopifyConfigured(): boolean {
  return !!(shopifyConfig.storefrontAccessToken && shopifyConfig.storeDomain)
}

/**
 * Why the storefront is serving the bundled catalogue instead of the store.
 *
 * The fallback is deliberate — a Shopify outage must not take the site down —
 * but it is also the single reason every failure in this project stayed hidden
 * for so long. An unconfigured deployment renders every page, returns 200
 * everywhere, and looks completely healthy right up until someone tries to buy
 * something that does not exist in Shopify.
 *
 * So the fallback stays, and stops being quiet. `console.error` rather than
 * `warn`: in Vercel's function logs this is the difference between a line
 * nobody filters for and one that shows up in the error view. It names the
 * fetcher and the reason, because "products are static" and "this one product
 * 404'd in Shopify" need different responses.
 */
type FallbackReason =
  | 'not-configured'
  | 'empty-response'
  | 'fetch-failed'
  | 'collection-not-found'
  // A 200 that carried neither `errors` nor `data`. `shopifyFetch` throws on
  // GraphQL errors, so this is the one malformed shape that reaches a caller as
  // a value rather than an exception — and it used to arrive as
  // `TypeError: Cannot read properties of undefined`, caught by a handler that
  // only reports `ShopifyFetchError`. The fallback happened; nothing said so.
  | 'malformed-response'
  // Pagination that stopped making progress: a page with `hasNextPage: true`
  // and no edges, or a cursor the server did not advance. Either one used to
  // spin the loop forever.
  | 'pagination-stalled'

function reportFallback(fetcher: string, reason: FallbackReason, detail?: string): void {
  console.error('[shopify] SERVING STATIC FALLBACK CATALOG', {
    fetcher,
    reason,
    detail: detail ?? null,
    // The two questions anyone reading this log will immediately ask.
    storeDomainConfigured: !!shopifyConfig.storeDomain,
    storefrontTokenConfigured: !!shopifyConfig.storefrontAccessToken,
  })
}

// Map Shopify GraphQL Product node → HJProduct
function mapShopifyProduct(node: Product): HJProduct {
  const tags = node.tags ?? []

  // Tags are the only place Shopify carries "which metal is this", and the
  // store's vocabulary is not the code's — `material:steel` here means
  // `surgical-steel` there. parseMaterial owns that translation; a silent
  // mismatch used to label every product Grade 23 Titanium.
  const { material, matched: materialMatched } = parseMaterial(tags)

  const priceAmount = node.priceRange?.minVariantPrice?.amount ?? '0'
  const price = parseFloat(priceAmount).toFixed(2)

  // The currency Shopify will charge. Never assume USD: a VND store would
  // otherwise have every price on the site rendered with a dollar sign while
  // checkout charges dong.
  const currencyCode = normaliseCurrency(node.priceRange?.minVariantPrice?.currencyCode)

  const compareAtAmount = node.compareAtPriceRange?.minVariantPrice?.amount ?? null
  // Shopify returns "0.0" (not null) when no compare-at price is set — guard against it
  const compareAtPrice: string | null =
    compareAtAmount && parseFloat(compareAtAmount) > 0
      ? parseFloat(compareAtAmount).toFixed(2)
      : null

  const handle = node.handle ?? ''

  // Validated, never cast — the last of the three mapped fields to get this
  // treatment, and the one the live store was already tripping over.
  // `arc-band-titanium` sits in Shopify's built-in `frontpage` collection as well
  // as `rings`, and Shopify returns `frontpage` first, so the old
  // `edges[0] as HJCollectionHandle` produced a handle no route serves: the
  // product page then rendered a breadcrumb linking to `/shop/frontpage`, which
  // `dynamicParams = false` answers with a hard 404. See `parseCollection`.
  const collectionsEdges = node.collections?.edges ?? []
  const {
    collection,
    matched: collectionMatched,
    ignored: ignoredCollections,
  } = parseCollection(
    collectionsEdges.map((e) => e.node?.handle ?? ''),
    handle
  )
  if (!collectionMatched) {
    console.warn('[shopify] no recognised collection, defaulting to "rings":', {
      handle,
      id: node.id,
      // Named rather than counted: "this product is in a collection you have not
      // built a page for" is actionable, and `[]` versus `['spectrum']` is the
      // difference between an untagged product and a mis-tagged one.
      ignored: ignoredCollections,
    })
  }

  // Warned after `handle` is known so the log names the offending product.
  if (!materialMatched && tags.length > 0) {
    console.warn('[shopify] no recognised material tag, defaulting to "titanium":', {
      handle,
      id: node.id,
      tags,
    })
  }

  // Validated, never cast. `svg:ring-halo` is a legal tag to write in Shopify
  // Admin and was not a legal HJSvgType — the old cast let it through and
  // JewelrySVG rendered nothing at all for nine products.
  const { svgType, matched: svgMatched, unknownTag } = parseSvgType(tags, collection, handle)
  if (!svgMatched) {
    console.warn('[shopify] svg type unresolved, using collection fallback:', {
      handle,
      id: node.id,
      unknownTag: unknownTag ?? null,
      svgType,
    })
  }

  // Badge priority: explicit bestseller/new tags win, then an active
  // compare-at price implies a Sale badge, otherwise no badge.
  const badge: HJProduct['badge'] = tags.includes('bestseller')
    ? 'Bestseller'
    : tags.includes('new')
      ? 'New'
      : compareAtPrice !== null
        ? 'Sale'
        : null

  const variants = node.variants.edges.map((e) => e.node)

  return {
    id: node.id,
    defaultVariantId: variants[0]?.id ?? node.id,
    handle,
    title: node.title,
    description: node.description,
    price,
    currencyCode,
    compareAtPrice,
    collection,
    material,
    tags,
    svgType,
    badge,
    // Optional by design: Shopify has no native field for a physical spec, so
    // it lives in `custom.spec`. Absent means the detail page hides the line.
    spec: node.spec?.value?.trim() ?? '',
    // Null rather than a synthesised placeholder. `<ProductImage>` needs to be
    // able to tell "no photo exists" from "a photo exists and failed to load" —
    // the first draws the illustration, the second is a bug, and a fabricated
    // URL would make them look identical.
    featuredImage: node.featuredImage ?? null,
    images: (node.images?.edges ?? []).map((e) => e.node),
    variants,
  }
}

/**
 * A configured Shopify answering with `product: null` is not a platform
 * failure — it is Shopify's authoritative statement that the handle does not
 * exist. Falling back to the static catalogue here (as every other fetcher in
 * this module correctly does on `not-configured` / `fetch-failed`) would hand
 * the customer a fabricated, indexable product page — wrong title, wrong
 * price, a GID Shopify never issued. `isPlaceholderVariantId` in
 * `src/store/cart.tsx` catches that id before checkout and fails with
 * `placeholder-catalog`, so the harm here is not a silent checkout failure —
 * it is a wasted journey and a search result pointing at a page that lies.
 *
 * So `getProduct` alone treats a well-formed empty answer as a real absence
 * — see docs/adr/004-static-fallback-is-not-a-data-source.md — while
 * `not-configured` and `fetch-failed` still degrade to the static catalogue,
 * because those are whole-site outages where every product falls back
 * consistently, not a single stale link.
 */
export async function getProduct(handle: string): Promise<HJProduct | null> {
  if (!isShopifyConfigured()) {
    reportFallback('getProduct', 'not-configured', handle)
    return staticGetProductByHandle(handle) ?? null
  }
  try {
    const response = await shopifyFetch<{ product: Product | null }>(
      GET_PRODUCT_BY_HANDLE,
      { handle },
      { revalidate: 3600, tags: [PRODUCTS_TAG, productTag(handle)] }
    )
    if (!response.data?.product) {
      return null
    }
    return mapShopifyProduct(response.data.product)
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getProduct', 'fetch-failed', e.message)
    }
    return staticGetProductByHandle(handle) ?? null
  }
}

type ProductsPage = {
  products: {
    // `endCursor` is nullable in Shopify's schema — an empty connection has no
    // last edge to point at. It was typed `string` here, which is why the old
    // loop could assign `null` into a `string` cursor without the compiler
    // noticing.
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    edges: { node: Product }[]
  }
}

/**
 * Products requested per round-trip.
 *
 * Exported so a test asserts against the constant the code uses rather than
 * against a `50` retyped in the assertion — the shape
 * [ADR 025](../../../docs/adr/025-a-number-in-prose-is-a-claim.md) is about,
 * applied to a literal instead of to prose.
 */
export const PRODUCTS_PAGE_SIZE = 50

/**
 * The most Storefront round-trips one `getProducts` call may spend.
 *
 * This is a **cost** bound and is deliberately separate from the correctness
 * one. Termination is already guaranteed by the progress checks in the loop:
 * every surviving iteration both advances the cursor to a value it has not sent
 * and appends at least one product, so `all.length` strictly increases and
 * `maxItems` alone ends the walk.
 *
 * What that argument does not bound is *how many requests* it takes to get
 * there. `first: n` is a maximum, not a quota — a server answering one product
 * per page satisfies every progress check while turning a 250-product ceiling
 * into 250 sequential round-trips inside a single server render. Deriving the
 * bound as `ceil(maxItems / PRODUCTS_PAGE_SIZE)` looks exact and is not, for the
 * same reason: it silently assumes full pages, and under-collects the moment one
 * comes back short.
 *
 * Ten is `2 x` the default ceiling's worth of full pages, so it never binds on a
 * healthy store and is reported rather than absorbed when it does.
 */
export const MAX_PRODUCT_REQUESTS = 10

/**
 * Every product in the store, up to `maxItems`.
 *
 * ## What `maxItems` used to mean
 *
 * Not a ceiling. The loop tested `all.length < maxItems` *before* fetching and
 * then asked for a fixed 50, so the array overshot by up to 49: `getProducts(10)`
 * issued one request for 50 products and returned all 50 — five times what the
 * caller asked for. The parameter named a bound it did not enforce.
 *
 * It now clamps the page size to what is still owed (`maxItems - all.length`),
 * and slices whatever the server returns, because `first: n` is a request and
 * not a guarantee.
 *
 * ## Why the loop could not terminate
 *
 * `while (hasMore && all.length < maxItems)` advances on two assumptions, and
 * a paginated API guarantees neither:
 *
 *   · **that every page returns edges.** Shopify can answer `hasNextPage: true`
 *     with an empty `edges` array — a page whose nodes were all filtered out by
 *     publication scope is the ordinary way to get one. `all.length` then never
 *     grows, `hasMore` stays true, and the loop issues requests forever.
 *   · **that the cursor advances.** A server echoing the cursor it was given
 *     re-serves the same page indefinitely. The old loop would have accumulated
 *     50 identical products per pass until `maxItems`, then returned a catalogue
 *     of duplicates.
 *
 * Both are now detected and reported as `pagination-stalled` rather than
 * absorbed, and the cursor check runs *before* the page is appended — a page
 * that repeats the cursor is the page already held, and keeping it would return
 * duplicates rather than merely stop.
 *
 * With those two checks in place the loop terminates by argument: every
 * surviving pass advances the cursor to a value it has not sent and appends at
 * least one product. `MAX_PRODUCT_REQUESTS` is therefore a spend bound rather
 * than a safety net — see its own comment for why deriving it from `maxItems`
 * looks exact and is not.
 *
 * ## The failure that reported nothing
 *
 * `(await shopifyFetch(...)).data` is typed `ProductsPage` but is `undefined`
 * for a 200 carrying neither `data` nor `errors`. `page.products` then threw a
 * `TypeError` into a `catch` that reports only `ShopifyFetchError` — so the site
 * silently served the bundled catalogue with nothing in the logs. That is the
 * exact failure mode `reportFallback`'s own doc comment says the fallback exists
 * to stop being: "the fallback stays, and stops being quiet."
 *
 * @param maxItems hard ceiling on returned products. Must be a positive integer.
 */
export async function getProducts(maxItems = 250): Promise<HJProduct[]> {
  // Before the try, deliberately. A non-positive or non-integer ceiling is a
  // caller bug, not a runtime condition, and the surrounding try/catch turns
  // every throw into a silent static fallback — so validating inside it would
  // convert "somebody passed 0" into "the storefront quietly shows bundled
  // data", which is precisely the laundering this module keeps being fixed for.
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new RangeError(
      `getProducts(maxItems): expected a positive integer, received ${String(maxItems)}`
    )
  }

  if (!isShopifyConfigured()) {
    reportFallback('getProducts', 'not-configured')
    return staticGetAllProducts()
  }

  try {
    const all: HJProduct[] = []
    let cursor: string | null = null
    /** Stopped by a budget rather than by the end of the catalogue. */
    let truncated = false

    for (let request = 0; request < MAX_PRODUCT_REQUESTS; request++) {
      const remaining = maxItems - all.length
      // Annotated, not inferred. `cursor` is read inside the call whose result
      // would otherwise type it, and TypeScript reports that cycle as TS7022
      // ("referenced directly or indirectly in its own initializer") — the same
      // reason the previous implementation wrote `const page: ProductsPage`.
      const body: ProductsPage | undefined = (
        await shopifyFetch<ProductsPage>(
          GET_PRODUCTS,
          { first: Math.min(PRODUCTS_PAGE_SIZE, remaining), after: cursor },
          { revalidate: 3600, tags: [PRODUCTS_TAG] }
        )
      ).data

      if (!body?.products) {
        reportFallback('getProducts', 'malformed-response', 'response carried no products field')
        return staticGetAllProducts()
      }

      const { edges, pageInfo }: ProductsPage['products'] = body.products

      // **Before the push, not after.** A page whose `endCursor` equals the
      // cursor we just sent is the page we already have, and appending it would
      // return the same products twice — a catalogue of duplicates, which is
      // worse than an error because it looks like data. Checking after the push
      // terminates the loop and still ships the duplicates.
      if (pageInfo.endCursor !== null && pageInfo.endCursor === cursor) {
        reportFallback(
          'getProducts',
          'pagination-stalled',
          `request ${request + 1} returned the cursor it was given (${pageInfo.endCursor})`
        )
        break
      }

      // `first: n` asks; it does not bind. Slicing here is what makes `maxItems`
      // true of the returned array regardless of what the server sends.
      all.push(...edges.slice(0, remaining).map((e) => mapShopifyProduct(e.node)))

      // The ordinary end of the catalogue.
      if (!pageInfo.hasNextPage) break

      // The ceiling reached with the store still offering more. Stopping here
      // rather than at the top of the next pass is what keeps the request count
      // honest: the old loop would issue one more fetch and discard it.
      if (all.length >= maxItems) {
        truncated = true
        break
      }

      // Two ways forward progress can stop while the server still claims more.
      if (edges.length === 0) {
        reportFallback(
          'getProducts',
          'pagination-stalled',
          `request ${request + 1} reported hasNextPage with no edges`
        )
        break
      }
      if (pageInfo.endCursor === null) {
        reportFallback(
          'getProducts',
          'pagination-stalled',
          `request ${request + 1} reported hasNextPage with a null cursor`
        )
        break
      }

      cursor = pageInfo.endCursor

      // Request budget spent with the store still offering more.
      if (request === MAX_PRODUCT_REQUESTS - 1) truncated = true
    }

    // Not a fallback and not an error — a budget doing its job — but a
    // deployment silently serving a truncated catalogue is worth one line in the
    // log rather than none, since nothing else distinguishes it from a store of
    // exactly this size.
    if (truncated) {
      console.warn(
        `[shopify] getProducts stopped at a ceiling with more products available ` +
          `(${all.length} collected, maxItems=${maxItems}, ` +
          `requests=${MAX_PRODUCT_REQUESTS} max). Raise maxItems if the catalogue is ` +
          'genuinely larger, and check page sizes if it is not.'
      )
    }

    if (all.length === 0) reportFallback('getProducts', 'empty-response')
    return all.length > 0 ? all : staticGetAllProducts()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getProducts', 'fetch-failed', e.message)
    } else {
      // Anything that is not a ShopifyFetchError reached here without a name.
      // The old code returned the static catalogue for these too and said
      // nothing at all, which is how a `TypeError` in this function looked
      // identical to a healthy store with a bundled catalogue.
      reportFallback(
        'getProducts',
        'malformed-response',
        e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      )
    }
    return staticGetAllProducts()
  }
}

/**
 * `collectionHandle` arrives as a plain route param, not a validated
 * `HJCollectionHandle` — the four fallback call sites in
 * `getProductsByCollection` used to hand it straight to the static catalogue
 * via `as HJCollectionHandle`. Runtime risk was low (`staticGetProductsByCollection`
 * only ever `.filter()`s against it, so a bogus handle degraded to `[]`
 * anyway) but a cast is still a claim the compiler believes and nothing
 * checks — the same reasoning that moved `material` and `svgType` off casts
 * in `tags.ts`, and `collection` on the product mapper in 2026-08-12. This is
 * that same fix applied to the lookup side.
 */
function staticFallbackForCollection(collectionHandle: string): HJProduct[] {
  return isHJCollectionHandle(collectionHandle)
    ? staticGetProductsByCollection(collectionHandle)
    : []
}

export async function getProductsByCollection(
  collectionHandle: string,
  first = 20
): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    reportFallback('getProductsByCollection', 'not-configured', collectionHandle)
    return staticFallbackForCollection(collectionHandle)
  }
  try {
    const response = await shopifyFetch<{
      collection: { products: { edges: { node: Product }[] } } | null
    }>(
      GET_PRODUCTS_BY_COLLECTION,
      { handle: collectionHandle, first },
      { revalidate: 3600, tags: [PRODUCTS_TAG, collectionTag(collectionHandle)] }
    )
    // `collection: null` (the handle matches no Shopify collection — a route
    // drifted out of sync with Shopify Admin) and `collection: { products: {
    // edges: [] } }` (a real collection with zero products right now, a
    // legitimate quiet shelf) both used to collapse into the same
    // `edges.length === 0` branch. Both still degrade to the static
    // catalogue — an empty list has no fabricated-page risk, per ADR 004 —
    // but reported identically as `empty-response` they were indistinguishable
    // in the fallback logs from an expected restocking gap. `collection-
    // not-found` is a routing/handle-drift bug that stays broken until
    // someone notices; `empty-response` fixes itself when stock arrives.
    if (!response.data?.collection) {
      reportFallback('getProductsByCollection', 'collection-not-found', collectionHandle)
      return staticFallbackForCollection(collectionHandle)
    }
    const edges = response.data.collection.products?.edges ?? []
    if (edges.length === 0) {
      reportFallback('getProductsByCollection', 'empty-response', collectionHandle)
      return staticFallbackForCollection(collectionHandle)
    }
    return edges.map((e) => mapShopifyProduct(e.node))
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getProductsByCollection', 'fetch-failed', e.message)
    }
    return staticFallbackForCollection(collectionHandle)
  }
}

/** Static-catalogue search, used whenever Shopify cannot answer. */
function staticSearch(q: string): HJProduct[] {
  return staticGetAllProducts().filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.material.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
  )
}

/**
 * How long a search result stays cached.
 *
 * `revalidate: 0` meant every visitor who typed anything spent one uncached
 * Shopify Storefront call — on a page that is `dynamic` by construction, with no
 * limiter in front of it. Two people searching "titanium" a second apart cost two
 * round-trips against the store's quota, which is the quota real shoppers
 * checking out are drawing on. Every other fetcher in this module already caches
 * at 3600s.
 *
 * Sixty seconds rather than an hour because search is the one surface where a
 * newly-published product should appear quickly; an hour would make a merchant's
 * change look lost. It turns the cost from one call per visitor into one call per
 * distinct query per minute, which for a 22-SKU catalogue is a very small number.
 */
const SEARCH_REVALIDATE_SECONDS = 60

/**
 * The longest query worth sending to Shopify.
 *
 * Not a validation rule — a cache-key bound. Every distinct string is its own
 * cache entry, so an unbounded query length is an unbounded number of entries,
 * each costing one uncached round-trip to create. No real search is longer than
 * this; `sanitiseQuery` in the analytics layer caps at a similar length for the
 * same reason.
 */
const MAX_SEARCH_QUERY_LENGTH = 128

/**
 * The form of a query that reaches both Shopify and the cache key.
 *
 * Normalised so that `"Titanium"`, `"titanium "` and `"  titanium  "` are one
 * cache entry rather than three. The old code normalised for the *static*
 * fallback and sent the **raw** string to Shopify, so the two halves searched
 * for different things and every capitalisation variant paid its own round-trip.
 */
export function normaliseSearchQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

export async function searchProducts(query: string, first = 20): Promise<HJProduct[]> {
  const q = normaliseSearchQuery(query)
  if (!isShopifyConfigured() || !q) {
    if (!isShopifyConfigured()) reportFallback('searchProducts', 'not-configured', q)
    return staticSearch(q)
  }
  try {
    const response = await shopifyFetch<{
      search: { edges: { node: Product }[] }
    }>(
      SEARCH_PRODUCTS,
      // `q`, not `query` — the normalised form is what gets cached, and sending
      // the raw string here is what made the cache key as varied as the typing.
      { query: q, first },
      { revalidate: SEARCH_REVALIDATE_SECONDS }
    )
    return (response.data?.search?.edges ?? []).map((e) => mapShopifyProduct(e.node))
  } catch (e) {
    // Degrade to the static catalogue, like every other fetcher in this module.
    // This alone returned `[]` on failure, which renders as a confident
    // `No results for "titanium"` — telling the customer the product does not
    // exist when the truth is that Shopify did not answer. Every sibling
    // (`getProduct`, `getProducts`, `getProductsByCollection`, `getBestsellers`,
    // `getNewArrivals`) already falls back; search was the odd one out, and
    // nothing noticed because nothing called it.
    if (e instanceof ShopifyFetchError) {
      reportFallback('searchProducts', 'fetch-failed', e.message)
    }
    return staticSearch(q)
  }
}

export async function getBestsellers(first = 8): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    reportFallback('getBestsellers', 'not-configured')
    return staticGetBestsellers()
  }
  try {
    const response = await shopifyFetch<{ products: { edges: { node: Product }[] } }>(
      GET_BESTSELLERS,
      { first },
      { revalidate: 3600, tags: [PRODUCTS_TAG] }
    )
    const edges = response.data?.products?.edges ?? []
    if (edges.length === 0) reportFallback('getBestsellers', 'empty-response')
    return edges.length > 0 ? edges.map((e) => mapShopifyProduct(e.node)) : staticGetBestsellers()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getBestsellers', 'fetch-failed', e.message)
    }
    return staticGetBestsellers()
  }
}

export async function getNewArrivals(first = 8): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    reportFallback('getNewArrivals', 'not-configured')
    return staticGetNewArrivals()
  }
  try {
    const response = await shopifyFetch<{ products: { edges: { node: Product }[] } }>(
      GET_NEW_ARRIVALS,
      { first },
      { revalidate: 3600, tags: [PRODUCTS_TAG] }
    )
    const edges = response.data?.products?.edges ?? []
    if (edges.length === 0) reportFallback('getNewArrivals', 'empty-response')
    return edges.length > 0 ? edges.map((e) => mapShopifyProduct(e.node)) : staticGetNewArrivals()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getNewArrivals', 'fetch-failed', e.message)
    }
    return staticGetNewArrivals()
  }
}

export { hjCollections }
export type { HJProduct, HJCollection }
