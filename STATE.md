# Loop State — Healthy-Jewelry

Last run: 2026-07-28T00:00:00Z — euro-summer-visual-assets branch, draft PR opened

## High Priority (loop is acting or waiting on human)

- [ ] SOCIAL-PROOF-DESIGN — `public/images/lifestyle/social-proof-ugc.jpg` and
  `logo-candidate.png` copied into the repo but intentionally left unwired.
  No existing UGC/social-proof section or logo-swap stub exists anywhere in
  the codebase to hang them on.
  Loop action: report only, did not invent a section design
  Human decision: pending — needs a design decision on placement/composition
  before implementation
- [ ] COLLECTIONS-JSON-DRIFT — `src/content/collections.json` (consumed only
  by `src/lib/content.ts`'s `getAllCollections`/`getFeaturedCollections`/
  `getCollectionBySlug`) was NOT updated with the new Charms collection.
  Confirmed via grep this data path is dead/unused by any live route,
  component, or nav — only self-referencing in `content.test.ts` — so this
  is a pre-existing, harmless data-duplication issue (two parallel
  collection lists: this JSON file vs. `hj-data.ts`'s `hjCollections`), not
  something this run introduced. Skipped to stay within the repo's
  `gate.yaml` `maxFiles: 10` limit, which the 3 requested places
  (navigation.ts, hj-data.ts, and full routing support) already reached.
  Loop action: report only
  Human decision: pending — trivial 1-file follow-up if desired

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

already reported on 2026-07-28: SOCIAL-PROOF-DESIGN, COLLECTIONS-JSON-DRIFT
(see High Priority above)

## Run history / token spend

<!-- Loop appends a one-line summary per run: date, tokens, outcome. Full
     detail lives in loop-run-log.md; this is the human-readable index. -->

2026-07-28: euro-summer-visual-assets branch, 3 commits, draft PR opened —
fix-proposed (see loop-run-log.md for detail)

---
Run log: see loop-run-log.md