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
    return staticGetProductByHandle(handle) ?? null
  }
  try {
    const response = await shopifyFetch<{ product: Product | null }>(
      GET_PRODUCT_BY_HANDLE,
      { handle },
      { revalidate: 3600, tags: ['products', `product:${handle}`] }
    )
    if (!response.data?.product) {
      return staticGetProductByHandle(handle) ?? null
    }
    return mapShopifyProduct(response.data.product)
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] getProduct fallback to static:', e.message)
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
          { revalidate: 3600, tags: ['products'] }
        )
      ).data
      const { edges, pageInfo } = page.products
      all.push(...edges.map((e) => mapShopifyProduct(e.node)))
      hasMore = pageInfo.hasNextPage
      cursor = pageInfo.endCursor
    }

    return all.length > 0 ? all : staticGetAllProducts()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] getProducts fallback to static:', e.message)
    }
    return staticGetAllProducts()
  }
}

export async function getProductsByCollection(
  collectionHandle: string,
  first = 20
): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
  }
  try {
    const response = await shopifyFetch<{
      collection: { products: { edges: { node: Product }[] } } | null
    }>(
      GET_PRODUCTS_BY_COLLECTION,
      { handle: collectionHandle, first },
      { revalidate: 3600, tags: ['products', `collection:${collectionHandle}`] }
    )
    const edges = response.data?.collection?.products?.edges ?? []
    if (edges.length === 0) {
      return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
    }
    return edges.map((e) => mapShopifyProduct(e.node))
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] getProductsByCollection fallback:', e.message)
    }
    return staticGetProductsByCollection(collectionHandle as HJCollectionHandle)
  }
}

export async function searchProducts(query: string, first = 20): Promise<HJProduct[]> {
  const q = query.toLowerCase().trim()
  if (!isShopifyConfigured() || !q) {
    return staticGetAllProducts().filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.material.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    )
  }
  try {
    const response = await shopifyFetch<{
      search: { edges: { node: Product }[] }
    }>(SEARCH_PRODUCTS, { query, first }, { revalidate: 0 })
    return (response.data?.search?.edges ?? []).map((e) => mapShopifyProduct(e.node))
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] searchProducts fallback:', e.message)
    }
    return []
  }
}

export async function getBestsellers(first = 8): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    return staticGetBestsellers()
  }
  try {
    const response = await shopifyFetch<{ products: { edges: { node: Product }[] } }>(
      GET_BESTSELLERS,
      { first },
      { revalidate: 3600, tags: ['products'] }
    )
    const edges = response.data?.products?.edges ?? []
    return edges.length > 0 ? edges.map((e) => mapShopifyProduct(e.node)) : staticGetBestsellers()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] getBestsellers fallback to static:', e.message)
    }
    return staticGetBestsellers()
  }
}

export async function getNewArrivals(first = 8): Promise<HJProduct[]> {
  if (!isShopifyConfigured()) {
    return staticGetNewArrivals()
  }
  try {
    const response = await shopifyFetch<{ products: { edges: { node: Product }[] } }>(
      GET_NEW_ARRIVALS,
      { first },
      { revalidate: 3600, tags: ['products'] }
    )
    const edges = response.data?.products?.edges ?? []
    return edges.length > 0 ? edges.map((e) => mapShopifyProduct(e.node)) : staticGetNewArrivals()
  } catch (e) {
    if (e instanceof ShopifyFetchError) {
      console.warn('[shopify] getNewArrivals fallback to static:', e.message)
    }
    return staticGetNewArrivals()
  }
}

export { hjCollections }
export type { HJProduct, HJCollection }
