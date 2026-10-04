# DESIGN.md — Healthy Jewellery

Every rule here is either enforced by the file named beside it or marked **unenforced**. A rule
with no enforcement is a preference, and it says so. Values live in `src/app/globals.css` and
the token table in `CLAUDE.md`; this document names them and never restates a hex or a ratio,
so it cannot drift from them. It replaces a draft (0fd2f40) that prescribed frosted glass on the
header and rounded, shadowed cards — both of which the tests below forbid — and generator
settings ("density", "variance") that described no decision anyone could check.

## Reference: Songmont

The design reference is Songmont (songmontofficial.com), the owner's choice on 2026-10-04; it
was Gentle Monster before. A reference is a design *language* to align with, not an identity to
copy: none of Songmont's marks, names, photographs or copy appear here.

**A reference, not a template** (the owner's ruling, 2026-10-04, [ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)).
Much of Songmont would not suit Healthy Jewellery, so only what suits it is taken, and anything
taken stays answerable to that test. Two consequences are already settled:
- Songmont's typeface is not studied further.
- The brand name keeps the typography it had before the reference.

### What is verified, and where it comes from

The live site was not reachable from the environment this was built in — its network policy
denies songmontofficial.com and every mirror tried — so each row names its secondary source.

| Dimension | Songmont | Source |
|---|---|---|
| Palette | Three colours: black, a warm grey-beige ground (Pampas) and a dark grey (Tundora); described as a "zen-inspired beige-gray" | Brandfetch's extraction of songmontofficial.com; the Songmont brand book on Behance |
| Form and mood | Minimalist, rounded edges, tonal palettes, tactile materials; "quiet luxury" | Style Encyclopedia; press coverage |
| Space | Natural forms softened into "softness, warmth, and brightness"; frames that capture views | ARCHSTUDIO's Songmont store projects |
| Homepage modules | A hero with "Shop Now"; a "Bestsellers" row with "View all"; "Explore" | The homepage, as indexed by search |
| Merchandising | New Arrivals, Bestsellers, named collections, categories; founder-story and design-philosophy pages | The site's own collection and blog URLs |
| Voice | Short product narratives drawn from nature | The site's product pages |
| Typeface | One family for the whole identity: the FW Tsukiji Gothic family (方正FW筑紫黑家族), applied by Studio DPi for the brand's tenth anniversary | Founder Type's case page "Studio DPi & Songmont丨山下有松 Songmont 十周年", as indexed by search |
| Case | Pieces named in Title Case: "Medium Gather Bag", "Small Gather Bag", "Medium Shan Messenger Bag"; "View all" with no arrow | The site's product pages and homepage, as indexed by search |

### What this site takes from it

| Songmont | Here | Enforced by |
|---|---|---|
| The warm grey-beige ground | `--bg` | `src/tests/unit/design-tokens-contrast.test.ts` |
| A dark grey for secondary text, not a mid grey | `--graphite`, in the Tundora role | same |
| Near-black for headings and the name | `--ink`, warm — never pure black | same |
| Hero, then a product row with "View all", then collections, then the story | The homepage beats ([ADR 040](docs/adr/040-seven-beats-one-strip.md)) | `src/tests/unit/homepage-composition-contract.test.ts` |
| Restraint on product imagery | Cards carry an image, a name and a material — nothing laid over the piece | `e2e/layout-invariants.spec.ts` |
| One typeface family for the site's text | Zen Kaku Gothic Antique — the closest openly licensed relative of Tsukiji Gothic — for display, UI and body, self-hosted ([ADR 043](docs/adr/043-one-family-and-the-case-it-is-written-in.md)). Not for the brand name (below) | `src/tests/unit/typography-weights.test.ts`, `src/tests/unit/font-files.test.ts`, `e2e/glyph-coverage.spec.ts` |
| Names in the case they are written in | Headings, product and collection names are never forced to capitals; only small labels are | `src/tests/unit/typography-weights.test.ts` |

### What it deliberately does not take

- **Prices, a cart, a purchase path.** This site sells nothing; see "No prices, anywhere" in
  `CLAUDE.md`. "Shop" here means browse.
- **The "SIGN UP AND SAVE" newsletter.** It is a discount hook, which the engineering doctrine
  rules out, and it would collect personal data with no system to hold it.
- **Nature-drawn product narratives.** Copy about the metals runs through the claims registry;
  a poetic sentence about a material is a claim waiting to be made.
- **Tsukiji Gothic itself.** It is a commercial Fontworks/Founder face with no web licence here;
  the Latin glyphs of its antique variant are also its weakest part. The adopted family shares
  its antique-gothic lineage and is SIL OFL. No further study of Songmont's typeface or lettering
  is planned: the owner ruled it unnecessary (2026-10-04).
- **One family for the brand name.** The logotype keeps Barlow Condensed in tracked capitals, the
  typography Healthy Jewellery had before the reference ([ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)).
  The name is the brand's own; a reference for the site does not restyle it.

### Decided from the language, not measured from the page

The live storefront could not be read from the build environment, and on 2026-10-04 the owner
ruled that it need not be: the three dimensions below are decided from the verified language
above, each for a reason this repository can check. None is presented as a measurement of
Songmont's site. ([ADR 044](docs/adr/044-decided-from-the-language-not-the-page.md))

| Dimension | Decision | Why | Enforced by |
|---|---|---|---|
| Latin web font | The identity's one family, Zen Kaku Gothic Antique, for every role of the site's text; the brand name keeps its own face ([ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)) | One family is the verified principle for the site; the name is the brand's, not the reference's | `src/tests/unit/typography-weights.test.ts`, `src/tests/unit/font-files.test.ts`, `e2e/glyph-coverage.spec.ts` |
| Listing crop | 3:4 portrait (`--ratio-product`) for product cards and the homepage strip, the crop the collection and material tiles already used | One crop through the homepage instead of a square strip between two portrait rows; 8 of the 17 illustrations are taller than wide, and at 3:4 they draw up to 1.33x larger while no piece draws smaller; portrait is the frame of the verified photographic direction, pieces worn | `src/tests/unit/design-consistency.test.ts`, `e2e/layout-invariants.spec.ts` |
| Header | Kept: centred knot-and-name lockup, two quiet text controls each side, flat fill with a hairline once scrolled, 44px targets | The verified register is restraint — tonal, typographic, nothing laid over content — and the composition already says only that | `src/tests/unit/design-consistency.test.ts`, `e2e/header-fit.spec.ts` |

The product detail tile stays square and bounded ([ADR 017](docs/adr/017-a-box-that-could-not-be-both.md)):
at 3:4 its cap would make it taller than a laptop window leaves below the header (the figures
are in ADR 044).

**Photography is content, not a token.** The verified direction — pieces worn with cream, beige and
tan linen against soft, blurred grounds — describes images this site does not have yet. The hero
photograph stands until the owner replaces it; no filter is laid over it to imitate a palette.

## Surface and colour

- **The Pampas ground is the page.** `--bg` everywhere; `--nacre` for tiles; one dark interruption per
  homepage, the Care band (`--black`, `--on-dark`, `--mist`). Enforced by
  `e2e/homepage-composition.spec.ts` (one dark section, first half of the page) and
  [ADR 040](docs/adr/040-seven-beats-one-strip.md).
- **Every text colour is a classified pairing.** `--titanium` and `--sage` are accents, never
  text on light surfaces; their `-text` siblings carry text. Enforced by
  `src/tests/unit/design-tokens-contrast.test.ts`, which also reads the table in `CLAUDE.md`.
- **No pure black.** `--black` is the darkest value. **Unenforced.**

## Type

- **One family for the site, one face for the name.** Zen Kaku Gothic Antique at 400 and 500 sets
  every role of the site's text; `--font-display`, `--font-ui` and `--font-body` remain separate
  tokens because they name roles. The brand name alone is set in `--font-brand`: Barlow Condensed,
  500 in the header and 400 in the footer, in tracked capitals, as it was before the Songmont
  reference ([ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)). Only weights the loaders ship
  are asked for, and only the logotype's rule may use `--font-brand`. Enforced by
  `src/tests/unit/typography-weights.test.ts`; that no other element renders in it, by
  `e2e/glyph-coverage.spec.ts`.
- **Weights are chosen by typographic colour, not by number.** Body copy and small labels were
  DM Sans 300; this family's 300 carries about half that ink, its 400 nearly all of it, so the
  300 role is 400 and no Light face ships. See `src/app/fonts/README.md`. **Unenforced** beyond
  the loader: a 300 cannot be asked for because none is loaded.
- **The files are what the loader says they are.** Each file's own `OS/2` weight class matches the
  weight `layout.tsx` declares, under the licence shipped beside it, with the SHA-256 its README
  records. Enforced by `src/tests/unit/font-files.test.ts`.
- **Only characters the face draws.** The site ships the latin slice (219 characters); anything
  outside it renders in the fallback face mid-line. Enforced over the content by
  `src/tests/unit/font-files.test.ts` and over every route's rendered text by
  `e2e/glyph-coverage.spec.ts`, which also checks that the face loaded and every role uses it.
- **Headings and names are set in the case they are written in, at a declared weight.** Capitals
  belong to small `--font-ui` labels — eyebrows, buttons, badges — and to the logotype. A `--font-display`
  style never inherits its weight. Both enforced by `src/tests/unit/typography-weights.test.ts`.
- Page titles go through `PageHeader`. See `CLAUDE.md`, Typography.

## The header and the footer

- **Flat.** The header has a solid fill and a hairline in its scrolled state — no blur, no
  shadow; the menu drawer likewise. Enforced by `src/tests/unit/design-consistency.test.ts`.
- **The brand lockup is the knot mark and the name, as one link home** (`BrandLockup.tsx`):
  inline in the header, stacked in the footer. The name is always `SITE_NAME`; enforced by
  `src/tests/unit/brand-name.test.ts`.
- **The brand gives, the controls never do** ([ADR 016](docs/adr/016-fit-is-a-measurement-nobody-took.md)).
  In the header the name is shown whole or not at all; below 360px the mark stands alone.
  Enforced, with the measured headroom printed on every run, by `e2e/header-fit.spec.ts`.
- **Every header and footer control is at least 44px in each direction** on touch widths.
  Enforced by `e2e/layout-invariants.spec.ts` and `src/tests/unit/design-consistency.test.ts`.

## The logo

- **One master, derived copies.** Only `assets/brand/knot-master.png` is edited by hand.
  `scripts/build-brand-mark.mjs` produces every served copy; `src/tests/unit/brand-mark-asset.test.ts`
  fails on any copy that differs from what the master derives.
- **Transparent at the edges, not only the corners.** The derivation removes the black matte the
  master was keyed out of. Same test, with thresholds measured on both sides of the defect.
  See [ADR 041](docs/adr/041-a-transparent-logo-is-a-measurement.md).
- **The background is transparent, exactly** (the owner's instruction, [ADR 048](docs/adr/048-the-name-keeps-its-own-face.md)).
  Every copy a visitor sees has no backing: the header and footer mark, served as lossless PNG
  because the image optimiser's lossy re-encode left alpha where the mark is clear, and the
  browser-tab icon. Enforced on the files by `src/tests/unit/brand-mark-asset.test.ts`, and on
  the bytes the browser decodes by `e2e/visual-assets.spec.ts`.
- **A tile only where the platform cannot show transparency.** iOS paints a home-screen icon's
  clear pixels black, and Google lays the Organization logo on white, so those two copies sit on
  `--black`. The silver knot is a graphic, never a text colour, and the ink name beside it
  carries the lockup's contrast. **Unenforced** as a choice; the tiles' pixels are enforced.
- **Present, once each, in the header and the footer.** Enforced by `e2e/visual-assets.spec.ts`.

## Imagery

- **Bytes arrive, the box is non-zero, the pixels are legible.** Enforced for every homepage
  image by `e2e/visual-assets.spec.ts`.
- **One listing crop, 3:4** (`--ratio-product`), never a fixed pixel height: product cards, the
  homepage strip and the collection and material tiles agree. Enforced by
  `src/tests/unit/design-consistency.test.ts` and `e2e/layout-invariants.spec.ts`.
- **The product detail tile is square and bounded.** Enforced by `e2e/product-image-fit.spec.ts`
  ([ADR 017](docs/adr/017-a-box-that-could-not-be-both.md)).
- **No floor without a ceiling** on any box. Enforced by `src/tests/unit/bounded-geometry.test.ts`.

## Rhythm

- Section padding comes from the rhythm tokens (`--space-section`, `-sm`, `-lg`) and the
  horizontal gutter from `--space-gutter` alone. Enforced by
  `src/tests/unit/design-consistency.test.ts`.
- Cards do not lift on hover. Same test.

## Motion

- The four keyframes in `globals.css` (`hjSlideUp`, `hjFadeDown`, `hjSlideIn`, `hjFadeIn`), timed
  by `--duration-*` and eased by `--ease` / `--ease-sharp`.
- **Reduced motion collapses every transition**; `globals.css` carries the
  `prefers-reduced-motion` block, and `e2e/header-fit.spec.ts` runs under it.
- **Content is visible without JavaScript.** A reveal that never fires must not hide a section.
  Enforced by `e2e/layout-invariants.spec.ts` ("JavaScript disabled").

## Focus

- A 2px `--ink` outline, offset, on every `:focus-visible`; `--on-dark` inside the drawer.
  Enforced by `e2e/layout-invariants.spec.ts` ("visible focus indicators").

## Copy

- No stones, gemstones, crystals, chakras, healing or spiritual language; no prices. Enforced by
  the claims registry and `src/tests/unit/claim-lexicon.test.tsx`,
  `src/tests/unit/price-absence-contract.test.tsx`. See `CLAUDE.md`, PROHIBITED.
- No emoji, no urgency or scarcity copy. **Unenforced.**
