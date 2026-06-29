import { shopifyFetch, ShopifyFetchError } from './client'
import {
  GET_PRODUCT_BY_HANDLE,
  GET_PRODUCTS,
  GET_PRODUCTS_BY_COLLECTION,
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
  hjCollections,
} from '@/lib/data/hj-data'

function isShopifyConfigured(): boolean {
  return !!(
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN && process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
  )
}

// Map Shopify GraphQL Product node → HJProduct
function mapShopifyProduct(node: Product): HJProduct {
  const tags = node.tags ?? []

  const material: HJMaterialHandle =
    (tags.find((t) =>
      (['titanium', 'niobium', 'surgical-steel'] as const).includes(t as HJMaterialHandle)
    ) as HJMaterialHandle | undefined) ?? 'titanium'

  const priceAmount = node.priceRange?.minVariantPrice?.amount ?? '0'
  const price = parseFloat(priceAmount).toFixed(2)

  const compareAtAmount = node.compareAtPriceRange?.minVariantPrice?.amount ?? null
  // Shopify returns "0.0" (not null) when no compare-at price is set — guard against it
  const compareAtPrice: string | null =
    compareAtAmount && parseFloat(compareAtAmount) > 0
      ? parseFloat(compareAtAmount).toFixed(2)
      : null

  const collectionsEdges = node.collections?.edges ?? []
  const collection: HJCollectionHandle =
    (collectionsEdges[0]?.node?.handle as HJCollectionHandle | undefined) ?? 'rings'

  const handle = node.handle ?? ''

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
    }
  }

  return {
    id: node.id,
    defaultVariantId: node.variants.edges[0]?.node.id ?? node.id,
    handle,
    title: node.title,
    description: node.description,
    price,
    compareAtPrice,
    collection,
    material,
    tags,
    svgType,
    badge: null,
    spec: '',
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
      { revalidate: 3600 }
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
          { revalidate: 3600 }
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
    }>(GET_PRODUCTS_BY_COLLECTION, { handle: collectionHandle, first }, { revalidate: 3600 })
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

export { hjCollections }
export type { HJProduct, HJCollection }
