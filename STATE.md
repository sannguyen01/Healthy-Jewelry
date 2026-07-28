# Loop State — Healthy-Jewelry

Last run: never

## High Priority (loop is acting or waiting on human)

- [ ] VERCEL-ENV — 8 Vercel env vars not yet set (Shopify tokens, site URL,
  webhook/revalidation secrets, Resend key, Upstash Redis URL+token)
  Loop action: report only, never propose setting these yourself
  Human decision: pending
- [ ] SHOPIFY-WEBHOOK — Shopify webhook not yet registered to `/api/webhooks/shopify`
  Loop action: report only
  Human decision: pending
- [ ] VISUAL-QA — live browser visual QA + axe a11y + checkout redirect not yet
  run against the deployed Vercel URL
  Loop action: report only
  Human decision: pending

## Watch List

- [ ] MAIN-CI-FAILING — `main`'s CI has been failing on every push since
  2026-06-29, across multiple unrelated causes on different commits. Not
  caused by this loop and not an auto-fix target; flagged for human
  awareness only. Do not treat a green loop run as evidence that `main`'s
  CI is currently healthy.

## Recent Noise (ignored this run)

## Architecture / design decisions

See `C:\Users\DELL\memory\decision.md` (global) and this repo's own `CLAUDE.md`
for the T4 design system, brand prohibitions, and architecture principles.
This loop appends new decisions it observes below, but does not duplicate
CLAUDE.md's content.

- **2026-07-28**: PR split — a single combined session's work was split into
  two PRs because bundling it violated this scaffold's own `maxFiles: 10` /
  one-fix-per-run rule (see `gate.yaml`, `loop-constraints.md`):
  - `euro-summer-visual-assets` (PR #4) — visual/Charms feature work, adding
    Charms as a 5th product collection alongside rings/necklaces/earrings/
    bracelets. Still open/draft. Went through a full review-fix cycle this
    session — scrim fix, Charms rollout completeness, dead asset removal,
    gradient fix — all landed.
  - `chore/loop-engineering-scaffold` (PR #5) — this loop tooling itself.
    Still open/draft.
  - **Follow-up needed once PR #4 merges**: `CLAUDE.md` still documents "4
    collections: rings, necklaces, earrings, bracelets" — this will be stale
    once Charms lands and should be updated to 5 collections. Deliberately
    not fixed here since PR #4 has not merged yet; whoever merges PR #4
    should update `CLAUDE.md` in the same change or immediately after.
  - Separately, this session also found and fixed a pre-existing E2E bug in
    `e2e/cart.spec.ts` (missing ring-size selection before add-to-bag),
    unrelated to either PR, on its own branch `fix/e2e-cart-size-selection`.

## Dedupe ledger

<!-- Loop appends "already reported on <date>: <finding>" here so the same
     finding is not re-surfaced every run. -->

## Run history / token spend

<!-- Loop appends a one-line summary per run: date, tokens, outcome. Full
     detail lives in loop-run-log.md; this is the human-readable index. -->

---
Run log: see loop-run-log.md