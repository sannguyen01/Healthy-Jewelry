import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, goneRoute } from '@/lib/http/goneResponse'

/**
 * `/discount` and `/discount/*` — **410 Gone**.
 *
 * Shopify applies a discount code by URL: `/discount/<CODE>` sets it on the session and
 * forwards to the storefront. Those links live in campaign emails, in influencer posts and
 * on printed cards, and they are the one retired URL family a visitor arrives at
 * *expecting something specific*.
 *
 * ## Why this is a 410 and not a redirect to `/shop`
 *
 * A discount is a claim about a price. This site publishes no prices — enforced from both
 * ends by `price-absence-contract.test.tsx` — so there is no amount for a code to reduce and
 * no transaction for it to apply to. Forwarding to `/shop` would carry the promise into a
 * catalogue that cannot honour it, and the visitor would work that out slowly, by looking
 * for a basket. Saying it immediately is kinder and it is the only accurate answer.
 *
 * ## The one that is worth being careful about
 *
 * This page is read by somebody who believes they were offered something. The copy does not
 * say the offer was never real — it may well have been — and it does not imply the visitor
 * did anything wrong. It says where the arrangement happens now, which is with a person.
 */
const COPY = {
  title: 'Discount codes are not used here — Healthy Jewellery',
  heading: 'This website does not apply discount codes.',
  paragraphs: [
    'Nothing is sold on this site, so there is no price for a code to change. This is not ' +
      'a broken link — the online store it belonged to has been withdrawn.',
    'If you were given a code by an ambassador or in a campaign, it is theirs to honour. ' +
      AMBASSADOR_NEXT_STEP,
    BROWSE_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = goneRoute(COPY)
