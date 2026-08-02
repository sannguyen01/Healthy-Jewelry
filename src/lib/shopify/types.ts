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

export type HJSvgType =
  | 'ring-arc'
  | 'ring-dome'
  | 'ring-flat'
  | 'ring-split'
  | 'necklace-disc'
  | 'necklace-bar'
  | 'necklace-drop'
  | 'necklace-chain'
  | 'earring-stud'
  | 'earring-hoop'
  | 'earring-drop'
  | 'earring-cone'
  | 'bracelet-cuff'
  | 'bracelet-bangle'
  | 'bracelet-link'
  | 'charm-classic'
  | 'charm-disc'

export type HJMaterialHandle = 'titanium' | 'niobium' | 'surgical-steel'

export type HJCollectionHandle = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'charms'

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
  svgType: HJSvgType
  // Full variant list (sizes etc.) — the detail-page fetch requests every
  // variant; listing/card fetches request just the first so size selection
  // is only ever offered from the product detail page.
  variants: ProductVariant[]
}

export interface HJCollection {
  handle: HJCollectionHandle
  title: string
  description: string
  count: number
}

export interface HJMaterial {
  handle: HJMaterialHandle
  title: string
  subtitle: string
  body: string
  properties: string[]
}
