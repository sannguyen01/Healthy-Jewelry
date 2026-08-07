// Healthy Jewelry — Site constants and SEO defaults

export const SITE_NAME = 'Healthy Jewelry'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://healthyjewellery.com'

// The domain is spelled with a double "l" ("jewellery") because the single-L
// ".com" is owned by an unrelated third party — parked for resale (nameservers
// on Afternic/GoDaddy) with an explicit null MX record. It is not, and has
// never been, reachable by this brand. Every consumer must import SITE_URL /
// CONTACT_EMAIL / SUPPORT_EMAIL / etc. from this file rather than retyping
// the domain — see domain-consistency.test.ts and the no-hardcoded-domain
// ESLint rule, both of which exist because the wrong spelling once drifted
// into ~20 files as copy-pasted literals.
if (SITE_URL.includes('healthyjewelry.com')) {
  throw new Error(
    '[config/site] SITE_URL resolved to the wrong domain ("healthyjewelry.com", single-L). ' +
      'That domain is not owned by this brand — it is parked for resale and cannot receive mail. ' +
      'The correct domain is "healthyjewellery.com" (double-L). Check NEXT_PUBLIC_SITE_URL in ' +
      'your environment / Vercel project settings.'
  )
}

/** Bare hostname, for prose mentions (legal copy, etc.) that need the domain without a scheme. */
export const SITE_DOMAIN = new URL(SITE_URL).hostname

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
    site: '@healthyjewellery',
  },
} as const

// ── Social links ───────────────────────────────────────────────────────────

export const SOCIAL_LINKS = {
  instagram: 'https://instagram.com/healthyjewellery',
  tiktok: 'https://tiktok.com/@healthyjewellery',
  pinterest: 'https://pinterest.com/healthyjewellery',
  youtube: 'https://youtube.com/@healthyjewellery',
} as const

// ── Contact ────────────────────────────────────────────────────────────────
// Four distinct mailboxes are used across the site. Each is defined once,
// here, so no page can drift onto the wrong domain by retyping it.

export const CONTACT_EMAIL = 'hello@healthyjewellery.com'
export const SUPPORT_EMAIL = 'support@healthyjewellery.com'
export const PRIVACY_EMAIL = 'privacy@healthyjewellery.com'
export const LEGAL_EMAIL = 'legal@healthyjewellery.com'
/** Resend "from" sender identity only — not a real inbox. */
export const SENDER_EMAIL = 'contact@healthyjewellery.com'

// Removed 2026-08-07: three legacy aliases read server-only Shopify secrets
// (`SHOPIFY_STOREFRONT_URL`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`,
// `SHOPIFY_REVALIDATION_SECRET`) from this module — which `ContactForm.tsx`
// imports, and which is therefore a client module.
//
// Nothing leaked: Next inlines non-`NEXT_PUBLIC_` env vars as `undefined` in
// the client bundle, so they were always `''` in the browser. But they were
// entirely unused (only a test referenced them, asserting `typeof === 'string'`
// — which passes on `''` and proves nothing), and a secret-named export in a
// client-reachable file is one rename away from being real. The genuine
// consumers read `process.env` server-side, via `config/shopify.ts` and
// `api/revalidate/route.ts`.
//
// `src/tests/unit/secret-exposure.test.ts` now enforces the rule rather than
// relying on nobody re-adding them.
