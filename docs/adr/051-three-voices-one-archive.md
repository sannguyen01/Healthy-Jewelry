# ADR 051 — Three voices, one archive

**Date**: 2026-10-09
**Status**: Accepted. The owner chose **full adoption** of the Quiet Archive system on 2026-10-09
("Full adoption (Recommended)"), to be built as a fresh pull request after #104 merged. This ADR
**supersedes [ADR 043](043-one-family-and-the-case-it-is-written-in.md)** (one family), **replaces
the tier weight rule of [ADR 050](050-one-face-means-no-borrowed-ones.md)** (its measurement
and its guards stand) and **widens [ADR 048](048-the-name-keeps-its-own-face.md)** (the name's face
is no longer the name's alone). It is written as the typography lands (workstream B1) and extended
as the palette, the chrome and the pages follow.

## Context

The owner supplied a design system (a Stitch export) and asked that it be adopted rigorously,
with the logo kept. It was drawn out as six boards (Home, Menu, Collection, Piece, System, Phone)
on a canvas before any code changed. Its type system is three voices: **Bodoni Moda speaks**,
**DM Sans explains**, **Barlow Condensed labels**, "the voice the name is already set in".

Three things in the repository had to give way to that:

- ADR 043's rule that **one family sets every role**, which was Zen Kaku Gothic Antique;
- ADR 050's rule that **weight is chosen by size** (h1 500, display at `--text-lg` or smaller 500,
  larger 400). It was right for a family whose only real weights were 400 and 500 and whose
  headings had nothing else to separate them from body copy. Bodoni Moda ships one weight, so
  weight can no longer carry hierarchy; size and cut do;
- ADR 048's guard that the label face **appears nowhere but the logotype**. Under the new system
  the name is "the first label", and the same face sets every label.

## Decision

**1. Three voices, six tokens.** Tokens name roles, and every rule keys on the role.

| Token | Face | File | Used for |
|---|---|---|---|
| `--font-display` | Bodoni Moda, 96pt cut, 400 | `bodoni-moda-96pt-latin-400.woff2` | `--text-display`, `--text-hero`, literal sizes of 36px or more |
| `--font-title` | Bodoni Moda, 24pt cut, 400 | `bodoni-moda-24pt-latin-400.woff2` | everything smaller: `--text-2xl` and below, every piece and collection name |
| `--font-body` | DM Sans, 400 | `dm-sans-9pt-latin-400.woff2` | running text |
| `--font-body-medium` | DM Sans, 500 | `dm-sans-9pt-latin-500.woff2` | `strong` and `b`, and `th` by default |
| `--font-ui` | Barlow Condensed, 400 and 500 | the two files ADR 048 shipped | labels, controls, badges, metadata; the only voice set in tracked capitals |
| `--font-brand` | Barlow Condensed | the same two files | the logotype alone (still one rule, still enforced) |

**2. Fixed instances, not variable files.** Google Fonts serves a static instance for a request that
names the axes (`opsz,wght@96,400`): one weight, latin slice, about 14 KB. The variable files are 45
KB and 61 KB and carry axes the site never sets. The price is that **an optical size is a file**,
which is why Bodoni Moda is two loaders. A didone's hairlines are drawn for its size; the 96pt cut
at the size of a piece's name would break up. The rule is by size *token*, not computed size,
because the tokens are `clamp()`s; the smallest display token is 38.4px, which is why 36px is the
line.

**3. A piece's name is `.hj-card-name`**: the 24pt cut at 400, 18 to 20px, no tracking (it was the
gothic at 15px and 500). Tracking follows the cut: `--tracking-display` for display, the new
`--tracking-title` for titles, none for names.

**4. Preload what the first paint needs.** The 96pt cut (the hero), DM Sans 400 (all running text)
and both Barlow weights (the bar and every label). `preload` is a property of a `localFont` call,
not of a file, so the 24pt cut and DM Sans 500 are calls of their own with `preload: false`: a
browser fetches a face when text that uses it is laid out, so a page pays only for what it uses.

**5. The documents outside the layout** (the 410 page, the root error boundary) declare three
faces themselves from three byte-identical copies in `public/fonts/`, one per voice
(`src/lib/design/siteFace.ts`). **The share cards** are set in the same voices, as TTF because
Satori reads TTF and not WOFF2 (`public/fonts/*.ttf`, byte for byte from Google Fonts).

## What was found on the way, and the guards it bought

| Finding | Why nothing caught it | Guard |
|---|---|---|
| **An unquoted fallback name with a digit in it (`Bodoni 72`) invalidated every `font-family: var(--font-display)`.** next/font writes `fallback` entries into the CSS as written, and a digit is not an identifier, so the whole list is invalid at computed-value time and the element inherits the body's face. Every Bodoni heading and name on the site was drawn in DM Sans, the CSS said otherwise, and the build was green | `rendered-fonts.spec.ts` allowed DM Sans as "a shipped face" | `typography-weights.test.ts` parses every `fallback` list and holds each entry to valid family syntax; `rendered-fonts.spec.ts` now holds each **role** to its voice (a page title is Bodoni Moda, a piece's name is Bodoni Moda, an eyebrow and the logotype are Barlow Condensed, `strong` is DM Sans). Shown to fail: the spec named "a page title is Bodoni Moda, drawn in DM Sans 9pt" on the broken build |
| A breadcrumb link measured 23px wide at phone widths, under the 24px target floor, because Barlow Condensed is narrower than the face it replaced and the link had a minimum height and no minimum width | `responsive-sweep.spec.ts`, which ran in the full local suite | `.hj-bc-link` has `min-width: 24px`; the sweep is the guard |
| The root layout imports the root card for its `alt` and `size`, so the card's three fonts are traced into **every page function** (15 traces), not only the card's | `audit-function-traces.mjs` failed the build, as designed | `RUNTIME_READS` entries may name traces by pattern (`app/*/page`); a route handler carrying the same fonts is still a stray |
| The role-to-face rule above does not apply to `th`: the shipping and materials tables set their column heads as labels on purpose | the first run of the voice rule | `th` is not in the voice table; `strong` and `b` are |

## Guards that moved with it

The face roster was hard-coded in five places and moved together: `rendered-fonts.spec.ts` (`SHIPPED`
by family, weights per face, the cut rule, and `family()` now strips an optical-size suffix),
`siteFace.ts` (three faces, three stacks, each ending in a generic keyword),
`typography-weights.test.ts` (six tokens resolved to loaders; the display voice ships one weight,
the body voice one weight per file; `--font-body-medium` is reachable only through `strong, b, th`),
`glyph-coverage.spec.ts` (the intersection of every face's coverage, each voice drawn by its own
loader, both Barlow weights loaded) and `font-files.test.ts` with the fonts README (six WOFF2 files and
three TTF cards, each with its own SHA-256 row, weight class, copyright and licence). ADR 050's
tier test is replaced, not re-pointed: **the cut follows the size, and every display weight is 400**
(`typography-weights.test.ts`, "the cut follows the size"). A new sentinel, `cut-follows-size`,
proves it can fail.

## What was measured, on the production build

| | Before (Zen Kaku + Barlow) | After |
|---|---|---|
| Faces drawn on a page | 2 families, 4 files | 3 families, up to 6 files |
| Preloaded | 62 KB | 71.0 KB: 21.2 + 21.4 (Barlow) + 14.2 (Bodoni 96pt) + 14.2 (DM Sans 400) |
| Fetched when used, not preloaded | none | 14.5 KB (Bodoni 24pt), 14.3 KB (DM Sans 500) |
| Build warnings | 0 | 0 |

The preload is **9 KB more** than before, and a page that sets names fetches 14.5 KB more again.
That is the cost of three voices instead of one; the audit's earlier estimate of 49 KB assumed
a preload per file, which `next/font` does not offer.

## What this does not do

- It does not retune the size ladder (about 40 sizes, unchanged since ADR 050); the palette
  (workstream B2), the chrome (B3), the homepage (B4) and the catalogue and piece pages (B5) follow
  in this pull request, each its own commit.
- The share cards keep the old hex colours until the palette changes; the cards' layout is
  otherwise unchanged apart from case (Title Case, not forced capitals) and size.
- Whether a hero set in the 96pt cut is as legible over the photograph as the gothic was is held
  by the existing `hero-legibility.spec.ts`, which passed unchanged; the card stays opaque and
  bounded (ADR 013).
