// Healthy Jewelry — Shopify Storefront API TypeScript types

import type { CurrencyCode } from '@/lib/utils/formatPrice'

// ── Primitive Shopify types ────────────────────────────────────────────────

export interface Money {
  amount: string
  currencyCode: string
}

export interface Image {
  url: string
  altText: string | null
  width: number
  height: number
}

export interface SelectedOption {
  name: string
  value: string
}

export interface ProductVariant {
  id: string
  title: string
  price: Money
  compareAtPrice: Money | null
  availableForSale: boolean
  selectedOptions: SelectedOption[]
}

export interface Product {
  id: string
  handle: string
  title: string
  description: string
  tags: string[]
  priceRange: {
    minVariantPrice: Money
  }
  compareAtPriceRange: {
    minVariantPrice: Money | null
  }
  variants: {
    edges: { node: ProductVariant }[]
  }
  collections: {
    edges: { node: { handle: string; title: string } }[]
  }
  /** `custom.spec` metafield — null when the merchant has not set one. */
  spec?: { value: string } | null
  /** Null when the product has no media in Shopify. */
  featuredImage?: Image | null
  images?: { edges: { node: Image }[] }
}

export interface Collection {
  id: string
  handle: string
  title: string
  description: string
  image: Image | null
  products: {
    edges: { node: Product }[]
  }
}

export interface CartLine {
  id: string
  quantity: number
  merchandise: { product: Product } & ProductVariant
}

export interface Cart {
  id: string
  checkoutUrl: string
  lines: {
    edges: { node: CartLine }[]
  }
  cost: {
    totalAmount: Money
    subtotalAmount: Money
  }
}

// ── Generic Shopify response envelope ─────────────────────────────────────

export interface ShopifyResponse<T> {
  data: T
  errors?: { message: string; locations?: unknown[]; path?: string[] }[]
}

// ── Local static data shapes (mirrors hj-data.js) ─────────────────────────

export type HJBadge = 'Bestseller' | 'New' | 'Sale' | null

/**
 * Every illustration `JewelrySVG` can draw.
 *
 * Declared as a runtime array with the type derived from it, not as a bare
 * union, for two reasons. Tests can walk it — `svg-coverage.test.ts` renders
 * every member and fails if any returns nothing. And `parseSvgType` can
 * *validate* a Shopify tag against it instead of casting: the old code cast
 * `svg:ring-halo` straight to this type, so nine products carrying illustration
 * names that do not exist here rendered a completely blank tile with no error
 * anywhere.
 *
 * Adding a type here without drawing it in `JewelrySVG` fails the coverage test.
 */
export const HJ_SVG_TYPES = [
  'ring-arc',
  'ring-dome',
  'ring-flat',
  'ring-split',
  'ring-halo',
  'ring-facet',
  'necklace-disc',
  'necklace-bar',
  'necklace-drop',
  'necklace-chain',
  'earring-stud',
  'earring-hoop',
  'earring-drop',
  'earring-cone',
  'earring-threader',
  'bracelet-cuff',
  'bracelet-bangle',
  'bracelet-link',
  'bracelet-chain',
  'bracelet-bead',
  'charm-classic',
  'charm-disc',
  'charm-anchor',
  'charm-star',
  'charm-heart',
] as const

export type HJSvgType = (typeof HJ_SVG_TYPES)[number]

export type HJMaterialHandle = 'titanium' | 'niobium' | 'surgical-steel'

/**
 * The five collections the site serves, as a runtime array.
 *
 * A runtime array rather than a bare type union, for the same reason
 * `HJ_SVG_TYPES` is one: a union cannot be enumerated by a test, so nothing can
 * check that the set the parser can produce is the same set the router will
 * serve. That gap is not hypothetical here —
 * **`/shop/[collection]` sets `dynamicParams = false`**, so a handle outside this
 * list is a hard 404 *before rendering*, and a product mapped onto one renders a
 * breadcrumb linking straight to it.
 *
 * `collection-handle-contract.test.ts` compares this against the router's own
 * `VALID_COLLECTIONS` in both directions.
 */
export const HJ_COLLECTION_HANDLES = [
  'rings',
  'necklaces',
  'earrings',
  'bracelets',
  'charms',
] as const

export type HJCollectionHandle = (typeof HJ_COLLECTION_HANDLES)[number]

export interface HJProduct {
  id: string
  defaultVariantId: string
  handle: string
  title: string
  collection: HJCollectionHandle
  material: HJMaterialHandle
  tags: string[]
  price: string
  compareAtPrice: string | null
  /**
   * The currency Shopify will actually charge in.
   *
   * Carried from `priceRange.minVariantPrice.currencyCode` rather than assumed,
   * because every price on the site was previously rendered as USD regardless.
   * A store selling in VND would advertise "$89.00" and then charge ₫ at
   * checkout — quoting a customer a price in a currency nobody is charging.
   */
  currencyCode: CurrencyCode
  badge: HJBadge
  description: string
  spec: string
  /**
   * The illustration drawn when there is no photograph.
   *
   * Not a placeholder in the apologetic sense — it is the site's whole visual
   * language today, and every product on the connected store has zero media. It
   * becomes a fallback the moment real photography exists, per `featuredImage`.
   */
  svgType: HJSvgType
  /**
   * The product's main photograph, or `null` when it has none.
   *
   * Always `null` on the static catalogue: `hj-data.ts` describes products that
   * have no photography, and saying so honestly is what makes both render paths
   * testable. Every surface goes through `<ProductImage>`, which draws
   * `svgType` when this is null — so a photo uploaded in Shopify Admin appears
   * with no code change and no redeploy.
   */
  featuredImage: Image | null
  /** Up to six images for the detail-page gallery. Empty when there are none. */
  images: Image[]
  // Full variant list (sizes etc.) — the detail-page fetch requests every
  // variant; listing/card fetches request just the first so size selection
  // is only ever offered from the product detail page.
  variants: ProductVariant[]
}

export interface HJCollection {
  handle: HJCollectionHandle
  title: string
  description: string
}

export interface HJMaterial {
  handle: HJMaterialHandle
  title: string
  subtitle: string
  body: string
  properties: string[]
}
