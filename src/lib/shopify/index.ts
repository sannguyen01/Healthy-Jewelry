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
import { parseMaterial, parseSvgType } from './tags'
import type { HJProduct, HJCollection, HJCollectionHandle, Product } from './types'
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
type FallbackReason = 'not-configured' | 'empty-response' | 'fetch-failed'

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

  const collectionsEdges = node.collections?.edges ?? []
  const hasCollectionTag = collectionsEdges.length > 0
  const collection: HJCollectionHandle =
    (collectionsEdges[0]?.node?.handle as HJCollectionHandle | undefined) ?? 'rings'
  if (!hasCollectionTag) {
    console.warn('[shopify] product missing collection, defaulting to "rings":', {
      handle,
      id: node.id,
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
  const {
    svgType,
    matched: svgMatched,
    unknownTag,
  } = parseSvgType(tags, collection, handle)
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
    variants,
  }
}

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
      reportFallback('getProduct', 'empty-response', handle)
      return staticGetProductByHandle(handle) ?? null
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
    pageInfo: { hasNextPage: boolean; endCursor: string }
    edges: { node: Product }[]
  }
}

export async function getProducts(maxItems = 250): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    reportFallback('getProducts', 'not-configured')
    return staticGetAllProducts()
  }
  try {
    const all: HJProduct[] = []
    let cursor: string | null = null
    let hasMore = true

    while (hasMore && all.length < maxItems) {
      const page: ProductsPage = (
        await shopifyFetch<ProductsPage>(
          GET_PRODUCTS,
          { first: 50, after: cursor },
          { revalidate: 3600, tags: [PRODUCTS_TAG] }
        )
      ).data
      const { edges, pageInfo } = page.products
      all.push(...edges.map((e) => mapShopifyProduct(e.node)))
      hasMore = pageInfo.hasNextPage
      cursor = pageInfo.endCursor
    }

    if (all.length === 0) reportFallback('getProducts', 'empty-response')
    return all.length > 0 ? all : staticGetAllProducts()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getProducts', 'fetch-failed', e.message)
    }
    return staticGetAllProducts()
  }
}

export async function getProductsByCollection(
  collectionHandle: string,
  first = 20
): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    reportFallback('getProductsByCollection', 'not-configured', collectionHandle)
    return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
  }
  try {
    const response = await shopifyFetch<{
      collection: { products: { edges: { node: Product }[] } } | null
    }>(
      GET_PRODUCTS_BY_COLLECTION,
      { handle: collectionHandle, first },
      { revalidate: 3600, tags: [PRODUCTS_TAG, collectionTag(collectionHandle)] }
    )
    const edges = response.data?.collection?.products?.edges ?? []
    if (edges.length === 0) {
      reportFallback('getProductsByCollection', 'empty-response', collectionHandle)
      return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
    }
    return edges.map((e) => mapShopifyProduct(e.node))
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      reportFallback('getProductsByCollection', 'fetch-failed', e.message)
    }
    return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
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

export async function searchProducts(query: string, first = 20): Promise<HJProduct[]> {
  const q = query.toLowerCase().trim()
  if (!isShopifyConfigured() || !q) {
    if (!isShopifyConfigured()) reportFallback('searchProducts', 'not-configured', q)
    return staticSearch(q)
  }
  try {
    const response = await shopifyFetch<{
      search: { edges: { node: Product }[] }
    }>(SEARCH_PRODUCTS, { query, first }, { revalidate: 0 })
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
