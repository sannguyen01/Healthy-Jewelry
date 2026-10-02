import { RETIRED_CATEGORY_COPY, retiredRoute } from '@/lib/http/goneResponse'

/**
 * `/stones` and `/stones/*` — **308 to `/` for browsing, 410 for anything else.**
 *
 * Pre-repositioning URLs from before the brand was titanium-only. The homepage is the successor
 * because the *category* is gone, not one page of it: a per-item map would imply a titanium
 * successor for each retired piece, and there is none. A POST is a stale form from that era.
 * The copy is shared with the other retired category (`RETIRED_CATEGORY_COPY`), because the
 * two retired the same thing for the same reason; see `retiredRoute()`.
 */
export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/', copy: RETIRED_CATEGORY_COPY })
