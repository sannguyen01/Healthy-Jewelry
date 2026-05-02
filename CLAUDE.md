# CLAUDE.md — Healthy Jewelry Website

## Brand Identity
Healthy Jewelry is a premium titanium and non-corrosion metal jewelry brand. Implant-grade materials, biocompatible, designed for people with metal sensitivities.

**Positioning**: *Metal that works with your body.*
No stones. No gemstones. No healing crystals. No chakras. Pure material science.

Materials: Grade 23 Titanium · Niobium (anodized) · 316L Surgical Steel

## Tech Stack
- Framework: Next.js 15, App Router, TypeScript (strict mode)
- Styling: Tailwind CSS v4 + CSS custom properties (T3 tokens in `src/app/globals.css`)
- Fonts: Bebas Neue (display) + Cormorant Garamond (serif) + Barlow Condensed (UI) + Barlow (body)
- State: Zustand (cart store)
- Package manager: pnpm
- Deployment: Vercel (auto-deploy on push to `main`)
- Testing: Vitest + Testing Library (80%+ coverage required)

## Design System — T3 (Void-White Dominant)

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | #F7F5F1 | Void-white — dominant background |
| `--nacre` | #EDE9E2 | Card tile background |
| `--ash` | #D5D0C8 | Borders, dividers |
| `--graphite` | #6B6762 | Secondary text |
| `--ink` | #1A1714 | Primary text, logo |
| `--titanium` | #9DA7AF | Accent color |
| `--sage` | #8CA89A | Green accent |
| `--black` | #0A0A0A | Campaign band dark |
| `--mid` | #2C2926 | Dark hover states |

**Ease token**: `--ease: cubic-bezier(0.00, 0.00, 0.30, 1.00)`

### Typography
- `--font-display` → Bebas Neue (section labels, CTAs, product names, nav logo)
- `--font-serif` → Cormorant Garamond (hero headline, editorial text)
- `--font-ui` → Barlow Condensed (nav links, metadata, labels, eyebrows)
- `--font-body` → Barlow (body text, prices, descriptions)

### Architecture (Gentle Monster style)
- Horizontal scroll strips on homepage (no product grids)
- Void-white (#F7F5F1) everywhere
- Single dark interruption: campaign band (#0A0A0A)
- Nav: transparent → frosted glass (scrollY > 60)
- Cards: image + name + price only (minimal)

## Homepage Section Sequence
1. Hero (full viewport, background ring SVG at 10% opacity)
2. HorizontalScroll — "BESTSELLING"
3. CampaignBand — "SCIENCE BEFORE AESTHETICS." (dark)
4. HorizontalScroll — "NEW ARRIVALS"
5. CollectionGrid — 4 collection paths
6. HorizontalScroll — "TITANIUM"
7. MaterialsSection — Grade 23 Ti / Niobium / 316L Steel
8. Footer

## Architecture Principles
- Server Components by default; `'use client'` only for interactive elements
- Components: `svg/` (JewelrySVG), `ui/` (atoms), `layout/` (Nav/Footer/CartDrawer), `home/` (page sections), `product/` (product components), `seo/` (JsonLd/Breadcrumbs)
- Data: `src/lib/data/hj-data.ts` — typed product catalog (static, Shopify-ready)
- Shopify: `src/lib/shopify/` — client, queries, mutations, types
- Store: `src/store/cart.ts` — Zustand cart with persist

## Content Data (NO STONES/GEMS)
- `src/lib/data/hj-data.ts` — 15 products, 4 collections, 3 materials
- Collections: rings, necklaces, earrings, bracelets
- Materials: Grade 23 Titanium, Niobium, 316L Surgical Steel

## Site Map
- `/` → Homepage
- `/shop` → All products with filter
- `/shop/[collection]` → Per-collection (rings/necklaces/earrings/bracelets)
- `/products/[handle]` → Product detail page
- `/cart` → Cart page
- `/about` → Brand story
- `/materials` → Materials science page
- `/search` → Search results

## Coding Standards
- Strict TypeScript, no `any`
- Named + default exports on all components
- Run `pnpm lint && pnpm build` before every commit
- Run `pnpm test` — maintain 80%+ coverage
- Commit format: `feat|fix|style|content|test|chore: description`

## PROHIBITED
- ~~Stones, gemstones, crystals, chakras~~ — this is a titanium brand
- ~~Healing, mystical, spiritual copy~~
- ~~"HealingBadge", "StoneCard"~~ — use Badge, ProductCard
- ~~Dark background as default~~ — void-white is dominant
- ~~Product grids on homepage~~ — horizontal scroll strips only
