import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, retiredRoute } from '@/lib/http/goneResponse'

/**
 * `/stones` and `/stones/*` — **308 to `/` for browsing, 410 for anything else.**
 *
 * Pre-repositioning URLs from before the brand was titanium-only. The homepage is the successor
 * because the *category* is gone, not one page of it: a per-item map would imply a titanium
 * successor for each retired piece, and there is none. The copy names what the range is now and
 * never the retired category — the brand's PROHIBITED list forbids that copy outright, and a
 * 410 page is still a page. A POST is a stale form from that era; see `retiredRoute()`.
 */
const COPY = {
  title: 'This page no longer exists — Healthy Jewellery',
  heading: 'This page no longer exists.',
  paragraphs: [
    'Healthy Jewellery now makes pieces in Grade 23 titanium, niobium and 316L surgical steel ' +
      'only. Nothing you submitted was sent or saved.',
    BROWSE_NEXT_STEP,
    AMBASSADOR_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/', copy: COPY })
