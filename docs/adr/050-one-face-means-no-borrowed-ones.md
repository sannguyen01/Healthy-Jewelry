# ADR 050 — One face means no borrowed ones

**Date**: 2026-10-09
**Status**: Accepted. The owner asked that all typography be consistently aligned across every
page, with no face that does not follow the design principles.
**Amended by [ADR 051](051-three-voices-one-archive.md):** the measurement, the guards for synthesis, italic, system
faces and the label floor stand; the weight-by-size tier rule is replaced (Bodoni Moda ships one weight).

## Context

[ADR 043](043-one-family-and-the-case-it-is-written-in.md) and [ADR 048](048-the-name-keeps-its-own-face.md)
settled which faces the site uses. Nothing measured which face the browser *drew*. So Chrome was
asked, node by node (`CSS.getPlatformFontsForNode`, the call behind the Rendered Fonts pane), on 22
routes and the open menu, on a desktop and a phone: 48 page states, 2,928 text-bearing elements.

**The faces were right.** Every glyph on every page was drawn by Zen Kaku Gothic Antique or Barlow
Condensed. No fallback or system face drew any text node. What the sweep found is that the
*request* and the *face* had come apart, in four ways:

| Finding | Where | What the browser did |
|---|---|---|
| `<strong>` and `<th>` ask for **700**, the browser default; the site ships 400 and 500 | 30 `<strong>` across Legal, Privacy, Terms and Shipping; the Shipping table head | Smeared the 500 to fake a bold |
| `font-style: italic` on the footer tagline, **on every page**; the face has no italic | `Footer.tsx` | Sheared an upright gothic into a slant |
| The 410 page a retired URL answers with (`/checkout`, `/orders/…`) is set in `system-ui`; the root error boundary names `"Zen Kaku Gothic Antique", sans-serif`, a family nothing defines there | `goneResponse.ts`, `global-error.tsx` | San Francisco, Segoe or Roboto by visitor; plain `sans-serif` |
| Labels declared at 9, 9.28, 9.92, 10, 10.4 and 10.88px; the smallest label token is 0.7rem (11.2px) | badges, the hero scroll cue, FAQ and Stores section labels, the nav controls, error pages | Drew them smaller than the system's own minimum |

And the same tier was set at two weights depending on the page. The 88px page title was 400 on
`/shop`, the collections and the piece pages, and 500 on About, Materials and Contact. The home
section heading was 500 and About's equivalent 400. A question heading was 500 in the FAQ and 400
in Materials. A piece's name was 400 in the grid and 500 in the strip. With one family, weight is
the only thing that separates a heading from body copy at small sizes, so it has to mean one thing.

## Decision

1. **The browser never draws a face the site did not ship.** `font-synthesis: none` on `<html>`.
   `strong, b, th` are 500, the shipped face; `em, i, cite, dfn, address, var` are upright. Nothing
   on the site is slanted, and no code may ask for italic.
2. **A document outside the layout declares the site face itself.** The 410 page and the root error
   boundary take `SITE_FACE_FONT_FACE_CSS` and `SITE_FACE_STACK` (`src/lib/design/siteFace.ts`)
   from two files in `public/fonts/`, which are the loader's own files byte for byte (the loader's
   are content-hashed per build, so they cannot be named from a plain `Response`). A button in such
   a document sets `font-family: inherit`.
3. **Display weight is chosen by role.** h1 is 500. Display text at `--text-lg` or smaller is 500,
   because below about 24px it competes with body copy in the same family. Larger display text is
   400. The rule is keyed to the size *token*, not the computed size, because the tokens are
   `clamp()`s: a heading is 35px on a desktop and 23px on a phone, and a weight that flipped across
   that boundary would be a different design on each. A piece's name has one definition,
   `.hj-card-name` (500).
4. **The label token is the floor.** Nothing is declared smaller than `--text-xs`'s own minimum
   (0.7rem). The one-offs now use the token.
5. **Measured in the browser, not argued from the CSS.** `e2e/rendered-fonts.spec.ts` asks Chrome
   which face drew every text node on 16 routes (including the 404 and the 410) and the open menu,
   in both projects, and fails on a face that is not ours, a system font, a weight outside 400 and
   500, any non-normal style, or text under 11px. Form controls must compute the page's family.

## Consequences

- **Proven able to fail**, at both tiers:
  - Unit (`type-system-floor.test.ts`, 14 tests; the tier rule in `typography-weights.test.ts`):
    five breakages of the floor tests (synthesis switched on, the footer italic back, the 410 back
    on `system-ui`, a 9px badge back, a drifted `public/` copy) and three of the tier rule (a
    large heading at 500, a small question heading at 400, a page title at 400) each turned the
    matching test red, and nothing else.
  - Browser: the three original defects reintroduced together (bare `<strong>` bold, the footer
    italic, the 410 on `system-ui`), rebuilt, and the spec failed on 16 of its 18 chromium tests,
    naming weight 700, the italic, and the 410 page as "drawn in DejaVu Sans (a system font)". On
    the real code, run four times over with retries off: 144 of 144 pass.
- **Two races found and fixed while writing the spec**, both worth knowing: the phone footer's
  groups arrive open and collapse after hydration, so an element can lose its box between marking
  it and asking Chrome about it; and a page measured before it arrived reads a hidden streamed
  segment (ADR 042), which `settle()` already handles.
- **Visible changes:** page titles on Shop, Collection and Piece go from 400 to 500, like About and
  Contact; the home Materials heading and the Materials page's question headings swap to their
  tier's weight; product names are 500 in the grid; the smallest labels grow to 11.2–12.5px; bold
  in the legal text is the 500 face; the footer tagline is upright. The nav controls grow from
  10.88px to the token (11.2px at 320px, 12.5px at 1440px); `header-fit.spec.ts` still passes.
- **Not done, and why.**
  - *The share cards.* `opengraph-image` is drawn by Satori in bundled Noto Sans Regular and Bold,
    a face the site does not otherwise use. Satori reads TTF, OTF and WOFF, not WOFF2, and the
    site's files are WOFF2 latin slices, so aligning them means shipping TTF instances of the same
    faces under the same licence-and-hash discipline as `font-files.test.ts`. It is the next
    typography item, to land with whatever face change follows rather than twice.
  - *The type scale itself* (about 40 distinct sizes, many from `clamp()`s) is unchanged. This ADR
    fixes the floor and the weights, not the ladder.
- **This is the system as it stands.** The owner has chosen the Quiet Archive's Bodoni Moda, DM Sans
  and Barlow Condensed as the next one, to be built as its own PR after #104 merges. Every rule
  above keys to tokens, loaders and files rather than to a family name, so that change moves the
  loaders, `siteFace.ts` and the copied files, and these guards then hold the new system to the
  same standard.
