/**
 * Tells a real Shopify variant GID from the static catalog's placeholder.
 *
 * `src/lib/data/hj-data.ts` is the fallback catalog used whenever Shopify is
 * unconfigured or its API errors, and its ids are invented:
 * `gid://shopify/ProductVariant/hj-001-default`. Real Shopify variant GIDs end
 * in a numeric id.
 *
 * That difference is the whole checkout bug. A cart built from placeholder ids
 * reaches `cartCreate`, Shopify rejects it with a generic `userError`, and the
 * customer sees a spinner resolve into nothing. Catching it before the request
 * turns an opaque failure into a specific one: the catalog is running on
 * fallback data, which means the Storefront credentials are missing or rejected.
 */

/** The trailing segment of a `gid://shopify/<Type>/<id>` identifier. */
function gidSuffix(gid: string): string {
  const trimmed = gid.trim()
  const lastSlash = trimmed.lastIndexOf('/')
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1)
}

/**
 * True when the id could not have come from Shopify.
 *
 * Deliberately checks for "not a real id" rather than matching the `hj-`
 * prefix specifically: an empty id, a bare handle, or any other non-numeric
 * suffix is equally unusable, and all of them fail the same way at `cartCreate`.
 */
export function isPlaceholderVariantId(variantId: string | null | undefined): boolean {
  if (!variantId) return true
  const suffix = gidSuffix(variantId)
  if (suffix.length === 0) return true
  // Shopify ids are numeric, optionally carrying a query string
  // (`gid://shopify/ProductVariant/123?namespace=…`).
  return !/^\d+(\?.*)?$/.test(suffix)
}

/** True when every line carries a usable Shopify variant id. */
export function allVariantIdsAreReal(variantIds: readonly (string | null | undefined)[]): boolean {
  return variantIds.length > 0 && variantIds.every((id) => !isPlaceholderVariantId(id))
}
