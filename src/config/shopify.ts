// Healthy Jewelry — Shopify configuration

import { shopifyPublicConfig } from './shopify-public'

// Single source of truth for Shopify env/config. Values that vary at runtime are
// exposed as getters so they read process.env at access time (never frozen at
// module-eval), which keeps server-side reads and test env stubbing accurate.
// Server-side configuration. Importing this from a client module pulls the
// secret getters below into the browser bundle — import `shopify-public.ts`
// there instead, which carries only the values a browser may see.
export const shopifyConfig = {
  get storeDomain(): string {
    return shopifyPublicConfig.storeDomain
  },
  get storefrontAccessToken(): string {
    return process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? ''
  },
  // Admin API token — reserved for future Order Management / inventory features.
  // undefined when SHOPIFY_ADMIN_ACCESS_TOKEN is not set (which is the normal case).
  get adminAccessToken(): string | undefined {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  },
  apiVersion: shopifyPublicConfig.apiVersion,
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
