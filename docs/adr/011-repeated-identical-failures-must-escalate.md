# 011 — A channel that repeats itself is a channel people mute

## Context

Issue #24 reached 24 byte-identical comments over six days. Every run of
`production-smoke.yml` since 2026-08-15 has failed the same way —
`SHOPIFY_ADMIN_ACCESS_TOKEN` does not start with `shpat_`, a Storefront token
sitting in the Admin slot — and every run appended the same "Still failing"
comment regardless of whether anything about the diagnosis had changed since
the last one.

`scripts/preflight-secrets.mjs` (`SHAPE_RULES`) already does the hard part
correctly: it distinguishes a *missing* secret from a *malformed* one, so this
was never a detection failure. The diagnosis has been right, and complete,
since the first failing run. What was missing was any judgment about what to
do with the same diagnosis the second, tenth, or twenty-fourth time it fires.

This is the ADR 006 / ADR 010 pattern again, in the one place those two did
not reach: both are about whether a control can announce a failure at all.
This one is about a control that announces the same failure forever and
never says "this needs a human, right now" any louder than the first time.

## Decision

**The "Report failure as an issue" step in `production-smoke.yml` compares
each run's diagnosis to the previous comment's before writing anything.**

- Diagnosis unchanged from the last comment → no new comment. A counter looks
  back over the trailing comments to see how many already say the same thing.
- Diagnosis changed (or this is the first failure) → comment as before. This
  also becomes the new baseline the next run compares against.
- Three unchanged diagnoses in a row, not yet escalated → one comment saying
  so, a `human-required` label, and a `[escalated]` title prefix. Then
  silence — no further comments — until the diagnosis actually changes or the
  run recovers.

`human-required` exists as its own label, separate from `production-smoke`,
because "this workflow is failing" and "this specifically needs a console
action, not a code change" are different facts and the first does not imply
the second — see `loop-constraints.md`'s credential-check handling.

## Consequences

- A run that has said the same thing 24 times now says it once more, loudly,
  and then stops saying it — rather than never stopping.
- The comparison is exact-string, not semantic. A diagnosis that changes for
  a cosmetic reason (a different truncation boundary, a reordered check) will
  read as "new" and reset the streak. That is the safe direction to be wrong
  in: an extra comment costs nothing, a suppressed real change costs a
  missed regression. No case of this has been observed yet.
- This does not fix issue #24. Nothing in this repository can — the value is
  a console credential, and the fix is a human pasting the right one into
  Shopify Admin → Apps → API credentials and then GitHub → Environments →
  `production-readonly`. See `docs/go-live-runbook.md`.

Referenced by: `.github/workflows/production-smoke.yml`,
`scripts/preflight-secrets.mjs`, `loop-constraints.md`, `STATE.md`.
