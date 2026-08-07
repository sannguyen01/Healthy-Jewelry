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
  apiVersion: '2025-01' as const,
} as const

export type ShopifyPublicConfig = typeof shopifyPublicConfig
