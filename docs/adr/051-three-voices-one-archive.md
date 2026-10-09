# ADR 051 — Three voices, one archive

**Date**: 2026-10-09
**Status**: **The design stands; the typography is superseded by [ADR 052](052-the-original-pair-on-the-quiet-archive.md).**
Bodoni Moda, the three-voice split, the cut-follows-the-size rule and the no-forced-capitals rule
described below were replaced the same day by the brand's original pair, Barlow Condensed and DM
Sans, on this ADR's palette, chrome and homepage. Read the typography sections as a record of what was
tried and measured; read the palette (B2), the chrome (B3) and the homepage (B4) sections as current.

Originally: Accepted. The owner chose **full adoption** of the Quiet Archive system on 2026-10-09
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

## The palette (B2)

The Quiet Archive's colours are a **value swap in one file**: components read `var(--bg)`,
`var(--ash)`, `var(--nacre)` and the rest, so changing what those mean recoloured the whole site
with no component edit. The board's names and the repository's meet like this:

| Board | Repository | Value | Role |
|---|---|---|---|
| Ground | `--bg` | `#FAF9F5` | the page (was `#F3F2EC`, "Pampas") |
| Subtle | `--subtle` (new) | `#F5F3ED` | an alternate band |
| Travertine | `--nacre` | `#ECE8E1` | a tile or a panel |
| Bone | `--bone` (new) | `#E4DFD5` | a chip |
| Hairline | `--ash` | `#DFDACF` | a divider and nothing else |
| Outline | `--outline` (new) | `#8A857D` | the edge of a control |
| Ink 2 | `--ink-2` (new) | `#5F5B55` | secondary text: captions, spec rows |
| Graphite | `--graphite` | `#3D3935` | running text, and the dark hover of the primary button |
| Ink | `--ink` | `#1A1918` | text, the primary button |

**A correction to the plan.** The audit that preceded this work mapped the board's *Ink 2* onto
`--graphite`. The board says otherwise: its paragraphs are set in Graphite and its captions in
Ink 2, and the repository's `--graphite` carries 69 uses, mostly paragraphs. So `--graphite` takes
the board's Graphite, `--ink-2` is new for the captions, and `--mid` (a dark hover with one use) is
gone: the board's hover is Graphite. `--sage` stays until the badges and the contact form are
restyled (B5); the board has one accent, titanium.

**`--outline` is a role change, not a recolour.** The hairline is 1.32:1 on the ground, right
for a divider and invisible as the edge of an input. Every control had used it. Controls now draw
their edge in `--outline` (3.48:1, past the 3:1 floor for a control's boundary), which also fixes a
real defect: a bordered control whose edge cannot be seen is not identifiable. A token test can
prove the values and cannot see which token a component names, so `layout-invariants.spec.ts`
("control edges") measures, in the browser, every bordered control on five routes against the
opaque surface behind it, unless its fill clears 3:1 itself. **Its first run found a control the
swap had not touched**: the dark ghost button on the contact page, an edge at 28% of the on-dark
colour on black, 2.22:1. It is at 50% now (4.72:1). A new sentinel, `control-edge-visible`, and a
known-bad proof (a control edged in the hairline is flagged) show the probe can fail.

Every light pairing is a row in `design-tokens-contrast.test.ts` (four grounds against four
text roles, and the badge tints over them); `--outline` is held to 3:1 by name and `--ash` is held
*below* it, so the reason the second token exists is itself part of the contract. The ratios in
`CLAUDE.md` are read back out of the stylesheet by the same test.

## The chrome (B3)

- **The open menu is an archive on the ground**, not a dark overlay: three columns on the
  12-column grid from 961px (the categories, the metallurgy, the places to go with a note on the
  foundation), one column below, then a search whose label stays above its field and a footer strip.
  It reads its lists from `navigation.ts` (`archiveCategories`, `mainNav`) and the metals from
  `hjMaterials`, which gained a `designation` ("Ti-6Al-4V ELI"): the specification line, never a claim.
  `header-fit.spec.ts` still holds the overlay to every `mainNav` entry and to a Search button; the
  search is now a real GET form to `/search` (a request from anywhere, ADR 045), so it works without
  script. A Tab cycle that skipped the field would walk past the one control that takes text, so the
  trap's selector includes inputs.
- **The icon beside MENU is for the wide bar only.** The board draws one on the phone too. It costs
  26px of the bar, which moved the width at which the whole name fits from 353px to 386px and
  would have hidden the name on every 375px phone; `header-fit.spec.ts` failed on it, and that is
  the measurement ADR 016 asks for. The phone keeps its text-only control.
- **One hairline and one label size.** The bar's open state is the same flat bar (the ground, one
  `--ash` hairline), and labels move to `--text-label` (13px), because Barlow Condensed at the
  11px spec size is too small to find your way by; `--text-xs` stays for spec rows. The old
  translucent `--line` token is gone, as is the dark `--mid`.
- **Shared primitives, defined once:** `.hj-label`, `.hj-spec`, `.hj-field` (an edge in `--outline`,
  the label always above), `.btn-primary` (ink, graphite on hover) and `MetalDot`, with two swatch
  tokens for the finishes the accent does not cover. The later workstreams adopt them.
- **The footer already had the board's structure**; it takes the board's label colour for its
  column heads, the small `--ink-2` copyright and an underlined preferences link (still a 44px
  target on a phone).
- **The board's copy is not adopted where it differs from the site's** ("Pure element. Honest
  craft." against the site's headline): copy is the owner's, and a design reference does not
  rewrite it.

## The homepage (B4)

The seven beats keep their order, their copy and every contract (ADR 040; no prices; claims through
`claimText()`); what changes is how each is drawn. Every beat is a **`.hj-band`**: a ground, the
section rhythm and a hairline under it, laid on a twelve-column `.hj-grid` (a 40px gap and a 1296px
ceiling, the board's) that collapses to one column at the 900px the hero already stacks at. The dark
band and the last band draw no hairline, because the change of ground and the footer's own rule are
their edges.

| Beat | Before | Now |
|---|---|---|
| Hero | 136px-at-most headline in a card centred on the photograph; a scroll cue | the board's 36 to 60px headline at 1.1 leading, the card at the photograph's foot with a hairline and the frame radius, `.btn-primary` and `.btn-ghost`, titanium dot at the head of the eyebrow; no scroll cue (the board has none). Stacked below 900px with the buttons full-width |
| Materials | three flex columns, ash ordinals at 3rem, a 200px photograph | a **registry**: intro and a link to `/materials` on the left, one ruled row per metal on the right (ordinal and provenance dot, name and designation, body and bone chips). The ordinals are `--ink-2` text now, so nothing on the homepage needs an axe exclusion |
| Care | `--black`, a "316L Ti Nb" watermark | `--ink`, a heading that is still "Care & Craft", the neutral claim copy, an "Ask an ambassador" button to `/stores`, and the knot and the name as a seal (`BrandSeal`) beside it |
| Strip | 260px cards, a bare view-all | 320px cards on a frame (`.card-tile` is now travertine, a hairline and the 6px radius everywhere), a label over a display title ("The pieces" / "Curated pieces"), spec-voice material line |
| Collections | five tiles across, three of them a drawn placeholder | **two photographs and an index**: the photographed collections (earrings, charms) as features, and every collection as a 64px row of the index, in the menu's own order. A collection without a photograph is a row, not an apology |
| The Moment | `hero-banner.jpg`, the hero's own photograph a few screens up | `philosophy-waterproof.jpg`, which the materials section no longer uses |
| Follow-up | a boxed link and a bare one | `.btn-ghost` and an underlined 44px link; the band draws no hairline of its own |

**Decisions made on the way**

- **The hero headline is smaller, and the card cap was recalibrated by its own rule.** 51 to 136px was a
  size chosen for a gothic; a didone that large reads as a poster, and the board's is 36 to 60px. The
  card then measured 0.467 of the photograph at the 901px floor (it was 0.514) and plateaus at 465px, so
  `--hj-hero-card-max-ratio` moved from 0.60 to 0.55, by the rule ADR 013 gives (today's maximum, rounded
  up, one step of headroom). The amendment is in ADR 013; the token, `CLAUDE.md`, the
  `doc-numeric-claims` row and the `hero-card-bound` sentinel moved together.
- **The hero's inset is the page's gutter.** `--hj-hero-pad-x` was a clamp of its own, a few pixels
  narrower, so the hero's words stood off the left edge every other band keeps.
- **Section padding tops out at 120px, not 96px** (`--space-section`), the board's rhythm; the editorial
  bands keep their own token. `layout-invariants.spec.ts` carries the new maximum.
- **`--text-section`** (28 to 42px) is the band title, between the names and the statement; like both it is
  set in the title cut.
- **Buttons are one family.** `.btn-primary`, `.btn-ghost` and `.btn-ghost-dark` share a 44px minimum, the
  4px radius, the label size and `--outline` / `--mist` edges. The ghost no longer fills on hover: the
  primary is the filled one, and a second filled state made the two read as the same control. The dark
  ghost's edge is `--mist` (the board's), not a 50% tint.
- **One dark.** The care band and the contact page's band are `--ink`. `--black` remains for the
  `CampaignBand` component (unused, and held by a sentinel) and as the ground of the two icons whose
  platform cannot show transparency; nothing a visitor sees on the site is `--black` any more.
- **The knot's seal has a 2x copy of its own.** The mark is drawn at 132px once, in the care band; its 1x
  is the stacked variant's largest copy and its 2x is a new 264px derivative (73 KB, lossless, lazy,
  below the fold), so a 2x screen is not sent an upscaled 1x. A 3x copy would be about 100 KB for an image
  that is ornament; a 264px copy at 3x density is only a little soft. `brand-mark-asset.test.ts`
  holds it to the same transparency, byte budget and derive-from-the-master checks as every other copy,
  and `visual-assets.spec.ts` now expects three marks on the homepage: header, footer and seal.
- **The collection tiles carry no illustration**, so the page reads the collection list and not the
  product list for them; `homepage-composition-contract.test.ts` says so (it used to require one product
  read).

**What was found on the way, and the guard it bought**

| Found | By | Fixed by |
|---|---|---|
| The strip stopped scrolling: its `overflow-x: auto` moved into a class in the components layer, and `.hj3-noscroll`'s `overflow: hidden` is in the utilities layer, which outranks an earlier layer whatever the specificity. Cards sat at x 258 to 475 in a 320px viewport | the interactive-controls probe (cards inside the viewport), not a test written for the strip | the declaration is inline again, with the reason in a comment |
| The Moment's photograph was 0 wide on phones: a filled image has no width of its own, and a column that centres its items gave the box none. The same bug the old component's comment records | `visual-assets.spec.ts`, "every image occupies a non-zero box", mobile project | `align-items: stretch` below 900px |
| The hero legibility probe read the card behind the label as the label's backdrop at every width from 390px up on the mobile project: the button's 4px radius is 10.5 device pixels at 2.625x, and the probe's inset landed on the arc, where the page's `--bg` is exactly the label's colour (1.00:1) | `hero-legibility.spec.ts` | the inset also clears the corner arc, `r * dpr * (1 - 1/sqrt2)` plus the rim; the probe's note says what it measured and where |
| The eyebrow measured 2.60:1: the box under test included the 6px titanium dot | the same spec | the words are in an element of their own |
| The strip's section gap was 24px over the rhythm: the row's padding under the cards, which keeps the scrollbar off the captions, is above the band's | `layout-invariants.spec.ts`, rhythm | the band gives up the same 24px |
| The rhythm probe measured a ruled list as ending at its last word, short of its closing hairline | writing the registry | a painted top or bottom border now extends the content block |
| The care band's heading test wanted "Care & Craft" as a heading; the first draft made it a paragraph above the title | `homepage.spec.ts` | `h2` for the name and `h3` for the title, styled by class, not by tag |
| `--ash` as a text colour on /about (body copy on the dark band) | adding `--ash` to the never-as-text list as an experiment | that one use became `--on-dark`; four more are decorative numerals on /about, /materials, /404 and the collection header, left for the audit that classifies them, and the list stays `--sage` alone |

**Guards that moved with it**

`homepage-composition.spec.ts` (the strip's name is now "The pieces"), `homepage-composition-contract.test.ts`
(tiles from the collection list alone), `design-consistency.test.ts` (a section takes its rhythm by being a
band, and the band reads the tokens; the one listing crop is read from the stylesheet),
`bounded-geometry.test.ts` (five classifications moved or added), `visual-assets.spec.ts` (the seal, and the
collection layout rewritten: the index lists every collection, two features side by side, the 3:4 crop
holds, the index drops below on a phone), `layout-invariants.spec.ts` (rhythm maximum and painted rules; a
brand mark is not a photograph for the aspect probe), `hero-legibility.spec.ts` (the corner arc),
`a11y.spec.ts` (the `data-decorative` exclusion deleted, with the paragraph in `testing-strategy.md`),
`design-tokens-contrast.test.ts` (`--mist` on `--ink`), `brand-mark-asset.test.ts` (the seal copy), and the
`glyph-coverage` sentinel (re-anchored to the strip's view-all link).

**Measured, on the production build**

| Hero card against its photograph | 901px | 1024px | 1440px | 2560px |
|---|---|---|---|---|
| width ratio | 0.467 | 0.426 | 0.323 | 0.182 |
| occluded-area ratio | 0.208 | 0.199 | 0.173 | 0.097 |
| card width | 421px | 436px | 465px | 465px |

The full Playwright suite on the finished band: 836 passed, 8 skipped, one failure and five flakes. Five of
those six are `visible focus indicators` (the documented local-only artefact, a 0px outline at the
instant of focus, which passes on CI); the sixth is a `header-fit` timeout under load that passes alone.

## What this does not do

- It does not retune the size ladder (about 40 sizes, unchanged since ADR 050) beyond the two sizes
  the homepage needed; the palette (workstream B2), the chrome (B3) and the homepage (B4) are in this
  pull request, and the catalogue and piece pages (B5) follow, each its own commit.
- The share cards keep the old hex colours until the palette changes; the cards' layout is
  otherwise unchanged apart from case (Title Case, not forced capitals) and size.
- Whether a hero set in the 96pt cut is as legible over the photograph as the gothic was is held
  by the existing `hero-legibility.spec.ts`, which passed unchanged; the card stays opaque and
  bounded (ADR 013).
