# 025 — A number in prose is a claim like any other

## Context

`CLAUDE.md` documented `--titanium-text` as `#5E6870`. That is not a stale value — it is the one
`globals.css` records as measuring 4.39:1 on the bestseller badge's composited tint and *failing
AA*, which is why the shipped token is `#59636B`. The ratio printed beside it, 5.64:1, is correct
for `#59636B` and wrong for `#5E6870`. Somebody updated the number and not the colour.

It was found **by accident**, while writing a mutation for an unrelated contrast sentinel. Nothing
was looking for it.

The fix that followed was targeted at the file where it was noticed, and was therefore incomplete.
`docs/testing-strategy.md` carried **the same rejected hex**, with its own correctly-computed
5.23:1 beside it — internally consistent, describing a colour this codebase does not use. It
survived the fix for itself.

An exhaustive sweep found the second copy in under a minute, and a second defect with it:
`testing-strategy.md` claimed `premise-checks.test.ts` runs **18 tests** when vitest reports 29.

That is the argument. One incidental discovery says nothing about how many others exist, and a
patch aimed at the place you happened to be looking will miss the copy you were not.

## Decision

**Documents that describe current state are swept completely: every numeric token is either a
`LIVE` claim reconciled against a named source, or a `HISTORICAL` one recording a past
measurement.** No third state — [ADR 019](019-an-unclassified-entry-is-an-unverified-one.md)'s
rule, applied to numbers in prose.

`src/tests/unit/doc-numeric-claims.test.ts` does the reconciling. Contrast ratios are recomputed
from `globals.css`; breakpoints are read from the components that declare them; caps from the
custom properties; test counts from the test files.

### ADRs, `STATE.md` and `CHANGELOG.md` are historical by construction

They are not swept, and that is a classification rather than an exemption. An ADR records what was
measured on the day a decision was made. *"The header required 414px"* is not a claim about the
header today — it is the reason the header changed. Re-measuring it would not correct the record,
it would falsify it.

The same distinction applies inside a live document: `CLAUDE.md` says the header **must fit 320px**
(live, enforced by `header-fit.spec.ts`) and that it **required 414px** before the fix
(historical). Both numbers, one sentence apart, and only one of them can drift.

## Consequences

- **Both directions are checked.** A `LIVE` entry whose context no longer appears in the document
  fails, and so does a `HISTORICAL` one — a reconciliation pointing at deleted prose is the fossil
  pattern applied to this table.
- **The completeness check is what makes it work.** Reconciling a hand-picked list would have
  reproduced the original defect: a list is exactly what `--sage` was missing from. Every number
  in a live document must be classified, so a new one fails the suite until somebody decides which
  kind it is.
- **Scope is stated, not implied.** Two live documents today, ~48 numeric tokens. Adding a third
  is adding it to `LIVE_DOCUMENTS`; the completeness check then names every number in it.
- **This is the fourth kind of claim to get a reconciler**, after check-run names (ADR 018),
  enumerations (ADR 019) and palette values. The through-line is the same each time: prose is a
  claim, and a claim nothing compares to its source is a decoration.

Referenced by: `src/tests/unit/doc-numeric-claims.test.ts`, `CLAUDE.md`,
`docs/testing-strategy.md`, [ADR 019](019-an-unclassified-entry-is-an-unverified-one.md).
