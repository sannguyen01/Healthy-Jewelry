# Loop State — Healthy-Jewelry

Last run: never (scaffold not yet scheduled)
Last refreshed by hand: 2026-08-01

## High Priority (loop is acting or waiting on human)

- [ ] VERCEL-ENV — 8 Vercel env vars not yet set (Shopify tokens, site URL,
  webhook/revalidation secrets, Resend key, Upstash Redis URL+token)
  Loop action: report only, never propose setting these yourself
  Human decision: pending
- [ ] SHOPIFY-WEBHOOK — Shopify webhook not yet registered to `/api/webhooks/shopify`
  Loop action: report only
  Human decision: pending
- [ ] VISUAL-QA-LIVE — visual QA and the checkout redirect to a real Shopify URL
  still need checking against the deployed Vercel URL from a normal browser.
  Automated coverage now exists for the rest (see Testing baseline), but the
  sandboxed sessions that produced it cannot reach the Vercel hosts.
  Loop action: report only
  Human decision: pending
- [ ] SHOPIFY-CURRENCY — confirm the connected store's currency matches what the
  site renders. Prices now carry `HJProduct.currencyCode` end to end instead of
  a hardcoded USD, so the site will quote whatever Shopify returns — which is
  only correct if the store is configured as intended.
  Loop action: report only
  Human decision: pending
- [ ] SHOPIFY-SVG-TAGS — real catalog products need `svg:` tags, else
  `src/lib/shopify/index.ts` falls back to handle-substring matching and then
  to `'ring-arc'`, rendering the wrong illustration silently.
  Loop action: report only
  Human decision: pending

## Watch List

- (empty)

## Resolved

- [x] MAIN-CI-FAILING — resolved 2026-08-01. `main`'s CI had failed on every
  push since 2026-06-29. PR #9 found the cause was not one bug but a suite that
  had never passed: 24.2 min, 24 failures, of which 10 were specs describing
  behaviour the app no longer had and 2 were real defects live on the site.
  PR #10 then cached the fixed overhead. `main` is green as of `07a6986` and
  `74b0a3a`.
- [x] CLAUDE-MD-COLLECTIONS — resolved. PR #7 updated `CLAUDE.md` to 5
  collections / 17 products after PR #4 merged.
- [x] SECURITY-2026-06-30 — both findings in
  `.gstack/security-reports/2026-06-30-security.json` are fixed on `main`: the
  contact route now uses `@upstash/ratelimit` with a Redis backend, and the
  fallback log line is `'[contact] Inquiry received'` with no PII.

## Testing baseline

As of 2026-08-02: **497 unit tests** across 28 files, **294 E2E tests** in 11
spec files (homepage, navigation, legal-pages, shop, product-detail, cart,
contact, checkout, a11y, visual-assets, hero-legibility). E2E runs in ~3 min
against a production build across two projects (chromium + mobile).

Report a *shrinking* count as a finding; a growing one is not itself news.

## Architecture / design decisions

See this repo's `CLAUDE.md` for the T4 design system, brand prohibitions, and
architecture principles, and `docs/testing-strategy.md` for what each test layer
covers and why. This loop appends new decisions it observes below; it does not
duplicate those files.

- **2026-07-28**: PR split — one session's work was split because bundling it
  violated this scaffold's own `maxFiles: 10` / one-fix-per-run rule:
  `euro-summer-visual-assets` (PR #4, merged) and
  `chore/loop-engineering-scaffold` (PR #5, this branch).
- **2026-08-01**: CI became a gate rather than a notification. Two jobs:
  `verify` (~2 min — lint, type-check, unit, build) is the merge gate and hands
  its `.next` artifact to `e2e`, so the build is paid for once and E2E validates
  exactly what the gate approved. `main` requires both.
- **2026-08-01**: Two guardrails encode lessons that cost real defects.
  `e2e/visual-assets.spec.ts` — presence is not visibility (the collection tiles
  shipped present, requested successfully, and invisible at `opacity: 0.12`).
  `e2e/hero-legibility.spec.ts` — visibility is not legibility; it samples
  rendered pixels behind text across six widths, because axe reports
  *incomplete* rather than *violation* when the backdrop is an image.
- **2026-08-02**: Checkout failures are typed and visible instead of swallowed.
  `CheckoutError` distinguishes `not-configured` / `placeholder-catalog` /
  `network` / `shopify-error`, retry is offered only where retrying can work,
  and the cart drawer surfaces the error inline rather than punting to
  `/checkout` to fail a second time. The site sends no order confirmation on
  purpose — Shopify's own email is the confirmation.
- **2026-08-02**: Prices carry `HJProduct.currencyCode` end to end. Ten
  surfaces hardcoded USD, including the homepage strips, which printed a raw
  `$` and never called `formatPrice` at all.
  `src/tests/unit/currency-consistency.test.tsx` guards both the rendered
  output and the source, because a rule that only checked formatter arguments
  would have missed six of them. Third guardrail in the same shape as
  visual-assets and hero-legibility: the rule is enforced, not just fixed.
- **2026-08-02**: `src/lib/shopify/env-check.ts` warns at build time when
  Shopify configuration is missing, naming the build-time `NEXT_PUBLIC_*`
  inlining and per-environment scoping traps explicitly. It warns rather than
  throws — the static-fallback catalog is the reason the site builds without
  Shopify, and a throw would break the architecture the check exists to
  protect. See `docs/testing-strategy.md`.

## Dedupe ledger

<!-- Loop appends "already reported on <date>: <finding>" here so the same
     finding is not re-surfaced every run. -->

## Run history / token spend

<!-- Loop appends a one-line summary per run: date, tokens, outcome. Full
     detail lives in loop-run-log.md; this is the human-readable index. -->

---
Run log: see loop-run-log.md
