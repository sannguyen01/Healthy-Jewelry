// Healthy Jewelry — the Shopify configuration a browser is allowed to see
//
// Split out from `config/shopify.ts` because the cart store is a client module
// and imported the whole thing, dragging three server-only secrets
// (`SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`,
// `SHOPIFY_REVALIDATION_SECRET`) into the client module graph.
//
// Nothing leaked — Next inlines non-`NEXT_PUBLIC_` env vars as `undefined` in
// the client bundle, so those getters returned `''` in a browser. But the cart
// store only ever needed the store domain, and "this file is safe to import
// from the browser" is worth being able to state as a fact rather than infer
// from what Next happens to do with an env var name.
//
// `src/tests/unit/secret-exposure.test.ts` walks the real client import graph
// and fails if a secret ever becomes reachable again.

export const shopifyPublicConfig = {
  /**
   * Inlined at build time. An empty value means the variable was absent *when
   * this deployment was built* — setting it afterwards changes nothing until a
   * rebuild.
   */
  get storeDomain(): string {
    return process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? ''
  },
  /**
   * The Shopify API version every request names.
   *
   * Kept in step with `SHOPIFY_API_VERSION` in `scripts/lib/api-version.mjs` —
   * which carries the retirement date and the reasoning — by
   * `src/tests/unit/api-version-contract.test.ts`. Two copies of a string that
   * must agree, with nothing joining them, is the shape `cacheTags.ts` exists
   * to make inexpressible; this one could not import across the TS/`.mjs`
   * boundary, so it is asserted instead.
   *
   * Was `2025-01`, which Shopify retired around 2026-01. Nothing errored: a
   * retired version *falls forward* to the oldest accessible one, silently.
   * See `docs/adr/009-api-version-must-be-asserted-not-declared.md`.
   */
  apiVersion: '2026-07' as const,
} as const

export type ShopifyPublicConfig = typeof shopifyPublicConfig
