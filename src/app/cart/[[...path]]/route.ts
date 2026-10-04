import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, retiredRoute } from '@/lib/http/goneResponse'
import { SITE_NAME } from '@/config/brand'

/**
 * `/cart` and `/cart/*` — **308 to `/shop` for browsing, 410 for anything else.**
 *
 * A bag becomes the shelf it was filled from, so a GET redirects: a bookmark or an old link to
 * the bag lands on the catalogue. `/cart/add`, `/cart/change`, `/cart/update` and `/cart/clear`
 * are the old platform's cart endpoints, reachable from any cached page, any restored tab and
 * any theme snippet that outlived the theme — and several of them are POSTs. A POST is not
 * somebody looking for the shelf; it is somebody who pressed "Add to bag", and landing them on
 * `/shop` as if it had worked (or, for the multipart form the old theme used, on a bare
 * "Server action not found.") is the dead end `retiredRoute()` exists to close. It gets the
 * page that says what happened. See `src/lib/http/goneResponse.ts`.
 *
 * Optional catch-all, so the bare `/cart` and every path beneath it answer from one place —
 * the two contract §7 rows `/cart` and `/cart/:path*`.
 */
const COPY = {
  title: `Online orders are closed — ${SITE_NAME}`,
  heading: 'This catalogue no longer accepts online orders.',
  paragraphs: [
    'Nothing was added and nothing was sent: there is no bag on this website any more, and ' +
      'nothing here can be bought.',
    AMBASSADOR_NEXT_STEP,
    BROWSE_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/shop', copy: COPY })
