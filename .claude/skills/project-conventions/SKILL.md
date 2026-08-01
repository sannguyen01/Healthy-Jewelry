---
name: project-conventions
description: >
  This repo's real verify commands, brand prohibitions, and known pending
  work. Read this before running any lint/test/build command or judging
  whether copy/content respects the brand identity.
user_invocable: true
---

# Healthy-Jewelry — Project Conventions

## Verify commands (exact — this repo uses pnpm, not npm)

```
pnpm lint             # next lint
pnpm type-check       # tsc --noEmit
pnpm test             # vitest
pnpm test:coverage    # vitest run --coverage (80%+ required, per CLAUDE.md)
pnpm e2e              # playwright test
pnpm build            # next build
```

Always invoke via `pnpm`, never `npm run` — this repo has no package-lock.json,
only `pnpm-lock.yaml`. Using npm commands will not reflect real project state.

## Brand prohibitions — treat any violation as a real, reportable finding

This is a **titanium and non-corrosion metal jewelry** brand — implant-grade
materials, biocompatible, no stones. Per `CLAUDE.md`'s "PROHIBITED" section,
flag it if you see:

- Any mention of stones, gemstones, crystals, chakras, healing, or mystical/
  spiritual copy anywhere in content or component names.
- Component names like `HealingBadge` or `StoneCard` (should be `Badge`,
  `ProductCard`).
- A dark background used as the *default* — void-white (`--bg: #F7F5F1`) is
  the dominant background; the single sanctioned dark surface is the
  Campaign Band (`--black: #0A0A0A`).
- Product grids added to the homepage — homepage uses horizontal scroll
  strips only, per the Gentle Monster-style architecture in `CLAUDE.md`.

## Testing baseline

As of 2026-08-01 on `main`: **443 unit tests** and **11 E2E spec files**
(homepage, navigation, legal-pages, shop, product-detail, cart, contact,
checkout, a11y via @axe-core/playwright, visual-assets, hero-legibility).
Report a *shrinking* count as a finding; a growing one is not itself news.

CI is two jobs — `verify` (lint, type-check, unit, build; the merge gate) and
`e2e` (Playwright against a production build, both projects). Both are required
checks on `main`. See `docs/testing-strategy.md` for what each layer covers,
the measured timings, and the recorded a11y exception.

## Outstanding known work (carry-forward — see STATE.md for current status)

Manual Vercel dashboard steps not yet done (human action — never propose
running these yourself):
- Env vars: `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN`,
  `NEXT_PUBLIC_SITE_URL`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_REVALIDATION_SECRET`,
  `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Shopify webhook registration: Admin -> Settings -> Notifications -> Webhooks
  -> point to `/api/webhooks/shopify`.
- Visual QA against the live Vercel deploy URL and the checkout redirect to a
  real Shopify URL. Note that axe a11y and visual-asset rendering are now
  covered automatically (`e2e/a11y.spec.ts`, `e2e/visual-assets.spec.ts`,
  `e2e/hero-legibility.spec.ts`); what still needs a human is the live
  deployment itself, which sandboxed sessions cannot reach.
