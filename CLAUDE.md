# CLAUDE.md — Healthy Jewelry Website

## Brand Identity
Healthy Jewelry is a premium titanium and non-corrosion metal jewelry brand. Implant-grade materials, biocompatible, designed for people with metal sensitivities.

**Positioning**: *Metal that works with your body.*
No stones. No gemstones. No healing crystals. No chakras. Pure material science.

Materials: Grade 23 Titanium · Niobium (anodized) · 316L Surgical Steel

## Tech Stack
- Framework: Next.js 16, App Router, TypeScript (strict mode)
- Styling: Tailwind CSS v4 + CSS custom properties (T4 tokens in `src/app/globals.css`)
- Fonts: Barlow Condensed (display) + DM Sans (UI + body)
- State: **none.** This said "Zustand (cart store)" until 2026-09-20; `src/store/` and the
  dependency both went with the bag. Nothing on this site holds client state across a
  navigation, which is a property worth keeping rather than an absence to fill.
- Package manager: pnpm
- Deployment: Vercel (auto-deploy on push to `main`)
- Testing: Vitest + Testing Library (80%+ coverage required)

## Design System — T4 (Void-White Dominant)

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | #F7F5F1 | Void-white — dominant background |
| `--nacre` | #EDEAE4 | Card tile background |
| `--ash` | #D8D3CB | Borders, dividers |
| `--graphite` | #6B6762 | Secondary text |
| `--ink` | #1A1714 | Primary text, logo |
| `--titanium` | #9DA7AF | Accent — borders, tints, fills, text on dark |
| `--titanium-text` | #59636B | Titanium-toned **text** on light backgrounds |
| `--sage` | #8CA89A | Green accent — borders, tints, fills. **Not text** |
| `--sage-text` | #516159 | Sage-toned **text** on light backgrounds |
| `--mist` | #A8A49E | Muted text — dark backgrounds only |
| `--on-dark` | #F0EDE8 | Text on dark backgrounds |
| `--black` | #0A0A0A | Campaign band dark |
| `--mid` | #2C2926 | Dark hover states |

**Contrast rule**: the two chromatic accents are both below the WCAG AA 4.5:1 floor on `--bg` —
`--titanium` at 2.25:1 and `--sage` at 2.36:1 — so each has a darkened sibling for text. Use
`--titanium-text` (5.64:1) and `--sage-text` (6.02:1) for any accent-toned copy on a light surface;
the raw accents are fine for borders, tints, and (for `--titanium`) text on `--ink`/`--black`.
Neither `-text` token is a general-purpose text colour: both fail on dark surfaces, where
`--on-dark` and `--mist` apply.

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

### Typography
- `--font-display` → Barlow Condensed (section labels, CTAs, product names, collection numbers, nav)
- `--font-ui` → DM Sans (nav links, metadata, labels, eyebrows, utility)
- `--font-body` → DM Sans (body text, prices, descriptions)

**Loaded weights — never request one that isn't here:**

| Token | Font | Weights available |
|-------|------|-------------------|
| `--font-display` | Barlow Condensed | **400, 500** |
| `--font-ui` / `--font-body` | DM Sans | **300, 400, 500** |

A weight with no downloaded face is not ignored — the browser *synthesises* it,
smearing the strokes of the nearest face and distorting the letterforms, so the text reads as a
different typeface. Nine pages once asked Barlow Condensed for 700 and rendered a fake bold beside the
homepage's real 500. Enforced by `src/tests/unit/typography-weights.test.ts`, which resolves each
`--font-*` token back to its loader and fails on any weight that font does not ship. To use a heavier
face, add it to the `next/font` call in `src/app/layout.tsx` first.

**Page titles use `PageHeader`** (`src/components/ui/PageHeader.tsx`) — never a hand-rolled `<h1>`.
Two variants, chosen by what the page is for: `display` for brand/marketing routes (Our Story, Contact,
Materials, Stores) and `compact` for utility/legal routes (FAQ, Shipping, Terms, Privacy, Legal). The
homepage hero is the one exception, since it owns `--text-hero`.

### Architecture (Gentle Monster style)
- Horizontal scroll strips on homepage (no product grids)
- Void-white (#F7F5F1) everywhere
- Single dark interruption: campaign band (#0A0A0A)
- Nav: transparent → frosted glass (scrollY > 60)
- Cards: image + name + price only (minimal)

### Header composition — two layouts, breakpoint at 768px
- **≥769px**: brand lockup · centred primary links · Search · Bag.
- **≤768px**: brand lockup · Bag · Menu. **Search moves into the full-screen
  overlay** (`.hj-desktop-only`), which also carries the three primary links. It is not
  duplicated — the header copy is `display: none` down here.
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
- **The brand gives, the controls never do.** The brand link is `flex: 0 1 auto; min-width: 0`
  and the wordmark ellipsises; the control cluster is `flexShrink: 0`. A truncated wordmark is
  a cosmetic loss, an unreachable control is a functional one. This is why the 768px breakpoint
  is a *composition* choice rather than a correctness dependency: get it wrong and the layout
  degrades instead of amputating.
- Enforced by `e2e/header-fit.spec.ts`, which sweeps 320–1440px and binary-searches the
  narrowest fitting width per layout mode. Probes are geometric — element boxes against
  `window.innerWidth` — because `scrollWidth` is blind here twice over (the header is `fixed`,
  and `globals.css` sets `overflow-x: hidden`), and because `toBeVisible()` and `.click()` both
  pass on a control whose centre is off-screen.

## Homepage Section Sequence
1. Hero — **two compositions, breakpoint at 900px**:
   - **≥901px**: full-bleed. The "Euro Summer" lifestyle photo fills the entire section
     (`object-position: right center`), and the copy sits in its own opaque `--bg` card
     (`.hj-hero-scrim`) sized to wrap the text plus padding — not a section-spanning rectangle.
     Because the card wraps its own content instead of being measured/positioned independently,
     there is no separate width to keep in sync with the text column, which is what caused the
     scrim-drift regressions in commits a4cfb9c/b1e5178/c55962a. The card is opaque rather than
     translucent on purpose: every text/backdrop pairing here is only proven against a flat `--bg`,
     and a blurred semi-transparent card would reopen the "pale text over a pale patch of photo"
     failure mode `e2e/hero-legibility.spec.ts` exists to catch. No decorative overlay on the photo
     itself — the ring-arc SVG background ornament was removed (2026-08-03): it sat directly on top
     of the photograph at `right: -120px` and read as a distorted double-overlay.
   - **≤900px**: stacked. Copy on `--bg` (card becomes transparent — nothing overlaps the photo down
     here to protect against), photo as a full-width 16:9 band beneath it, `object-position: center`.
     The full-bleed treatment cannot survive here: at 390px the `right center` crop discards 75% of
     the frame including the subject, which is why the layout changes to a stacked band instead of
     shrinking the same composition.
   - Enforced across seven widths by `e2e/hero-legibility.spec.ts`. Never place hero copy over the
     photograph without the card behind it.
   - The card is also **bounded**: `--hj-hero-card-max-ratio` (0.60) caps it at a fraction of the
     photograph's own rendered box, because every other guardrail here is satisfied better the
     larger the card gets and so none of them push back. Enforced as `max-width` and asserted as
     both a width and an occluded-area ratio. See
     [ADR 013](docs/adr/013-a-protection-that-can-only-grow.md) before widening it.
2. HorizontalScroll — "BESTSELLING"
3. CampaignBand — "SCIENCE BEFORE AESTHETICS." (dark)
4. HorizontalScroll — "NEW ARRIVALS"
5. CollectionGrid — 5 collection paths (Charms and Earrings tiles use real photography; Rings/Necklaces/Bracelets still use the SVG placeholder pending photos)
6. HorizontalScroll — "TITANIUM"
7. MaterialsSection — Grade 23 Ti / Niobium / 316L Steel
8. Footer

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
- Components: `svg/` (JewelrySVG), `ui/` (atoms), `layout/` (Nav/Footer), `home/` (page sections), `product/` (product components), `seo/` (JsonLd/Breadcrumbs — `Breadcrumbs` is shared across `/shop`, `/shop/[collection]`, `/products/[handle]`; each page also emits a matching `BreadcrumbList` via `breadcrumbJsonLd()`)
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
- **What is deliberately still standing**: `src/lib/shopify/cacheTags.ts` and
  `api-version.ts`, because `/api/webhooks/shopify`, `/api/revalidate` and `/api/version`
  still import them. The webhook subscriptions must be deleted in the platform console
  *before* the endpoint is removed, or it retries against a failing route for its full
  backoff schedule. That is the masterplan's **WS-F** ordering (the browse-only plan called
  it WS-7), and the connector is currently `needs_reconnect`.
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
- `hjSlideUp` — fade + translate up (Hero stagger, section entrances)
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
- Commit format: `feat|fix|style|content|test|chore: description`

## Testing & CI
Full detail in **`docs/testing-strategy.md`**. In short:

- **`verify`** (lint · type-check · unit · build, ~2 min) is the merge gate.
- **`e2e`** (Playwright, both projects, ~3–5 min) runs on every PR and blocks.
- `vitest` coverage is scoped to `src/lib`, `src/store`, `src/config` on purpose — **E2E is the only
  automated coverage the UI layer has.** Anything a user has to see or click belongs in `e2e/`.
- Presence is not visibility. `e2e/visual-assets.spec.ts` asserts imagery actually renders — bytes
  arrive, the box is non-zero, and the effective opacity clears the legibility floor.
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

## PROHIBITED
- ~~Stones, gemstones, crystals, chakras~~ — this is a titanium brand
- ~~Healing, mystical, spiritual copy~~
- ~~"HealingBadge", "StoneCard"~~ — use Badge, ProductCard
- ~~Dark background as default~~ — void-white is dominant
- ~~Product grids on homepage~~ — horizontal scroll strips only
