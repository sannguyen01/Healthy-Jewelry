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

353 unit tests + 9 E2E spec files were passing as of the last session
(homepage, navigation, legal-pages, shop, product-detail, cart, contact,
checkout, a11y via @axe-core/playwright). Report a *shrinking* test count as
a finding; a growing one is not itself news.

## Outstanding known work (carry-forward — see STATE.md for current status)

Manual Vercel dashboard steps not yet done (human action — never propose
running these yourself):
- Env vars: `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN`,
  `NEXT_PUBLIC_SITE_URL`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_REVALIDATION_SECRET`,
  `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Shopify webhook registration: Admin -> Settings -> Notifications -> Webhooks
  -> point to `/api/webhooks/shopify`.
- Visual QA against the live Vercel deploy URL, including axe a11y and the
  checkout redirect to a real Shopify URL.
