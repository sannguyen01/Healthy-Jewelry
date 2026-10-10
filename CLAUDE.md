# CLAUDE.md — Healthy Jewellery Website

## Brand Identity
Healthy Jewellery is a premium titanium and non-corrosion metal jewelry brand. Implant-grade materials, biocompatible, designed for people with metal sensitivities.

**Positioning**: *Metal that works with your body.*
No stones. No gemstones. No healing crystals. No chakras. Pure material science.

**These lines are the brand's intent, not publishable copy.** "Implant-grade", "biocompatible",
"for people with metal sensitivities" and the positioning line itself are *claims*, and since
2026-09-25 (the owner's "enforce now" decision) a claim renders only when a named reviewer has
approved it against a document that covers the piece. Each is a pending record in
`src/content/claims/`; until it is approved the site renders the record's neutral fallback, and
`src/tests/unit/claim-lexicon.test.tsx` fails on the wording anywhere else in rendered copy. Write
the specification ("Grade 23 titanium, Ti-6Al-4V ELI") and route anything more through
`claimText()` in `src/lib/catalog/claims.ts`.

Materials: Grade 23 Titanium · Niobium (anodized) · 316L Surgical Steel

## Tech Stack
- Framework: Next.js 16, App Router, TypeScript (strict mode)
- Styling: Tailwind CSS v4 + CSS custom properties (T4 tokens in `src/app/globals.css`, Quiet Archive values)
- Fonts: **the original pair**, self-hosted (latin slice) from `src/app/fonts/`: Barlow Condensed
  for the display voice and the brand name, DM Sans for everything else
  ([ADR 052](docs/adr/052-the-original-pair-on-the-quiet-archive.md)). They set everything until
  2026-10-04 ([ADR 043](docs/adr/043-one-family-and-the-case-it-is-written-in.md) replaced them with
  one gothic family, and [ADR 051](docs/adr/051-three-voices-one-archive.md) tried a third); the owner
  set both aside and the pair is back under the Quiet Archive's layout. The name keeps its face by the
  owner's ruling ([ADR 048](docs/adr/048-the-name-keeps-its-own-face.md))
- Architecture: **`docs/architecture.md`** is the map of the whole system, front end to back end (requirements, data
  flow, the API table, the security boundary, caching, delivery, trade-offs). Read it before adding a route,
  a service or a layer ([ADR 053](docs/adr/053-the-other-layers-and-the-tree-the-browser-reads.md)).
- State: **none.** This said "Zustand (cart store)" until 2026-09-20; `src/store/` and the
  dependency both went with the bag. Nothing on this site holds client state across a
  navigation, which is a property worth keeping rather than an absence to fill.
- Package manager: pnpm
- Deployment: Vercel (auto-deploy on push to `main`)
- Testing: Vitest + Testing Library (80%+ coverage required)

## Design System — T4, Quiet Archive values (alabaster ground dominant)

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | #FAF9F5 | Ground (warm alabaster) — dominant background |
| `--subtle` | #F5F3ED | Alternate band |
| `--nacre` | #ECE8E1 | Travertine: card tile and panel background |
| `--bone` | #E4DFD5 | Chip |
| `--ash` | #DFDACF | Hairline: dividers only, never a control edge |
| `--outline` | #8A857D | Control edge (the WCAG floor for the boundary of a control) |
| `--ink-2` | #5F5B55 | Secondary text: captions, spec rows |
| `--graphite` | #3D3935 | Running text, and the dark hover of a button |
| `--ink` | #1A1918 | Primary text, logo, the primary button |
| `--titanium` | #9DA7AF | Accent — borders, tints, fills, text on dark |
| `--titanium-text` | #59636B | Titanium-toned **text** on light backgrounds |
| `--sage` | #8CA89A | Green accent — borders, tints, fills. **Not text** |
| `--sage-text` | #516159 | Sage-toned **text** on light backgrounds |
| `--error-text` | #B3261E | A field's error message and a failed submit, on light surfaces |
| `--metal-niobium` | #6F7FAE | A metal's finish as a provenance dot (anodized niobium). Decorative |
| `--metal-steel` | #BCC1C5 | A metal's finish as a provenance dot (polished 316L). Decorative |
| `--mist` | #A8A49E | Muted text — dark backgrounds only |
| `--on-dark` | #F0EDE8 | Text on dark backgrounds |
| `--black` | #0A0A0A | The ground of the two icons whose platform cannot show transparency (tab, home screen), and the unused `CampaignBand` (held by a sentinel, ADR 051). Nothing a visitor sees on the site is `--black` |

**Contrast rule**: the two chromatic accents are both below the WCAG AA 4.5:1 floor on `--bg` —
`--titanium` at 2.32:1 and `--sage` at 2.44:1 — so each has a darkened sibling for text. Use
`--titanium-text` (5.83:1) and `--sage-text` (6.22:1) for any accent-toned copy on a light surface;
the raw accents are fine for borders, tints, and (for `--titanium`) text on `--ink`/`--black`.
Neither `-text` token is a general-purpose text colour: both fail on dark surfaces, where
`--on-dark` and `--mist` apply. `--ash` is a divider at 1.32:1 and can never be the edge of a
control; `--outline` is, at 3.48:1.

This table is enforced too, not just the pairings: `design-tokens-contrast.test.ts` reads every
hex above and every ratio in the paragraph above back out of this file and compares them against
`globals.css`. It listed `--titanium-text` as `#5E6870` until 2026-08-28 — the value that was
*rejected* for measuring 4.39:1 on the bestseller badge's composited tint, which is why the real
token is `#59636B`. The ratio beside it was right and the swatch was wrong: somebody updated the
number and not the colour, and nothing compared the two.

Every documented pairing is enforced by `src/tests/unit/design-tokens-contrast.test.ts` — add new
pairings there. A new colour token must be **classified**: either a `TEXT_PAIRINGS` row naming the
surfaces it renders text on, or an `ACCENT_ONLY` entry saying what it is for. There is no third
option, because "unclassified" is how `--sage` shipped as 9–13px text at 1.97:1 in four places.

**Ease tokens**:
- `--ease: cubic-bezier(0.16, 1, 0.3, 1)` (smooth spring)
- `--ease-sharp: cubic-bezier(0.00, 0.00, 0.30, 1.00)` (sharp snap)

### Typography — the original pair (ADR 052)
Two families, four tokens. The tokens name **roles**, and the case and weight rules key on the role:
- `--font-display` → Barlow Condensed 500: headings, page titles, product, collection and metal
  names, collection numbers, the menu's links. **Tracked capitals, at a declared weight**, tracked
  with `--tracking-display` / `--tracking-title` / `--tracking-name` (looser as it gets smaller).
- `--font-ui` → DM Sans 500: nav controls, eyebrows, buttons, badges, metadata. Small, and tracked
  capitals too, in two steps: `--tracking-meta` for a datum beside a name (a specification, a tag, a
  breadcrumb) and `--tracking-label` for everything read or pressed as a label. **Only capitals are
  tracked**, and a `letter-spacing` is a token or nothing (`typography-tracking.test.ts`; the browser
  half is in `e2e/rendered-fonts.spec.ts`).
- **Size and leading are scales too.** A `font-size` is a `--text-*` token (what may set its own is named
  in `typography-scale.test.ts`: the brand name, decorative numerals, a piece's name), never with a
  fallback; a `line-height` is `--leading-display` (headings), `--leading-snug` (a name or one-line
  label), `--leading-text` (running text) or `--leading-long` (long-form reading), and a heading does
  not take a paragraph's. A form control is never set smaller than the base text size on a phone, or iOS zooms the page on focus.
- `--font-body` → DM Sans 300: body text and descriptions. Emphasis (`strong`, `b`, `th`) is the 500
  of the same family. Never capitals.
- `--font-brand` → **the brand name, and nothing else**: the logotype in the header and the
  footer, in Barlow Condensed, the typography it had before the Songmont reference — 500 in the
  header, 400 in the footer, in tracked capitals. The owner's ruling (2026-10-04,
  [ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)): Songmont is a reference for the site,
  not a template for the brand. `typography-weights.test.ts` fails if any rule but
  `.hj-lockup-text` uses it, and `e2e/glyph-coverage.spec.ts` if any other element renders in it.

**Loaded weights — never request one that isn't here:**

| Token | Font | Weights available |
|-------|------|-------------------|
| `--font-display` / `--font-brand` | Barlow Condensed | **400, 500** |
| `--font-ui` / `--font-body` | DM Sans | **300, 500** |

There is deliberately **no 400 in DM Sans**, and a request for one is not ignored: the nearest-weight
rule answers it with the 500, so running text would be set in Medium with nothing in the stylesheet to
say so. The test below fails on it. Running text is 300, as it was; labels and emphasis are 500.

A weight with no downloaded face is not ignored — the browser *synthesises* it,
smearing the strokes of the nearest face and distorting the letterforms, so the text reads as a
different typeface. Nine pages once asked Barlow Condensed for 700 and rendered a fake bold beside the
homepage's real 500. Enforced by `src/tests/unit/typography-weights.test.ts`, which resolves each
`--font-*` token back to its loader and fails on any weight that font does not ship. To use a heavier
face, add its file to the `localFont` call in `src/app/layout.tsx` first.

The same test fails a `--font-display` or `--font-ui` style that does not force capitals, one that
**inherits** its weight, and a `--font-body` style that forces capitals. The second is not pedantry:
twenty-seven headings inherited the body's 300 and rendered at 400 only because Barlow Condensed had
no 300 face; the first family with a real Light turned every one of them Light.

**The faces draw a little over two hundred characters, and nothing else renders in them.** Only the latin slice ships, so
a character outside it — an arrow, a check mark — is drawn by the fallback face mid-line. Use what
the slice has (`src/app/fonts/README.md`), or ship the slice that has it. Enforced over
`src/content/**` by `font-files.test.ts` (which also reads each file's own weight class, licence
and SHA-256) and over every route's rendered text by `e2e/glyph-coverage.spec.ts`.

**The browser draws only what the site shipped, and the same tier is the same weight everywhere**
([ADR 050](docs/adr/050-one-face-means-no-borrowed-ones.md)). Measured 2026-10-09 by asking Chrome
which face drew every text node on 48 page states: the faces were right, but the *requests* were not.
`<strong>` and `<th>` asked for 700 (faked bold), the footer tagline was italic on every page (a
sheared upright gothic), the 410 page was set in `system-ui`, and one heading tier had two weights.
So: `font-synthesis: none` on `<html>`; `strong, b, th` are 500 and `em, i, …` are upright; **nothing is
italic**; **every display and label style is 500 and every running-text style 300**, declared;
a piece's name is `.hj-card-name`; **nothing is declared below `--text-xs`'s minimum** (0.7rem), so
use the token; and a document outside the layout (the 410 page, `global-error.tsx`) declares the faces
itself from `src/lib/design/siteFace.ts`, whose files in `public/fonts/` are the loader's, byte for byte.
Enforced by `type-system-floor.test.ts`, the weight and case rules in `typography-weights.test.ts`, and
`e2e/rendered-fonts.spec.ts`, which reads Chrome's own report of the face, weight, style, size and case used.

**Page titles use `PageHeader`** (`src/components/ui/PageHeader.tsx`) — never a hand-rolled `<h1>`.
Two variants, chosen by what the page is for: `display` for brand/marketing routes (Our Story, Contact,
Materials, Stores) and `compact` for utility/legal routes (FAQ, Shipping, Terms, Privacy, Legal). The
homepage hero is the one exception, since it owns `--text-hero`.

### Architecture — the Quiet Archive, in the original typography
The layout, palette and chrome are the Quiet Archive's ([ADR 051](docs/adr/051-three-voices-one-archive.md):
a gallery ground, hairline structure, the archive menu, the registry-and-index homepage); the
typography is the brand's original pair ([ADR 052](docs/adr/052-the-original-pair-on-the-quiet-archive.md)).
Songmont, the reference before it (the owner's choice, 2026-10-04), was **a reference, not a template**
(the owner's ruling, 2026-10-04): take what suits Healthy Jewellery and leave what does not. What was
verified about it, what was adopted, and what was decided from the language without the live page is
in `DESIGN.md`, "Reference: Songmont" — read that before changing a token, a section or a card.
- Horizontal scroll strips on homepage (no product grids), each with a "View All" link
- The alabaster ground (`--bg`) everywhere, with `--ink-2` carrying secondary text and
  `--graphite` running text
- Single dark interruption: the Care band (`CareSection`, ADR 040). The campaign band it
  replaced is gone
- Nav: three states, and the state is a fact about the page, not a distance scrolled
  ([ADR 054](docs/adr/054-one-hero-one-coordinate-system.md)). `hero-overlay` lies over the hero, on `/`
  alone (`<Nav heroTone=… />`), with light type on a darkened band or ink on a light one as the hero
  record's `headerTone` says (the band is the bar's own background, strong enough for any
  backdrop and to hide what scrolls under it: `header-veil.test.ts`); `solid` is `--bg` with a hairline, which every other page is from its
  first byte and `/` becomes once the hero's own end marker (`[data-hero-end]`, read by
  `useHeroOverlay`) has passed the top; `menu-open` is the flat bar over the archive, with `main` and
  the footer inert. It read `scrollY > 60` on every route until 2026-10-10, so a page with no hero was
  transparent for its first stretch. Flat: no blur, no shadow (`design-consistency.test.ts`). It said
  "frosted glass" until 2026-10-04. The bar's height is `--header-height`, written once.
- Cards: image + name + material — never a price (see "No prices, anywhere"). Listing cards crop
  3:4 (`--ratio-product`), the same crop as the homepage's collection and material tiles; the
  product detail tile alone is square ([ADR 044](docs/adr/044-decided-from-the-language-not-the-page.md))

### Header composition — two layouts, breakpoint at 768px
- **≥769px**: MENU · centred brand lockup (knot mark + name) · SEARCH · CONTACT.
- **≤768px**: MENU · brand lockup · a Search icon. CONTACT leaves the bar; the full-screen
  overlay carries every `mainNav` link and a second Search. (Until 2026-10-04 these two lines
  described a Bag control and centred primary links, neither of which survived the redesign.)
- The header **must fit 320px**. It did not: with four controls in the bar it required 414px
  empty and 435px with a bag badge, so on every phone the MENU button — the only route to
  navigation there is — was cut off at the viewport edge. See
  [ADR 016](docs/adr/016-fit-is-a-measurement-nobody-took.md).
- **Those two widths are historical, measured 2026-08 against a four-control header.** The
  Account control was removed on 2026-09-19 and the bar now carries three, so the real
  numbers are lower. They are not re-measured here on purpose: they are the record of what
  the defect cost, and replacing them with today's figures would falsify that account rather
  than correct it. The live number is the one `e2e/header-fit.spec.ts` prints on every run
  as a `minimum fitting width` annotation — read that, not this line.
- **The brand gives, the controls never do.** The lockup's column can shrink
  (`.hj-header-center { min-width: 0 }`), the mark never does, and the name is shown whole or
  not at all: below 360px the name is not rendered and the knot mark stands alone, because a
  cut-off name reads as a fault. Measured 2026-10-04, the whole name keeps the controls' own 24px spacing from 353px
  in Barlow Condensed — the face the name is set in (ADR 048) — at the header's own size, with no
  phone-only override (the spec bounds the gap to the breakpoint at 16px either way).
  An unreachable control is a functional loss; a hidden name is not. This is why the 768px breakpoint
  is a *composition* choice rather than a correctness dependency: get it wrong and the layout
  degrades instead of amputating.
- Enforced by `e2e/header-fit.spec.ts`, which sweeps 320–1440px and binary-searches the
  narrowest fitting width per layout mode, and prints the lockup's measured headroom as a
  `brand lockup` annotation. Probes are geometric — element boxes against
  `window.innerWidth` — because `scrollWidth` is blind here twice over (the header is `fixed`,
  and `globals.css` sets `overflow-x: hidden`), and because `toBeVisible()` and `.click()` both
  pass on a control whose centre is off-screen.

### Brand name and mark
- The name renders only through `SITE_NAME` ("Healthy Jewellery", spelled as the domain is).
  `LEGAL_ENTITY_NAME` ("Healthy Jewelry") is the registered company on `/legal`, `/terms`,
  `/privacy`, `/shipping` and the footer's copyright line, and is counsel's to change (WS-H).
  `brand-name.test.ts` fails on a typed copy of either spelling anywhere else in rendered code.
- The mark is rendered by `BrandLockup.tsx` in the header and the footer, from `BRAND_MARK_SRC`:
  lossless PNG at 1x, 2x and 3x, served as they are. **Its background is transparent, exactly**
  (the owner's instruction, ADR 048), which rules out the image optimiser: its lossy re-encode
  left alpha where the mark is clear. The browser-tab icon is transparent too. The home-screen
  icon and the search-engine logo stay on a `--black` tile because their platforms cannot show
  transparency (iOS paints it black; Google lays the logo on white).
  Every served copy is derived from `assets/brand/knot-master.png` by
  `node scripts/build-brand-mark.mjs` — never exported from an image editor.
  `brand-mark-asset.test.ts` compares each copy with what the master derives, pixel for pixel,
  and checks its edges for the black matte the master was keyed out of. See
  [ADR 041](docs/adr/041-a-transparent-logo-is-a-measurement.md).

## Homepage Section Sequence
Seven beats, decided in [ADR 040](docs/adr/040-seven-beats-one-strip.md) (the earlier eight-beat
sequence — three strips and a campaign band — is superseded). Pinned in source order by
`homepage-composition-contract.test.ts` and in rendered order by `e2e/homepage-composition.spec.ts`;
change all three together.
1. Hero — **one composition on every width**
   ([ADR 054](docs/adr/054-one-hero-one-coordinate-system.md)); the crop changes at the
   breakpoint at 900px, the composition does not:
   - The photograph is the hero's geometry. It begins at the top of the page, under the fixed header,
     and fills the first screen (`--hj-hero-min` is the floor, `--hj-hero-max` the ceiling, `svh` the
     unit). The header, the copy and the actions are layered inside it, in a safe zone defined from
     `--header-height`, the record's copy corner and the consent notice's published height
     (`--hj-consent-h`, written by `ConsentBanner` while it is up, and estimated before the first paint by
     `CONSENT_PREPAINT_SCRIPT` when nobody has answered, so a first visit's hero does not move when the
     notice arrives). Nothing opaque sits between the
     visitor and the photograph unless the record asks for a card.
   - **Art direction is data**: `src/content/hero/home.json`, read through `heroMedia()`. For a wide
     screen and a narrow one it holds the source, the focal point, the subject box, the copy corner and
     the variant (`overlay` or `card`); it also holds the header tone, the literal alt text and the
     image's provenance. The provenance rules are in the schema: a photographed image names real
     pieces, an AI-origin one names none, an approval names a person and a date, and no agent writes an
     `approved` state. The current photograph is an **interim** (its embedded manifest says an
     algorithm made it, and it shows jewellery that is not ours); replacing it is a record edit,
     a re-measure (the hero's floor, the copy veil's strength and the short-phone bounds are tokens and media
     queries in `globals.css`, tuned to this photograph) and an owner gate in `STATE.md`.
   - Variants: `overlay` lays the copy on a veil as tall as the copy plus a fade (light type, a
     ground-coloured primary button, a light focus ring: an `--ink` ring and button vanish on a dark
     surface); `card` is the opaque, hairlined, bounded card of
     [ADR 013](docs/adr/013-a-protection-that-can-only-grow.md), capped at
     `--hj-hero-card-max-ratio` (0.55) of the photograph's own rendered box. The wide crop may be
     either; the narrow crop is always an overlay, and the schema refuses a card there.
     Under an overlay `.hj-hero-copy` is `display: contents`, so the card's bound has no box to bound.
   - A veil is a legibility device, not a palette filter: its strength is a token
     (`--hj-veil-bar`, `--hj-veil-copy`) set by the rendered-pixel test, never by eye. The hero has one
     veil, the copy's; the bar's belongs to the bar (below). The page's
     single dark band is still the Care band: the hero section keeps `--bg`, and the dark fallback
     the veils composite on lives on `.hj-hero-media`.
   - The entrance is CSS (`hjSlideUp`, staggered by `--stagger`) and is removed under
     `prefers-reduced-motion`; the hero is a server component. A timer that set every child to
     `opacity: 0` after hydration is why it was not.
   - Enforced by `e2e/hero-legibility.spec.ts` at eleven widths, 900 and 901 both: the photograph is
     the first screen, nothing overlaps, the copy stays in its safe area, the worst pixel behind each
     word and each of the bar's own controls clears AA with the photograph present and blocked, for
     the bar at several depths of the hero (it stays over the hero while it scrolls; the logotype, a
     logo, is exempt), the subject is
     in frame and clear of the copy, and it holds with no motion, no script, forced colours, large
     text and the consent notice up. Never lay copy on the photograph without a veil or a card.
   - History, superseded by ADR 054. The hero used to be **two compositions**. **≥901px**: full-bleed,
     with the copy in an opaque card (`.hj-hero-scrim`) at the foot of the photograph; no decorative
     overlay on the photo, because the ring-arc SVG ornament removed on 2026-08-03 sat on the
     photograph at `right: -120px` and read as a distorted double-overlay. **≤900px**: stacked, copy
     on `--bg` and the photo as a 16:9 band beneath it, because
     at 390px the `right center` crop discards 75% of the frame including the subject. That answered
     the crop by moving the photograph off the first screen; the fix is a crop per width, as data.
2. MaterialsSection — a **registry** of the three metals (Grade 23 Ti / Niobium / 316L Steel): a left
   column with a link to `/materials`, and on the right one ruled row per metal (ordinal and
   provenance dot, name and designation, description and specification chips, all from `hjMaterials`).
3. CareSection — "Care & Craft", copy through the claims registry, then "Ask an ambassador". **The
   page's single dark interruption** (`--ink` / `--on-dark` / `--mist`, all contrast-tested), with the
   knot and the name as its seal (`BrandSeal`), placed beside the materials it follows and inside the
   first half of the page.
4. HorizontalScroll — "The pieces" / "Curated pieces" (4–6 items, bestsellers then new arrivals,
   deduplicated)
5. CollectionGrid — **two photographs and an index**: the collections that have a photograph
   (earrings and charms) are the two features, and the index lists all five collection paths in the
   menu's own order, so a collection without a photograph is a row, not a placeholder.
6. RealMoment — "The Moment"
7. FollowUp — links come from `SOCIAL_LINKS`, never a generic domain

Every beat is a `.hj-band` (a ground, the section rhythm and a hairline under it) laid on the
twelve-column `.hj-grid`; the dark band and the last band draw no hairline.

**One container.** `--hj-container` is the one place the grid's ceiling is written. A band's text, the hero's
copy (the safe zone's grid lines), the strip's head and first card (`--hj-edge`) and the footer all start at the
same edge, and end at the same one: the gutter on a narrow screen and, once the viewport outgrows the container,
the container's own. The strip's cards are a quarter of it from the point where it reads as a row of four, so four fill it
and the fifth is begun. Held by `e2e/homepage-composition.spec.ts` at six widths from 1024 up. The hero, the strip and
the footer each had an edge of their own until 2026-10-10.

Then the Footer, which is site chrome rather than a beat (it was numbered 8 under "seven beats").

## Product Detail Page — the image tile

The tile is **square and bounded on both sides**: `aspect-ratio: 1 / 1` shapes it,
`--hj-product-tile-max` (560px) caps it, and there is no `min-height`. It carried
`min-height: 480px` *and* `aspect-ratio: 1 / 1` — which cannot both hold, because min-height wins
and the ratio then derives the width from it. The tile rendered 480 x 480 at every width and hung
184px past a 320px viewport, invisibly, since `globals.css` sets `overflow-x: hidden`. Never give
it a `min-height` again, and never let it grow uncapped: the detail section has no `max-width`.

Illustration `viewBox`es live in `src/lib/svg/viewbox.ts`, not in `JewelrySVG`, and each is the
measured tight bounds of its own artwork. That is what makes `ProductImage`'s `svgScale` mean "how
much of the tile the illustration fills" — with padded boxes it did not, and one `svgScale="70%"`
produced a 7x spread in rendered size. A new illustration needs a measured entry there, not a
hand-guessed one.

Enforced by `e2e/product-image-fit.spec.ts` (containment, squareness, the cap, extent bounded both
ways, clipping, spread across ratios, buy-control position) and
`src/tests/unit/svg-viewbox-contract.test.tsx`. See
[ADR 017](docs/adr/017-a-box-that-could-not-be-both.md).

## Architecture Principles
- Server Components by default; `'use client'` only for interactive elements
- Components: `svg/` (JewelrySVG), `ui/` (atoms), `layout/` (Nav/Footer), `home/` (page sections), `product/` (product components), `contact/` (the form), `analytics/` (the measurement-preferences control), `seo/` (JsonLd/Breadcrumbs — `Breadcrumbs` is shared across `/shop`, `/shop/[collection]`, `/products/[handle]`; each page also emits a matching `BreadcrumbList` via `breadcrumbJsonLd()`)
- **Content**: `src/content/catalog/**` — 17 product records and 5 collection records, as
  reviewed JSON. This is the **only** product data source.
- **Reader**: `src/lib/catalog/**` — the only runtime access layer. `schema.ts` validates
  every record through Zod at module load, so a malformed one **fails the build**
  (`next.config.ts` imports the reader to make that happen once per build). No page,
  component, API route, script or test may import a raw record; enforced through the
  TypeScript compiler by `catalog-import-boundary.test.ts`, not by a grep.
  See [ADR 034](docs/adr/034-the-catalogue-is-the-source.md), which supersedes ADR 004.
- `src/lib/data/hj-data.ts` — **materials copy only** (three metals). Not a catalogue: a
  metal has no handle, URL, sizes or photograph. `hj-data.test.ts` asserts its export
  surface is exactly `hjMaterials`.
- **Commerce**: nothing here can be bought, and that is a **contract** rather than a
  description. `COMMERCE-ELIMINATION-CONTRACT.md` is parsed on every pull request; a
  commerce identifier, package, route or document that is neither classified there nor owned
  by a row in `docs/commerce-dependency-register.md` fails the build. See
  [ADR 036](docs/adr/036-a-prohibition-in-prose-is-not-a-boundary.md), and
  `docs/commerce-elimination-masterplan.md` for the nine workstreams that burn the register
  down. A new file carrying a commerce identifier is a defect until somebody classifies it —
  `executable` is the default class.
- **What is deliberately still standing**: `src/lib/shopify/cacheTags.ts`, because
  `/api/webhooks/shopify` still imports it. `/api/revalidate`, `src/config/shopify*.ts` and
  `src/lib/shopify/api-version.ts` were deleted by WS-A on 2026-09-25, and `/api/version`
  now reports the build fingerprint with no vendor block. The webhook subscriptions must be
  deleted in the platform console *before* the endpoint is removed, or it retries against a
  failing route for its full backoff schedule. That is the masterplan's **WS-F** ordering
  (the browse-only plan called it WS-7), and the connector is currently `needs_reconnect`.
- Hooks: `src/lib/hooks/useReveal.ts` — IntersectionObserver scroll-reveal hook, returns `[ref, visible]` tuple, triggers once then disconnects

### No prices, anywhere
Nothing on this site can be bought, so no surface may render a price, a currency symbol or
a currency code. `formatPrice` has no caller; JSON-LD emits `Product` with **no** `offers`,
`price`, `availability` or purchase `url`; the OG card carries a name and a material and
nothing else. Enforced from both ends by
`src/tests/unit/price-absence-contract.test.tsx` — rendered output *and* a source scan —
and over HTTP by `scripts/verify-browse-only.mjs`.

### Animations
Keyframes defined in `globals.css`:
- `hjSlideUp` — fade + translate up (the hero's entrance, section entrances)
- `hjFadeDown` — subtle fade + translate down
- `hjSlideIn` — fade + translate right
- `hjFadeIn` — simple opacity fade

CSS classes: `.animate-hj-up`, `.animate-hj-slide`, `.animate-hj-fade`

## Content Data (NO STONES/GEMS)
- `src/content/catalog/products/*.json` — 17 products · `collections/*.json` — 5 collections
- `src/lib/data/hj-data.ts` — 3 materials
- Collections: rings, necklaces, earrings, bracelets, charms
- Materials: Grade 23 Titanium, Niobium, 316L Surgical Steel

## Site Map
- `/` → Homepage
- `/shop` → All products with filter
- `/shop/[collection]` → Per-collection (rings/necklaces/earrings/bracelets/charms)
- `/products/[handle]` → Product detail page
- `/about` → Brand story
- `/materials` → Materials science page
- `/search` → Search results
- `/contact` → Contact page (form + email info)

## Coding Standards
- Strict TypeScript, no `any`
- Named + default exports on all components
- Run `pnpm lint && pnpm build` before every commit
- Run `pnpm test` — maintain 80%+ coverage
- When an instruction has two readings and a large revert on each, **ask before acting** (ADR 052): the owner's
  "keep current designs, I just want to change the typography" was first read the wrong way round and reverted a design.
- Commit format: `feat|fix|docs|style|content|test|refactor|perf|chore: description` — the same
  types `.github/PULL_REQUEST_TEMPLATE.md` lists (the two disagreed about `docs`, `refactor`
  and `perf` until 2026-10-04)

## Testing & CI
Full detail in **`docs/testing-strategy.md`**. In short:

- **`verify`** (lint · type-check · unit · build, ~2 min) is the merge gate.
- **`e2e`** (Playwright, both projects, about seven minutes on CI) runs on every PR and blocks.
- `vitest` coverage is scoped to `src/lib`, `src/store`, `src/config` on purpose — **E2E is the only
  automated coverage the UI layer has.** Anything a user has to see or click belongs in `e2e/`.
- Presence is not visibility. `e2e/visual-assets.spec.ts` asserts imagery actually renders — bytes
  arrive, the box is non-zero, and the effective opacity clears the legibility floor.
- **And absence is invisible to both.** Every per-image check passes on zero images: the logo
  was missing from the header and footer for the whole redesign, and everything stayed green.
  `e2e/visual-assets.spec.ts` now asserts the marks are *there*.
- **axe reads the DOM; a screen reader is handed the accessibility tree.** `e2e/a11y.spec.ts` scans every page at
  every impact level, in the states a visitor reaches, **and** reads the tree through the protocol: every piece
  link on the listing pages had no accessible name (an `<article>` inside the `<a>`) while axe passed all of them.
  A new interactive element is checked in the tree, not only by axe ([ADR 053](docs/adr/053-the-other-layers-and-the-tree-the-browser-reads.md)).
- **A function with a unit test is not a feature; the page's output is.** `organizationJsonLd()` was tested for weeks and
  rendered by no page. Assert what the served page contains (`e2e/metadata.spec.ts`), not only what the builder returns.
- **Every design layer is a token with a guard**: colour, motion, layers, elevation, space, shape and breakpoints in
  `design-layers.test.ts`, type in `typography-*.test.ts`. A new value is a token first, then a use. When the look of
  something changes, measure what is rendered (face, weight, size, leading, tracking) before and after.
- **A page can be measured before it arrives.** The root `loading.tsx` fallback can still be on
  screen when `page.goto` resolves, with the real page in a hidden streamed segment; a probe that
  measured then saw zero-sized boxes and passed. `settle()` waits for the reveal, and a probe
  root with no box throws. See [ADR 042](docs/adr/042-a-page-measured-before-it-arrived.md).
- **And every page is measured, not only the ones a spec was written for.**
  `e2e/responsive-sweep.spec.ts` visits all 14 page routes at every width its project stands
  for and fails on anything past the viewport, a control under 24px, overlapping controls, or a
  page error. Its first run found `/search`'s button off-screen at 320px — a page no geometric
  spec had visited. See [ADR 045](docs/adr/045-a-form-is-a-request-from-anywhere.md).
- **And visibility is not reachability.** `toBeVisible()` returns true for a control whose centre
  is outside the viewport, and `.click()` deliberately aims at an in-viewport point instead, so
  both pass on a button a thumb cannot hit. `e2e/support/viewportFit.ts` measures geometry
  instead — see [ADR 016](docs/adr/016-fit-is-a-measurement-nobody-took.md).
- E2E runs against a **production build** (`pnpm build && pnpm start`), never `pnpm dev` — that is what
  Vercel serves.
- **The gate is itself monitored.** A run that dies in setup reports every check as `skipped`, and
  from outside a skipped check is indistinguishable from a passing one — that is how `main` stayed
  unbuildable for a day across eleven merges. `scripts/probe-ci-liveness.mjs` (six-hourly, via
  `control-audit.yml`) raises `merge-gate-dark` when CI runs on `main` stop evaluating the
  repository. It keys on **`Lint` alone**: an ordinary red build also skips everything after the
  step that failed, so demanding all four ran would alarm on every broken PR and be muted within a
  week ([ADR 011](docs/adr/011-repeated-identical-failures-must-escalate.md)).
- A workflow `if:` that reads another step's result **must name its own status function**. GitHub
  ANDs `success()` onto any condition that names none, so a question about configuration silently
  becomes a question about execution — see
  [ADR 027](docs/adr/027-governance-and-execution-are-different-questions.md), enforced by
  `src/tests/unit/workflow-condition-contract.test.ts`.
- **`pnpm-lock.yaml` is regenerated, never merged.** Twice a lockfile conflict was resolved by
  keeping both sides of every hunk — the second time in GitHub's web editor on PR #101 — and each
  time pnpm, CI and Vercel refused the result (`ERR_PNPM_BROKEN_LOCKFILE`). `.gitattributes` now
  sets `merge=binary`, so git leaves no hunks to keep. The "Manifest and lockfile integrity" step,
  which passed on that lockfile, now reads its keys and both files' conflict markers before the
  install. Resolve with `docs/runbooks/lockfile-conflicts.md`. See
  [ADR 046](docs/adr/046-a-resolved-conflict-is-a-write-nobody-reviewed.md).
- **A server function ships what it traces.** A `readFile` whose path Turbopack cannot resolve
  traces the whole repository into the function — tests, ADRs and scripts went out with the
  product share card on every deploy, shown only as a build warning. Write filesystem paths at the
  call (`path.join(process.cwd(), 'public/…')`). `scripts/audit-function-traces.mjs` fails
  `verify` on any repository file in a trace that `RUNTIME_READS` does not name, and on a named
  runtime read missing from its trace. See [ADR 047](docs/adr/047-a-function-ships-what-it-traces.md).

## PROHIBITED
- ~~Stones, gemstones, crystals, chakras~~ — this is a titanium brand
- ~~Healing, mystical, spiritual copy~~
- ~~"HealingBadge", "StoneCard"~~ — use Badge, ProductCard
- ~~Dark background as default~~ — the alabaster ground (`--bg`) is dominant
- ~~Product grids on homepage~~ — horizontal scroll strips only
