// Healthy Jewelry — Shopify configuration

export const shopifyConfig = {
  storeDomain: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? '',
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? '',
  adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? '',
  apiVersion: '2025-01' as const,
  revalidationSecret: process.env.SHOPIFY_REVALIDATION_SECRET ?? '',
} as const

export type ShopifyConfig = typeof shopifyConfig

// ── Revalidation periods (seconds) ────────────────────────────────────────

export const REVALIDATE = {
  product: 3600,      // 1 hour
  collection: 3600,   // 1 hour
  cart: 0,            // always fresh
  page: 86400,        // 24 hours
} as const
