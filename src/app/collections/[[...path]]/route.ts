import { AMBASSADOR_NEXT_STEP, retiredRoute } from '@/lib/http/goneResponse'
import { SITE_NAME } from '@/config/site'

/**
 * `/collections` and `/collections/*` — **308 to `/shop` for browsing, 410 for anything else.**
 *
 * The old platform's collection URL space: `/collections/<handle>` and `/collections/all` are
 * what a storefront publishes and what search engines indexed. They redirect rather than 410
 * because — unlike a checkout — a successor genuinely exists: the shelf is still there, it is
 * just at `/shop` now.
 *
 * Deliberately **not** mapped handle-by-handle onto `/shop/<handle>`. The old handle set was
 * never identical to this catalogue's five, it included the built-in `frontpage` (ADR 008's
 * exemption, and the source of a real hard-404 on the site's only bestseller), and a
 * per-handle map would be a second collection inventory to keep in step with
 * `COLLECTION_HANDLES`. One destination that is always correct beats five that are correct
 * until somebody renames a collection.
 *
 * A POST here is a product form on an old collection page (the add-to-bag button a collection
 * grid carried), so it gets the explanation rather than the shelf. See `retiredRoute()`.
 */
const COPY = {
  title: `This page has moved — ${SITE_NAME}`,
  heading: 'This page has moved, and nothing here takes an order.',
  paragraphs: [
    'The collections are now in <a href="/shop">the catalogue</a>. Whatever this form was ' +
      'meant to do, nothing was sent or saved.',
    AMBASSADOR_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/shop', copy: COPY })
