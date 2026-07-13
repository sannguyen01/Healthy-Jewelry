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
  apiVersion: '2025-01' as const,
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
