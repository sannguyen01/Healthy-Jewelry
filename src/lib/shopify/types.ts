// Healthy Jewelry — Shopify Storefront API TypeScript types

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

export interface ProductOption {
  id: string
  name: string
  values: string[]
}

export interface Product {
  id: string
  handle: string
  title: string
  description: string
  tags: string[]
  availableForSale: boolean
  options: ProductOption[]
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
  cost: {
    totalAmount: Money
    amountPerQuantity: Money
    compareAtAmountPerQuantity: Money | null
  }
}

export interface CartCost {
  totalAmount: Money
  subtotalAmount: Money
  // Shopify only populates tax/duty once a delivery address is known, so both
  // are null for an anonymous cart. The UI must say "calculated at checkout"
  // rather than render a confident 0.
  totalTaxAmount: Money | null
  totalDutyAmount: Money | null
}

export interface CartDiscountCode {
  code: string
  applicable: boolean
}

export interface Cart {
  id: string
  checkoutUrl: string
  totalQuantity: number
  lines: {
    edges: { node: CartLine }[]
  }
  cost: CartCost
  discountCodes: CartDiscountCode[]
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
  // ISO-4217 code from Shopify's Money object. Carried on the product (rather
  // than assumed at render time) because the store's presentment currency is a
  // merchant setting — a Vietnam-based store charges VND, and showing "$" over
  // a VND amount misstates the price by ~25,000x.
  currencyCode: string
  // False when every variant is out of stock. Drives the sold-out treatment on
  // cards and disables Add to Bag before Shopify has to reject the checkout.
  availableForSale: boolean
  // Shopify's option definitions (e.g. { name: 'Size', values: ['7','8'] }).
  // The size picker renders from these rather than a hardcoded list, so the
  // UI can never offer a size that has no matching variant.
  options: ProductOption[]
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
