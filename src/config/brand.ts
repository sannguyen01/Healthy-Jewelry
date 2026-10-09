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
 * The knot mark at full size: the canonical transparent copy, served from `public/`. Derived —
 * never hand-exported — from `assets/brand/knot-master.png` by `scripts/build-brand-mark.mjs`,
 * which removes the black matte the master's edges were keyed out of. See docs/adr/041.
 */
export const BRAND_MARK_PATH = '/brand/knot-silver.png'

/**
 * What the lockup renders, at 1x, 2x and 3x of each variant's largest CSS size. Lossless PNG,
 * served as is: the image optimiser's lossy re-encode left alpha where the mark is clear (up to
 * 19/255 in AVIF), so these copies bypass it and are transparent exactly where the master is
 * (ADR 048). Same derivation as the mark above.
 */
export const BRAND_MARK_SRC = {
  inline: ['/brand/knot-30.png', '/brand/knot-60.png', '/brand/knot-90.png'],
  stacked: ['/brand/knot-44.png', '/brand/knot-88.png', '/brand/knot-132.png'],
  // The Care band's seal: 132 CSS px, so its 1x is the stacked variant's largest copy.
  seal: ['/brand/knot-132.png', '/brand/knot-264.png'],
} as const

/**
 * The logo search engines show. Google requires it to look as intended on a pure white
 * background and names a grey logo as the case that does not, so this one copy keeps the
 * knot on the `--black` tile, from the same derivation. Every copy a visitor sees on the site
 * or in a browser tab is transparent (ADR 048).
 */
export const BRAND_LOGO_PATH = '/brand/knot-tile.png'
