// Healthy Jewelry — Next.js cache tags, named once for both sides
//
// A cache tag only works when the fetcher that *registers* it and the webhook
// that *revalidates* it spell it identically. Nothing enforces that — a tag is
// a bare string on both sides — so the two can drift apart silently, and the
// only symptom is a page that stays stale until its `revalidate` window
// expires. No error, no log, no failing test.
//
// It had already drifted. `getProductsByCollection` registered
// `collection:<handle>`, while the webhook revalidated `collections` — a tag no
// fetcher anywhere registered. So a `collections/update` webhook revalidated
// nothing at all, and the tag that *was* registered was never revalidated:
// collection pages sat stale for the full hour no matter what changed in
// Shopify Admin.
//
// Both directions of that failure are now impossible to express, because both
// sides import from here, and `cache-tag-contract.test.ts` asserts the two sets
// match.

/** Every product-bearing fetch carries this, so a broad change can drop them all. */
export const PRODUCTS_TAG = 'products'

/**
 * One product's detail page. Lets a `products/update` webhook invalidate just
 * the product that changed rather than every generated product page.
 */
export function productTag(handle: string): string {
  return `product:${handle}`
}

/** One collection listing. */
export function collectionTag(handle: string): string {
  return `collection:${handle}`
}

/**
 * Tags that are not parameterised by a handle.
 *
 * Deliberately does not include a bare `'collections'`. That string is what the
 * webhook used to revalidate, and it never matched anything — the collection
 * fetch is always scoped to a handle, so the broad equivalent for "a collection
 * changed" is `PRODUCTS_TAG` plus the specific `collectionTag(handle)`.
 */
export const STATIC_TAGS = [PRODUCTS_TAG] as const

/**
 * The parameterised tag builders, so a test can enumerate them without
 * hardcoding the format it is meant to be checking.
 */
export const TAG_BUILDERS = {
  product: productTag,
  collection: collectionTag,
} as const
