import { AMBASSADOR_NEXT_STEP, retiredRoute } from '@/lib/http/goneResponse'

/**
 * `/policies/*` — **308 to `/legal` for browsing, 410 for anything else.**
 *
 * `/policies/privacy-policy`, `/policies/terms-of-service`, `/policies/refund-policy`,
 * `/policies/shipping-policy` — the four URLs the old hosted checkout linked from its footer.
 * They go to `/legal`, which is this site's index of the same documents, rather than being
 * mapped individually: a visitor following a policy link wants *the policies*, and the site's
 * own pages do not correspond one-to-one with the old ones — there is no refund policy here,
 * because there is nothing to refund.
 *
 * A required catch-all (`[...path]`), not an optional one: contract §7 retires `/policies/*`
 * and says nothing about the bare `/policies`, which stays a 404 rather than acquiring an
 * answer nobody declared. Nothing submits to a policy page, so a POST here is the same stray
 * the other families get, and the same explanation. See `retiredRoute()`.
 */
const COPY = {
  title: 'This page has moved — Healthy Jewellery',
  heading: 'The policies have moved.',
  paragraphs: [
    'They are on <a href="/legal">the legal page</a>. Nothing you submitted was sent or saved.',
    AMBASSADOR_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/legal', copy: COPY })
