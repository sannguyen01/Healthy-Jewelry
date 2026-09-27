# ADR 037 — A reconciliation at the wrong grain

**Date**: 2026-09-26
**Status**: Accepted
**Supersedes**: nothing. Corrects a stated limit of
[ADR 036](036-a-prohibition-in-prose-is-not-a-boundary.md); extends
[ADR 007](007-regex-guardrails-have-unknown-coverage.md) and
[ADR 030](030-an-equivalence-relation-is-the-control.md).

## Context

ADR 036 made the commerce boundary something the build checks: a contract parsed on every
merge, and a register of every file still carrying a commerce identifier, reconciled in both
directions. It shipped the same day, green, with a mutation sentinel proving it could fail.

The same day, a read-only audit of the scanner found that it reconciled **the register's
paths**, never its contents. `retainedPaths()` reduced each row to its `Path` cell and
`evaluate()` never read the `Identifiers` column it had just parsed. So:

- an identifier added to a file that already had a row passed silently;
- an identifier removed from a file that still carried another passed silently;
- two rows for one path collapsed into one entry of a `Set`;
- a row naming an identifier the contract does not define was never questioned.

Two rows had **already drifted** on merge day: `.claude/skills/project-conventions/SKILL.md`
and `loop-constraints.md` declared `shopify-env`, which neither file carried. The register
said one thing, the tree said another, and the gate reported "The boundary holds."

The lexer that decides whether a hit sits in code or in prose was also worse than its
documented limit. The limit named `//` inside a string literal and argued that the misread
"weakens a finding rather than inventing one — the safe direction". The worse case went
undocumented: `/*` inside a string (`'e2e/**'` is enough) opens a block comment that swallows
every following line until a `*/` turns up. Measured on the tree: 14 such lines, 29
identifier hits moved from code to prose, and one of them an `absolute` finding —
`graphql.json` in a test's string literal — hidden entirely.

## Decision

**A reconciliation is only as strong as the grain it compares at.** A register row declares a
set; the tree exhibits a set; the control is set equality, per row, both directions. Every
whole-file exemption the contract grants (`negative-control`, `specification`) now declares
what it carries in the same way, so no file anywhere in the repository may carry an
identifier nobody wrote down.

**For a prohibition scanner, "weakens a finding" is the unsafe direction.** A misread that
hides a finding is exactly the failure the scanner exists to prevent; one that invents a
finding is noisy and gets fixed the same afternoon. The lexer is now string-, template- and
regex-aware, and it is checked against an independent implementation — the TypeScript
compiler's own comment ranges — over every tracked script and source file. Two
implementations that must agree is the ADR 007 move applied to the scanner itself: the
coverage of one parser is unknowable, the disagreement of two is a finding.

**A floor is not a ratchet.** `register.length >= 20` protected the register from becoming
accidentally empty and would have failed on the day the decommission finished — the ADR 035
shape, a control outliving its subject. It is replaced by a stated phase (`active` /
`complete`) and an equality-pinned row count: lowering it requires deleting rows, raising it
requires an explained edit, and flipping the phase to make a count pass fails in both
directions.

## Consequences

- **It caught real drift on its first day, twice, in opposite directions.** Integrating the
  masterplan-v2 workstreams, the exact-set rule refused one branch because a vendor-domain list
  moved into `scripts/lib/browse-only.mjs` and made that negative-control file carry an
  identifier its `Carries` cell did not declare; and refused another because
  `catalog-content.test.ts` began reading contract §8 instead of restating the field names, so
  its exemption had become wider than its use. The file-level register would have passed both.

- A register row is now finished by making its declared set empty — which means deleting it.
  A row that is *partly* done must say so by changing its declared identifiers, and that edit
  is visible in review.
- The scanner's known-limits text changes: limit (1) is closed rather than restated; limit
  (3) is closed by the `Carries` column; limit (2) — what the build emits rather than what the
  tree contains — is now owned by the build-artifact scan.
- The pattern generalises beyond this scanner, and this repository has it elsewhere: any
  control that parses a table and then reduces it to a key before comparing has thrown away
  the columns it was meant to check. The review question is **"what does this compare, at
  what grain?"**, not "does it parse the table?".
