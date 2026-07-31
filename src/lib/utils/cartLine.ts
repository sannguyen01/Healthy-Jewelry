// Healthy Jewelry — cart line presentation helpers

import type { SelectedOption } from '@/lib/shopify/types'

interface VariantDescribable {
  variantTitle?: string
  selectedOptions?: SelectedOption[]
}

// Shopify's placeholder title for a product with no real options.
const DEFAULT_VARIANT_TITLES = new Set(['default title', 'default', ''])

/**
 * Human-readable description of which variant a cart line is for — "Size 9",
 * "Size M (175mm)" — or null when the product has no meaningful variants.
 *
 * The bag previously showed only the product name, so a customer had no way to
 * confirm which size they were about to buy. For a ring, that is the single
 * most important fact on the line.
 */
export function describeVariant(item: VariantDescribable): string | null {
  const options = (item.selectedOptions ?? []).filter(
    (o) => o.value && !DEFAULT_VARIANT_TITLES.has(o.value.trim().toLowerCase())
  )

  if (options.length > 0) {
    return options.map((o) => `${o.name} ${o.value}`).join(' · ')
  }

  const title = item.variantTitle?.trim() ?? ''
  if (title && !DEFAULT_VARIANT_TITLES.has(title.toLowerCase())) {
    return title
  }

  return null
}

/**
 * Accessible name for a cart line, combining product title and variant so
 * "Remove Arc Band" doesn't ambiguously refer to two different sizes.
 */
export function cartLineLabel(productTitle: string, item: VariantDescribable): string {
  const variant = describeVariant(item)
  return variant ? `${productTitle}, ${variant}` : productTitle
}
