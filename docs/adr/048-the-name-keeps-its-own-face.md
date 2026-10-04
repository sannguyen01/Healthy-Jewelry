# ADR 048 — The name keeps its own face, and the logo stands on nothing

**Date**: 2026-10-04
**Status**: Accepted. Records three rulings the owner gave on 2026-10-04:
1. "Ensure that the background of the logo is transparent."
2. "We should not use everything from Songmont, since many of them could be incompatible with
   Healthy Jewellery … it is unnecessary to study Songmont's hidden calligraphy."
3. "We still use the original typography of Healthy Jewellery for its brand name."

The second amends the scope of [ADR 043](043-one-family-and-the-case-it-is-written-in.md) and
[ADR 044](044-decided-from-the-language-not-the-page.md).

## Context

**The logo.** The mark the header and footer render was already transparent in its file:
- corners at α=0;
- 57.6% of pixels fully clear;
- edges free of the black matte (ADR 041).

Three things were not.

| Where | Finding |
|---|---|
| Browser tab (`icon.png`) | An opaque `--black` tile: a black square with the knot in it, on every tab |
| Home screen (`apple-icon.png`), search engines (`knot-tile.png`) | The same tile |
| What browsers actually receive | The image optimiser re-encodes the mark lossily. Its AVIF gave **half** the pixels that should be clear an alpha of up to **19/255**, a faint haze round the knot. Its WebP left 27–71 pixels at 1–2/255. Browsers got WebP only because `images.formats` lists it first, so reordering that line for smaller photographs would have put the haze on every page |

**The platforms.**
- **iOS** ignores an apple-touch-icon's alpha and paints every clear pixel black
  ([Apple Developer Forums](https://developer.apple.com/forums/thread/713895)).
- **Google** requires the Organization logo to look as intended on pure white, and names a grey
  logo as the case that does not
  ([Search Engine Land](https://searchengineland.com/google-logo-schema-markup-now-requires-logos-to-look-good-on-white-backgrounds-376170)).
- **The browser tab** has no such rule.

**The name.** Before the Songmont pass, the brand name was set in Barlow Condensed, in tracked
capitals. ADR 043 moved it, with everything else, to Zen Kaku Gothic Antique. In that wide gothic,
the phone logotype needed a size of its own to fit.

## Decision

1. **Every copy of the logo a visitor sees has a transparent background, exactly.**
   - The tab icon is now the bare mark.
   - The lockup renders lossless PNGs at 1x, 2x and 3x of each variant's largest size
     (`BRAND_MARK_SRC`, 2–23 KB each), derived pixel-for-pixel from the master. They are served
     as they are, through a plain `<img srcset>` and not through next/image, so no format
     setting can reintroduce lossy alpha.
2. **A tile only where the platform cannot show transparency**: the home-screen icon and the
   search-engine logo stay on `--black`.
3. **The brand name is set in its original typography.** That is Barlow Condensed:
   - 500, `clamp(1rem, 1.4vw, 1.25rem)` and 0.10em in the header;
   - 400, 1.1rem and 0.12em in the footer;
   - capitals in both.

   These are the values `main` used before the Songmont pass. The footer declared no weight and
   rendered at 400, which is now declared. The family is self-hosted (latin slice, v13) beside
   the site face, under its own OFL. It is reached through one token, `--font-brand`, which only
   `.hj-lockup-text` may use. The phone-only 13px override goes, because it existed for the wide
   face.
4. **Songmont is a reference, not a template.** What was adopted stays while it suits the brand:
   the ground, the secondary grey, the composition, names in their own case, and one family for
   the site's text. Songmont's typeface is not studied further.

## Consequences

- **Measured on the production build:**
  - Desktop and phone headers, both over the hero and scrolled: the mark's box corners differ
    from the pixels just outside them by 0–2 levels, the photograph's own variation. There is no
    backing anywhere.
  - Header fit: the whole name fits from 353px and shows from 360px, the figure Barlow Condensed
    gave before the Songmont pass.
- **Enforced:**
  - `brand-mark-asset.test.ts` holds the eight transparent copies to clear corners, a clear
    share and no matte.
  - `visual-assets.spec.ts` decodes the bytes each browser received: they must be one of the
    lossless files, with α=0 at the corners.
  - `typography-weights.test.ts` bounds `--font-brand` to the logotype.
  - `font-files.test.ts` reads both families' files.
  - `glyph-coverage.spec.ts` asserts the logotype renders in Barlow Condensed, both weights load,
    and no other element uses it.
- **The tab icon's cost, measured, not hidden.** On dark tab strips the knot reads at a median
  5.6–7.4:1. On light ones it reads at 1.45–1.80:1, faint, which is what the tile was solving. If
  that matters more than an unbacked mark, the remedy that keeps the background transparent is an
  SVG icon whose knot darkens under `prefers-color-scheme: light`. That changes the knot's colour,
  so it is the owner's call, not this ADR's.
- **Bytes.** The two Barlow Condensed files add 42.6 KB of preloaded fonts, 62 KB in all. That is
  still under the 66.3 KB the site preloaded before the Songmont pass. The lockup's lossless PNGs
  cost a few kilobytes more than WebP.
