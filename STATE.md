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

## Recent Noise (ignored this run)

## Architecture / design decisions

See `C:\Users\DELL\memory\decision.md` (global) and this repo's own `CLAUDE.md`
for the T4 design system, brand prohibitions, and architecture principles.
This loop appends new decisions it observes below, but does not duplicate
CLAUDE.md's content.

## Dedupe ledger

<!-- Loop appends "already reported on <date>: <finding>" here so the same
     finding is not re-surfaced every run. -->

## Run history / token spend

<!-- Loop appends a one-line summary per run: date, tokens, outcome. Full
     detail lives in loop-run-log.md; this is the human-readable index. -->

---
Run log: see loop-run-log.md