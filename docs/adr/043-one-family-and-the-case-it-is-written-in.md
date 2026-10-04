# ADR 043 — One family, and the case it is written in

**Date**: 2026-10-04
**Status**: Accepted. The reference (Songmont) is the owner's choice of 2026-10-04; the face, the
case rule and the phone logotype size are engineering decisions taken against it, each enforced.

## Context

The site was drawn in the Gentle Monster idiom: Barlow Condensed in forced capitals for every
heading and name, DM Sans for the rest. The owner moved the reference to Songmont and asked for
the site to align with its design language, typefaces included.

What is verifiable from here is narrow, and recorded in `DESIGN.md` ("Reference: Songmont") with
its sources. The live site, its Shop listing, its Behance brand book and Founder Type's pages are
all behind the build environment's network policy; search indexes are not. Two facts survive that
filter:

- **One family sets the identity.** Founder Type's case page for Songmont's tenth anniversary
  names the FW Tsukiji Gothic family (方正FW筑紫黑家族), applied by Studio DPi. Fontworks
  describes Tsukiji Gothic as modern sharpness with a classic, brush-softened warmth.
- **Pieces are named in Title Case**, as written: "Medium Gather Bag", "Medium Shan Messenger
  Bag". "View all" carries no arrow.

The site's own catalogue already wrote names in Title Case. Thirty-seven `text-transform:
uppercase` declarations on headings and names were overriding the content to produce the Gentle
Monster look.

Switching the face exposed three dependencies nobody had chosen:

1. **Inherited weights.** Twenty-seven headings and names declared no weight and inherited the
   body's 300. Barlow Condensed had no 300 face, so the browser rounded up and they rendered at
   400. A family with a real Light face turned all twenty-seven Light at once (measured: each
   computed 300). The weight they had shipped at was an accident of which faces were loaded.
2. **Glyph coverage.** The new family is Japanese; Google serves it as 121 slices per weight.
   Self-hosting only the latin slice means 219 characters, and the homepage's "View All →" and
   "Shop →" used U+2192, which is not one of them. A missing glyph is not an error: the browser
   draws that one character in the fallback face.
3. **Header fit.** A wide gothic in tracked capitals is wider than a condensed one. At the
   desktop clamp's 16px floor and 0.10em, the name needed 397px to clear the controls by the
   24px `header-fit.spec.ts` requires — hiding it on every 390px phone, which is far past the
   owner's "mark only at the narrowest widths".

## Decision

- **Zen Kaku Gothic Antique, for every role, at 300/400/500.** The closest openly licensed
  relative of Tsukiji Gothic: an antique gothic of the same lineage, SIL OFL with no Reserved
  Font Name. Tsukiji Gothic itself is a commercial face with no web licence here, and its Latin
  is the weakest part of it. The three `--font-*` tokens stay, because they name roles.
- **Self-hosted, latin slice only** (`src/app/fonts/`), through `next/font/local`.
  `next/font/google` downloads all 363 slices at build time to serve one; the three latin files
  are 29.0 KB together, against 66.3 KB of preloaded faces before. Provenance, licence and
  SHA-256 per file in `src/app/fonts/README.md`.
- **The file is read, not trusted.** `src/lib/design/fontFile.ts` reads a WOFF2's own tables —
  `cmap`, `name`, `OS/2` — so the weight class, family, licence and coverage are measured. No
  dependency: the table directory, the Brotli stream and three tables are 250 lines over
  `node:zlib`, covered by synthetic fonts in `font-file-reader.test.ts`.
- **A heading or a name is set in the case it is written in, at a declared weight.** Capitals
  belong to small `--font-ui` labels: eyebrows, buttons, badges, and the logotype, which moves
  to `--font-ui` in the header and footer alike. Tracking for mixed case is two tokens,
  `--tracking-display` and `--tracking-name`. The twenty-seven inherited weights are written
  out as the 400 they had rendered at — preserving what shipped rather than choosing anew.
- **The arrows go**, rather than a second font slice for one glyph. Songmont's "View all" has
  none.
- **The phone logotype is sized to the measurement.** 13px and 0.08em at ≤768px bring the fit
  to 357px against the 360px breakpoint — inside the spec's 16px headroom bound — so the name
  stays on every common phone. Desktop is unchanged.
- **The share card stays on Noto Sans.** Satori cannot read WOFF2 and the family's full TTF is
  a CJK font of several megabytes per weight; putting the card in the brand face needs a
  Latin-subset TTF built for it, which is its own decision.

## Consequences

- `typography-weights.test.ts` reads `next/font/local` as well as `next/font/google` loaders,
  and adds two rules: no `--font-display` style forces capitals, and none inherits its weight.
  Both judge the style object or the merged CSS selector, not a line window — `.hj-wordmark`
  took its capitals from a rule shared with two controls and its family from its own, and only
  the merge showed both. Each rule was seen to fail on its known-bad before it passed.
- `font-files.test.ts` holds each file to its declared weight, the README's SHA-256, the OFL,
  and every string in `src/content/**`. `e2e/glyph-coverage.spec.ts` holds every route's
  rendered text to the `cmap`, and asks the browser which face each role used and whether it
  loaded — the one failure every file-level check would pass.
- Not verified, and recorded as such: the US storefront's own web font and sizes, the header's
  proportions, and image crops. They need the live page; the 1:1 crop and the current header
  stand until it is seen.
