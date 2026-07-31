// Healthy Jewelry — test data factories
//
// Every test that needs an HJProduct used to inline a full object literal, so
// adding a required field (currencyCode, availableForSale, options) broke a
// dozen unrelated test files at once. Build fixtures through these helpers
// instead: a new field gets a default here and nowhere else.

import type { HJProduct, ProductVariant, ProductOption, SelectedOption } from '@/lib/shopify/types'
import type { CartItem } from '@/store/cart'

let seq = 0
function nextId(): string {
  seq += 1
  return String(seq)
}

export function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  const id = overrides.id ?? `gid://shopify/ProductVariant/${nextId()}`
  return {
    id,
    title: 'Default Title',
    price: { amount: '89.00', currencyCode: 'USD' },
    compareAtPrice: null,
    availableForSale: true,
    selectedOptions: [],
    ...overrides,
  }
}

/**
 * Builds a size option plus one variant per value — the shape Shopify returns
 * for a sized product, and what SizePicker reads.
 */
export function makeSizedVariants(
  values: string[],
  opts: { productId?: string; unavailable?: string[]; price?: string; currencyCode?: string } = {}
): { option: ProductOption; variants: ProductVariant[] } {
  const productId = opts.productId ?? `p-${nextId()}`
  const unavailable = new Set(opts.unavailable ?? [])

  const variants = values.map((value) =>
    makeVariant({
      id: `${productId}-size-${value}`,
      title: value,
      availableForSale: !unavailable.has(value),
      price: { amount: opts.price ?? '89.00', currencyCode: opts.currencyCode ?? 'USD' },
      selectedOptions: [{ name: 'Size', value }],
    })
  )

  return {
    option: { id: `${productId}-opt-size`, name: 'Size', values },
    variants,
  }
}

export function makeProduct(overrides: Partial<HJProduct> = {}): HJProduct {
  const id = overrides.id ?? `gid://shopify/Product/${nextId()}`
  const variants = overrides.variants ?? [makeVariant({ id: `${id}-default` })]

  return {
    id,
    defaultVariantId: overrides.defaultVariantId ?? variants[0]?.id ?? `${id}-default`,
    handle: 'arc-band-titanium',
    title: 'Arc Band',
    collection: 'rings',
    material: 'titanium',
    tags: ['rings', 'titanium'],
    price: '89.00',
    compareAtPrice: null,
    currencyCode: 'USD',
    availableForSale: true,
    options: [],
    badge: null,
    description: 'Grade 23 titanium.',
    spec: '2 mm · 1.8 g',
    svgType: 'ring-arc',
    ...overrides,
    variants,
  }
}

/** A ring with real Shopify-shaped size options and variants. */
export function makeSizedProduct(
  values: string[] = ['7', '8', '9'],
  overrides: Partial<HJProduct> = {}
): HJProduct {
  const productId = overrides.id ?? `gid://shopify/Product/${nextId()}`
  const { option, variants } = makeSizedVariants(values, {
    productId,
    unavailable: overrides.variants?.filter((v) => !v.availableForSale).map((v) => v.title),
  })
  return makeProduct({
    id: productId,
    options: [option],
    variants,
    defaultVariantId: variants[0].id,
    ...overrides,
  })
}

export function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  const product = overrides.product ?? makeProduct()
  const variantId = overrides.variantId ?? product.defaultVariantId
  const selectedOptions: SelectedOption[] = overrides.selectedOptions ?? []
  return {
    product,
    quantity: 1,
    variantId,
    variantTitle: '',
    unitPrice: product.price,
    ...overrides,
    selectedOptions,
  }
}
