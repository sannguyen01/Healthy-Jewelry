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

The suite spans **77 unit spec files** and **17 E2E spec files**.

Those two counts are the machine-checked half of this section:
`src/tests/unit/doc-numeric-claims.test.ts` reconciles them against the filesystem, so a
spec file disappearing fails the gate instead of quietly lowering the bar. Do not edit
them by hand to make a check pass — re-measure, and if the number really moved, ask why.

Test *totals* are a dated observation, not a constant. Nothing here can re-measure them
without running the suites, so they are recorded rather than reconciled:

> Measured on `main` at 2026-08-30, after PR #57: 1913 unit tests (plus 5 skipped), and
> 488 E2E tests.

Re-measure before trusting them:

```
pnpm exec vitest run          # unit count
pnpm exec playwright test --list   # E2E count
```

Report a *shrinking* count as a finding; a growing one is not itself news.
**That rule only works if the number is current.** This section read "443 unit tests and
11 E2E spec files" from 2026-08-01 until 2026-08-30, by which point the real figures were
1913 and 17 — so a collapse from 1913 to 600 would still have registered as growth. A
stale baseline does not weaken the check, it inverts it.

Worth stating what is still open: a suite that collapses **without losing a spec file** is
invisible to the file-count check. That is a smaller hole than a baseline stale by a
factor of four, not no hole.

CI is two jobs — `verify` (lint, type-check, unit, build; the merge gate) and
`e2e` (Playwright against a production build, both projects). See
`docs/testing-strategy.md` for what each layer covers, the measured timings, and
the recorded a11y exception.

**Whether those are *required* checks is not this file's to assert.**
`docs/controls.json` is authoritative, and its `merge-gate` entry has read
`not-configured` throughout — branch protection is off. This file claimed the
opposite until 2026-08-30, which is exactly what
`docs/adr/018-a-claim-about-a-control-is-not-a-control.md` forbids: a document
asserting a control that no probe reads. It mattered. Eleven commits reached
`main` unverified during the 2026-08-29 blackout precisely because nothing
required these checks, while this file told every reader they were required.

The two context strings protection *should* require, when someone enables it,
are the names GitHub actually publishes — never the job IDs `verify` and `e2e`,
which appear nowhere in the checks API and would block every PR forever
(ADR 015):

```required-checks
Lint · Type-check · Unit tests · Build
Dependency scope
E2E tests (Playwright)
```

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
