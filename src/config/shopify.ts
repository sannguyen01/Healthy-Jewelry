// Healthy Jewelry — Shopify configuration

// Single source of truth for Shopify env/config. Values that vary at runtime are
// exposed as getters so they read process.env at access time (never frozen at
// module-eval), which keeps server-side reads and test env stubbing accurate.
export const shopifyConfig = {
  get storeDomain(): string {
    return process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? ''
  },
  get storefrontAccessToken(): string {
    return process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? ''
  },
  // Admin API token — reserved for future Order Management / inventory features.
  // undefined when SHOPIFY_ADMIN_ACCESS_TOKEN is not set (which is the normal case).
  get adminAccessToken(): string | undefined {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  },
  // Shopify ships a new API version each quarter and supports each one for
  // about twelve months. 2025-01 — what this was pinned to — went out of
  // support in early 2026; requests to an unsupported version are silently
  // served by the oldest supported one instead, so the storefront was running
  // against a version nobody had chosen and could change under it without
  // notice. Review this each quarter; 2026-07 is supported to 2027-07-16.
  // https://shopify.dev/docs/api/usage/versioning
  apiVersion: '2026-07' as const,
  get revalidationSecret(): string {
    return process.env.SHOPIFY_REVALIDATION_SECRET ?? ''
  },
} as const

export type ShopifyConfig = typeof shopifyConfig

// ── Revalidation periods (seconds) ────────────────────────────────────────

export const REVALIDATE = {
  product: 3600, // 1 hour
  collection: 3600, // 1 hour
  cart: 0, // always fresh
  page: 86400, // 24 hours
} as const
