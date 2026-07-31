import { shopifyConfig } from '@/config/shopify'
import { currencyFractionDigits } from '@/lib/utils/formatPrice'
import { shopifyFetch, ShopifyFetchError } from './client'
import {
  GET_PRODUCT_BY_HANDLE,
  GET_PRODUCTS,
  GET_PRODUCTS_BY_COLLECTION,
  GET_BESTSELLERS,
  GET_NEW_ARRIVALS,
  SEARCH_PRODUCTS,
} from './queries/products'
import type {
  HJProduct,
  HJCollection,
  HJCollectionHandle,
  HJMaterialHandle,
  HJSvgType,
  Product,
} from './types'
import {
  getAllProducts as staticGetAllProducts,
  getProductByHandle as staticGetProductByHandle,
  getProductsByCollection as staticGetProductsByCollection,
  getBestsellers as staticGetBestsellers,
  getNewArrivals as staticGetNewArrivals,
  hjCollections,
} from '@/lib/data/hj-data'

function isShopifyConfigured(): boolean {
  return !!(shopifyConfig.storefrontAccessToken && shopifyConfig.storeDomain)
}

// Map Shopify GraphQL Product node → HJProduct
function mapShopifyProduct(node: Product): HJProduct {
  const tags = node.tags ?? []

  const material: HJMaterialHandle =
    (tags.find((t) =>
      (['titanium', 'niobium', 'surgical-steel'] as const).includes(t as HJMaterialHandle)
    ) as HJMaterialHandle | undefined) ?? 'titanium'

  const priceAmount = node.priceRange?.minVariantPrice?.amount ?? '0'

  // Currency comes from Shopify's Money object. Prefer the price we're actually
  // showing (minVariantPrice), fall back to the first variant, then USD — the
  // last of which only happens if Shopify returned a price with no currency,
  // which it never does.
  const currencyCode =
    node.priceRange?.minVariantPrice?.currencyCode ??
    node.variants?.edges?.[0]?.node?.price?.currencyCode ??
    'USD'

  // Zero-decimal currencies (VND, JPY, …) must not be stored as "450000.00" —
  // the stored string is what every downstream formatter and total parses.
  const digits = currencyFractionDigits(currencyCode)
  const price = parseFloat(priceAmount).toFixed(digits)

  const compareAtAmount = node.compareAtPriceRange?.minVariantPrice?.amount ?? null
  // Shopify returns "0.0" (not null) when no compare-at price is set — guard against it
  const compareAtPrice: string | null =
    compareAtAmount && parseFloat(compareAtAmount) > 0
      ? parseFloat(compareAtAmount).toFixed(digits)
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

  // Tag-based svgType: Shopify admin adds e.g. "svg:ring-dome" to override the fallback
  const svgTag = tags.find((t) => t.startsWith('svg:'))
  let svgType: HJSvgType = svgTag ? (svgTag.replace('svg:', '') as HJSvgType) : 'ring-arc'
  if (!svgTag) {
    if (handle.includes('necklace') || handle.includes('pendant')) {
      svgType = 'necklace-drop'
    } else if (handle.includes('earring') || handle.includes('stud')) {
      svgType = 'earring-hoop'
    } else if (handle.includes('bracelet') || handle.includes('cuff')) {
      svgType = 'bracelet-cuff'
    } else {
      console.warn('[shopify] product missing svg: tag, defaulting to "ring-arc":', {
        handle,
        id: node.id,
      })
    }
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

  // Default to the first variant that can actually be bought. Defaulting to
  // variants[0] regardless — as this did before — means a product whose first
  // size is sold out puts an unpurchasable merchandiseId into the cart, and the
  // customer only discovers it when Shopify rejects the checkout.
  const defaultVariant = variants.find((v) => v.availableForSale) ?? variants[0]

  // Shopify's product-level availableForSale is authoritative when present;
  // deriving it from the variant list is only correct for the detail fetch,
  // where every variant is requested (listing fetches ask for just one).
  const availableForSale =
    typeof node.availableForSale === 'boolean'
      ? node.availableForSale
      : variants.some((v) => v.availableForSale)

  return {
    id: node.id,
    defaultVariantId: defaultVariant?.id ?? node.id,
    handle,
    title: node.title,
    description: node.description,
    price,
    compareAtPrice,
    currencyCode,
    availableForSale,
    options: node.options ?? [],
    collection,
    material,
    tags,
    svgType,
    badge,
    spec: '',
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
