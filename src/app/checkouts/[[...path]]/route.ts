import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, goneRoute } from '@/lib/http/goneResponse'

/**
 * `/checkouts` and `/checkouts/*` — **410 Gone**.
 *
 * Shopify's hosted checkout lives at `/checkouts/<token>` and at
 * `checkout.<domain>/checkouts/<token>`. Those URLs were minted per session, they were
 * emailed as abandoned-cart recovery links, and they outlive the checkout itself.
 *
 * This is the sibling of `/checkout` (singular) and answers identically. Both exist because
 * both were real: `/checkout` was this application's own route, `/checkouts/*` is the
 * platform's. Retiring one and leaving the other to 404 would mean the two most likely
 * inbound commerce URLs on the site gave two different accounts of the same fact.
 *
 * `checkout.healthyjewellery.com` is a separate problem and is **not** solved here. It still
 * CNAMEs to `shops.myshopify.com`, so a request to it never reaches this deployment. It is
 * retired by WS-E on a deliberate 30-day clock, after confirming nothing in email, social,
 * QR codes or ambassador cards still points at it. See the masterplan.
 */
const COPY = {
  title: 'Checkout is closed — Healthy Jewellery',
  heading: 'This catalogue no longer accepts online orders.',
  paragraphs: [
    'The checkout this link was created for has been withdrawn, along with the online ' +
      'store behind it. It was not moved, and there is no replacement to send you to.',
    AMBASSADOR_NEXT_STEP,
    BROWSE_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = goneRoute(COPY)
