// Healthy Jewelry — Site constants and SEO defaults

export const SITE_NAME = 'Healthy Jewelry'

/**
 * `||`, not `??`.
 *
 * `??` falls back only on `null` and `undefined`, so an environment variable
 * that exists and is **empty** — which is what a Vercel project setting looks
 * like when somebody clears the value rather than deleting the row — resolved
 * `SITE_URL` to `''`. Line 25 then evaluates `new URL('')`, which throws
 * `TypeError: Invalid URL` at module load; and because this module is imported
 * by the root layout, that is not a broken page but a deployment that does not
 * start. The failure surfaced from a coverage test written against the fallback
 * branch, which is the branch nothing had ever taken.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://healthyjewellery.com'

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

// ── How this brand sells, stated once ──────────────────────────────────────
//
// **Declared here because four pages make the same claim and two of them used to make it
// differently.** `/terms` said "Placing an item in your cart does not constitute a
// purchase" and listed Visa, Mastercard, PayPal and bank transfer as accepted payment
// methods; `/shipping` said "All orders ship free" with a table; `/faq` explained how to
// start a return "with your order number"; `/checkout` answers 410 saying the opposite of
// all three. Every one of those was written in good faith about a storefront that took
// orders, and none of them was updated when it stopped.
//
// Legal and support copy is the worst place in a codebase for a fact to be duplicated:
// nothing renders wrong when it drifts, a reader has no way to tell which page is current,
// and the wrong one is a claim about a real business. One constant, four consumers.

/**
 * The single sentence every transactional page opens with.
 *
 * Deliberately says what *is* true rather than only what is not: "no online orders" alone
 * reads as a fault, and a visitor who wants a piece needs the next step in the same breath.
 */
export const BROWSE_ONLY_STATEMENT =
  'This catalogue is for browsing. Healthy Jewelry does not take orders on this site — a ' +
  'piece is arranged with an ambassador, or through the contact channel below.'

/**
 * How a customer identifies an existing order when writing in.
 *
 * There is no order-confirmation email from this site and therefore no order number from
 * it, which is what made "email us with your order number" unanswerable. An ambassador's
 * reference or the email address the arrangement was made under is what a real customer
 * actually holds.
 */
export const ORDER_REFERENCE_HINT =
  'the reference your ambassador gave you, or the email address the piece was arranged under'


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
