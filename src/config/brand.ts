// Healthy Jewellery — the brand's name and marks.
//
// A module with no imports and no environment reads, on purpose. `site.ts` resolves the site URL
// at load and throws on a missing or misspelled one; the retired-route handlers and
// `goneResponse.ts` promise to render "when the rest of the site does not", so they import the
// name from here and stay independent of that failure. `site.ts` re-exports everything below.

/**
 * The brand's name, as every surface displays it. Spelled as the domain is and as the owner
 * confirmed on 2026-10-04. Until then the header said "Jewellery" and the footer, the page
 * titles and the share cards said "Jewelry" — on the same page. Every display goes through
 * this constant; `brand-name.test.ts` fails on a retyped copy of either spelling.
 */
export const SITE_NAME = 'Healthy Jewellery'

/**
 * The name the legal pages give the company: its registration, the copyright holder, the
 * trademark owner, the contracting party and the data controller. Deliberately not `SITE_NAME`.
 * Whether the registered entity has one "l" or two is a fact about a registration, and it is
 * counsel's to change (WS-H), not a styling pass's. `/legal`, `/terms`, `/privacy`, `/shipping`,
 * the browse-only notice on the last two and the footer's copyright line all render it from
 * here, so counsel's answer is a one-line change.
 */
export const LEGAL_ENTITY_NAME = 'Healthy Jewelry'

/**
 * The knot mark every page renders, served from `public/`. Derived — never hand-exported —
 * from `assets/brand/knot-master.png` by `scripts/build-brand-mark.mjs`, which removes the
 * black matte the master's edges were keyed out of. See docs/adr/041.
 */
export const BRAND_MARK_PATH = '/brand/knot-silver.png'

/**
 * The logo search engines show. They lay it on white, where the transparent silver mark is a
 * pale smudge (the reason the browser icons sit on a tile), so this is the same knot on the
 * `--black` tile, from the same derivation.
 */
export const BRAND_LOGO_PATH = '/brand/knot-tile.png'
