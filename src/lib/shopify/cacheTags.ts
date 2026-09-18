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

/**
 * The cacheLife profile every on-demand purge in this codebase uses.
 *
 * ## Why this constant exists at all
 *
 * Next 16 changed `revalidateTag(tag)` into `revalidateTag(tag, profile)`, where
 * the profile is a named cacheLife profile or a `{ expire }` object in seconds.
 * The argument is **required**, so the upgrade is a type error at five call
 * sites and not a silent behaviour change — which is the good case. What would
 * not be caught is passing a *plausible* profile: every call still compiles,
 * every test still passes (both route suites mock `next/cache`), and the only
 * observable difference is that a Shopify webhook stops purging anything and
 * pages serve stale copy until their own window closes. That is exactly the
 * shape this project keeps finding, so the choice is made once, here, with the
 * reasoning attached.
 *
 * ## Why `{ expire: 0 }` and not a named profile
 *
 * Every caller is a **webhook or an on-demand purge endpoint**: something
 * changed in Shopify and the cached copy is now wrong. The correct expiry is
 * immediate, and `expire` is a number of seconds, so zero is it. A named
 * profile (`'max'`, the example in Next's own doc comment) means the opposite —
 * keep serving the cached copy for that profile's window.
 *
 * Next's doc comment points at `updateTag` for immediate expiration, but that is
 * Server-Action-only and every caller here is a route handler, so it is not
 * available. `{ expire: 0 }` is the route-handler equivalent.
 *
 * Validated against Next's own `validateAndNormalizeCacheLifeProfile`: it
 * requires a finite number and only cross-checks `revalidate <= expire`, which
 * no caller supplies. `cache-tag-contract.test.ts` asserts the argument at each
 * call site, because a wrong profile is invisible to a mocked `next/cache`.
 */
export const PURGE_NOW = { expire: 0 } as const
