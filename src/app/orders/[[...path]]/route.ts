import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, goneRoute } from '@/lib/http/goneResponse'

/**
 * `/orders` and `/orders/*` — **410 Gone**.
 *
 * ## Why this route exists on a site that never had orders
 *
 * `docs/headless-launch-inventory.md` records `ordersCount: 0` as of 2026-08-12, and no
 * payment provider was ever confirmed. So nothing was ever bought, and the honest question
 * is why answer this path at all rather than letting it 404.
 *
 * Because **Shopify's URL space is not this site's to choose.** A Shopify storefront serves
 * order status at `/orders/<token>`, and those URLs are in confirmation emails, in browser
 * histories and in search indexes for every store that ever used the platform. The store's
 * own theme linked them. A visitor arriving here is not making the URL up — they followed
 * something, and a bare 404 tells them their link is broken rather than that the capability
 * was withdrawn.
 *
 * It is also the more honest answer for a crawler. 404 says *this was never here*, and
 * invites months of re-checking. 410 says *this is gone*, once.
 *
 * ## Why no successor
 *
 * There is nothing this site can show someone asking after an order. It has no order
 * records, and — per the contract — it must never acquire any. A redirect to `/shop` would
 * answer a question nobody asked; a redirect to `/contact` would imply this site can look
 * something up. The page says what is true and hands the visitor to a person.
 *
 * Optional catch-all (`[[...path]]`), so `/orders`, `/orders/1234` and
 * `/orders/1234/authenticate` all answer the same way. A `[...path]` segment would leave
 * `/orders` itself falling through to a 404, which is the one of the three most likely to be
 * typed by hand.
 */
const COPY = {
  title: 'Order status is not available here — Healthy Jewellery',
  heading: 'This website does not hold orders.',
  paragraphs: [
    'Healthy Jewelry has never taken an order through this website, and it no longer ' +
      'operates an online store. There is nothing here to look up.',
    'If you are asking about a piece you already have, or one you would like, ' +
      AMBASSADOR_NEXT_STEP,
    BROWSE_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = goneRoute(COPY)
