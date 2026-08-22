## Summary

<!-- Briefly describe what this PR does and why -->

## Type of Change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `chore` — dependency, config, or tooling change
- [ ] `docs` — documentation only
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `perf` — performance improvement

## Related Issue

Closes #<!-- issue number -->

## Commerce Impact

- [ ] **None** — no change to purchase journey, cart, checkout, or pricing
- [ ] **Read** — reads from Shopify (products, collections, search)
- [ ] **Write** — modifies cart, checkout, or order state
- [ ] **Money** — touches pricing display, currency formatting, or payment flows

If Write or Money: this touches `src/lib/shopify/**`, `src/store/cart.ts`,
`CartDrawer.tsx`, or `next.config.ts`'s security headers — per
`loop-constraints.md`, these are escalate-not-autonomous paths for any loop, and
worth a second look here regardless of who opened the PR.

## Checklist

- [ ] `pnpm lint` passes locally
- [ ] `pnpm type-check` passes locally
- [ ] `pnpm exec vitest run` passes locally
- [ ] New utility functions have unit tests in `src/tests/unit/`
- [ ] No hardcoded hex colour values (use `--hj-*` tokens)
- [ ] No hardcoded product data in page components (use `lib/shopify/` or `lib/data/hj-data.ts`)
- [ ] All copy matches the brand identity and PROHIBITED list in `CLAUDE.md`
- [ ] `generateMetadata()` present on any new page component
- [ ] No `.env` secrets committed

## Checklist — if Commerce Impact is Write or Money

- [ ] `pendingCheckoutCartId` discriminator preserved (`src/store/cart.ts`, ADR 002)
- [ ] `CartDrawer` still present in `src/app/layout.tsx`'s render tree
- [ ] Shopify is authoritative for price/totals — never the static fallback catalogue (ADR 004)
- [ ] New Shopify query/mutation lives in `src/lib/shopify/`, not inline in a component
- [ ] A new E2E spec covers this in `e2e/`, or an existing one already does

## Screenshots / Screen Recording

<!-- Add screenshots for any UI changes. Include both desktop (1280px) and mobile (390px) —
     both mobile-only defects this project has shipped (the hero crop, the collection tiles
     at opacity 0.12) passed every desktop check. See e2e/hero-legibility.spec.ts. -->

## State Update

- [ ] `STATE.md` updated if this resolves, changes, or adds an open item
- [ ] A new ADR added under `docs/adr/` if this records a decision restated in 3+ places
      (see `docs/adr/README.md`'s "why only those")

## Notes for Reviewer

<!-- Anything the reviewer should pay particular attention to -->
