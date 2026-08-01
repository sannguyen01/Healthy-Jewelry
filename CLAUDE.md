# CLAUDE.md — Healthy Jewelry Website

## Brand Identity
Healthy Jewelry is a premium titanium and non-corrosion metal jewelry brand. Implant-grade materials, biocompatible, designed for people with metal sensitivities.

**Positioning**: *Metal that works with your body.*
No stones. No gemstones. No healing crystals. No chakras. Pure material science.

Materials: Grade 23 Titanium · Niobium (anodized) · 316L Surgical Steel

## Tech Stack
- Framework: Next.js 15, App Router, TypeScript (strict mode)
- Styling: Tailwind CSS v4 + CSS custom properties (T4 tokens in `src/app/globals.css`)
- Fonts: Barlow Condensed (display) + DM Sans (UI + body)
- State: Zustand (cart store)
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
| `--titanium-text` | #5E6870 | Titanium-toned **text** on light backgrounds |
| `--sage` | #8CA89A | Green accent |
| `--mist` | #A8A49E | Muted text — dark backgrounds only |
| `--on-dark` | #F0EDE8 | Text on dark backgrounds |
| `--black` | #0A0A0A | Campaign band dark |
| `--mid` | #2C2926 | Dark hover states |

**Contrast rule**: `--titanium` is 2.25:1 on `--bg` — below the WCAG AA 4.5:1 floor. Use
`--titanium-text` (5.23:1) for any titanium-toned copy on a light surface; `--titanium` itself is fine
for borders, tints, and text on `--ink`/`--black`. Every documented pairing is enforced by
`src/tests/unit/design-tokens-contrast.test.ts` — add new pairings there.

**Ease tokens**:
- `--ease: cubic-bezier(0.16, 1, 0.3, 1)` (smooth spring)
- `--ease-sharp: cubic-bezier(0.00, 0.00, 0.30, 1.00)` (sharp snap)

### Typography
- `--font-display` → Barlow Condensed (section labels, CTAs, product names, collection numbers, nav)
- `--font-ui` → DM Sans (nav links, metadata, labels, eyebrows, utility)
- `--font-body` → DM Sans (body text, prices, descriptions)

### Architecture (Gentle Monster style)
- Horizontal scroll strips on homepage (no product grids)
- Void-white (#F7F5F1) everywhere
- Single dark interruption: campaign band (#0A0A0A)
- Nav: transparent → frosted glass (scrollY > 60)
- Cards: image + name + price only (minimal)

## Homepage Section Sequence
1. Hero (full viewport, "Euro Summer" lifestyle photo background with a fade into `--bg`, plus the original ring-arc SVG at low opacity)
2. HorizontalScroll — "BESTSELLING"
3. CampaignBand — "SCIENCE BEFORE AESTHETICS." (dark)
4. HorizontalScroll — "NEW ARRIVALS"
5. CollectionGrid — 5 collection paths (Charms and Earrings tiles use real photography; Rings/Necklaces/Bracelets still use the SVG placeholder pending photos)
6. HorizontalScroll — "TITANIUM"
7. MaterialsSection — Grade 23 Ti / Niobium / 316L Steel
8. Footer

## Architecture Principles
- Server Components by default; `'use client'` only for interactive elements
- Components: `svg/` (JewelrySVG), `ui/` (atoms), `layout/` (Nav/Footer/CartDrawer), `home/` (page sections), `product/` (product components), `seo/` (JsonLd/Breadcrumbs)
- Data: `src/lib/data/hj-data.ts` — typed product catalog (static, Shopify-ready)
- Shopify: `src/lib/shopify/` — client, queries, mutations, types
- Store: `src/store/cart.ts` — Zustand cart with persist
- Hooks: `src/lib/hooks/useReveal.ts` — IntersectionObserver scroll-reveal hook, returns `[ref, visible]` tuple, triggers once then disconnects

### Animations
Keyframes defined in `globals.css`:
- `hjSlideUp` — fade + translate up (Hero stagger, section entrances)
- `hjFadeDown` — subtle fade + translate down
- `hjSlideIn` — fade + translate right
- `hjFadeIn` — simple opacity fade

CSS classes: `.animate-hj-up`, `.animate-hj-slide`, `.animate-hj-fade`

## Content Data (NO STONES/GEMS)
- `src/lib/data/hj-data.ts` — 17 products, 5 collections, 3 materials
- Collections: rings, necklaces, earrings, bracelets, charms
- Materials: Grade 23 Titanium, Niobium, 316L Surgical Steel

## Site Map
- `/` → Homepage
- `/shop` → All products with filter
- `/shop/[collection]` → Per-collection (rings/necklaces/earrings/bracelets/charms)
- `/products/[handle]` → Product detail page
- `/cart` → Cart page
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
- E2E runs against a **production build** (`pnpm build && pnpm start`), never `pnpm dev` — that is what
  Vercel serves.

## PROHIBITED
- ~~Stones, gemstones, crystals, chakras~~ — this is a titanium brand
- ~~Healing, mystical, spiritual copy~~
- ~~"HealingBadge", "StoneCard"~~ — use Badge, ProductCard
- ~~Dark background as default~~ — void-white is dominant
- ~~Product grids on homepage~~ — horizontal scroll strips only
