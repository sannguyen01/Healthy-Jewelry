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

### What this site takes from it

| Songmont | Here | Enforced by |
|---|---|---|
| The warm grey-beige ground | `--bg` | `src/tests/unit/design-tokens-contrast.test.ts` |
| A dark grey for secondary text, not a mid grey | `--graphite`, in the Tundora role | same |
| Near-black for headings and the name | `--ink`, warm — never pure black | same |
| Hero, then a product row with "View all", then collections, then the story | The homepage beats ([ADR 040](docs/adr/040-seven-beats-one-strip.md)) | `src/tests/unit/homepage-composition-contract.test.ts` |
| Restraint on product imagery | Cards carry an image, a name and a material — nothing laid over the piece | `e2e/layout-invariants.spec.ts` |

### What it deliberately does not take

- **Prices, a cart, a purchase path.** This site sells nothing; see "No prices, anywhere" in
  `CLAUDE.md`. "Shop" here means browse.
- **The "SIGN UP AND SAVE" newsletter.** It is a discount hook, which the engineering doctrine
  rules out, and it would collect personal data with no system to hold it.
- **Nature-drawn product narratives.** Copy about the metals runs through the claims registry;
  a poetic sentence about a material is a claim waiting to be made.

### Not verified yet: needs the live site

- The typefaces, their case and their tracking.
- The header's composition, and the homepage's order and proportions beyond the modules above.
- Image crops, backgrounds and aspect ratios on product cards and campaign imagery.

Until those are seen, Barlow Condensed and DM Sans, the header below and square product crops
stand. This list is the next step, not a judgement that they already match.

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

- Barlow Condensed for display, DM Sans for UI and body, in the loaded weights only. Enforced by
  `src/tests/unit/typography-weights.test.ts`.
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
- **Silver on light surfaces; a `--black` tile for icons.** The silver knot is a graphic, never a
  text colour, and the ink name beside it carries the lockup's contrast. A bare silver icon is
  near-invisible on a light browser tab, so the tab and home-screen icons sit on a tile.
- **Present, once each, in the header and the footer.** Enforced by `e2e/visual-assets.spec.ts`.

## Imagery

- **Bytes arrive, the box is non-zero, the pixels are legible.** Enforced for every homepage
  image by `e2e/visual-assets.spec.ts`.
- **Product media is square** (`--ratio-product`) and never a fixed pixel height. Enforced by
  `src/tests/unit/design-consistency.test.ts` and `e2e/product-image-fit.spec.ts`.
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
