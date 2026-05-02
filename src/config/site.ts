// Healthy Jewelry — Site constants and SEO defaults

export const SITE_NAME = 'Healthy Jewelry'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://healthyjewelry.com'

export const SITE_DESCRIPTION =
  'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic, corrosion-proof, and designed to last a lifetime.'

export const SITE_TAGLINE = 'Material integrity. No compromise.'

// ── SEO defaults ───────────────────────────────────────────────────────────

export const SEO_DEFAULTS = {
  titleTemplate: '%s — Healthy Jewelry',
  defaultTitle: 'Healthy Jewelry — Implant-Grade Titanium',
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website' as const,
    locale: 'en_US',
    siteName: SITE_NAME,
    images: [
      {
        url: `${SITE_URL}/og-default.jpg`,
        width: 1200,
        height: 630,
        alt: 'Healthy Jewelry — Implant-Grade Titanium',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    site: '@healthyjewelry',
  },
} as const

// ── Social links ───────────────────────────────────────────────────────────

export const SOCIAL_LINKS = {
  instagram: 'https://instagram.com/healthyjewelry',
  tiktok: 'https://tiktok.com/@healthyjewelry',
  pinterest: 'https://pinterest.com/healthyjewelry',
  youtube: 'https://youtube.com/@healthyjewelry',
} as const

// ── Contact ────────────────────────────────────────────────────────────────

export const CONTACT_EMAIL = 'hello@healthyjewelry.com'
export const SUPPORT_EMAIL = 'support@healthyjewelry.com'

// Legacy aliases kept for backward compatibility with existing imports
export const SHOPIFY_STOREFRONT_ENDPOINT =
  process.env.SHOPIFY_STOREFRONT_URL ?? ''
export const SHOPIFY_STOREFRONT_TOKEN =
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? ''
export const SHOPIFY_REVALIDATION_SECRET =
  process.env.SHOPIFY_REVALIDATION_SECRET ?? ''
