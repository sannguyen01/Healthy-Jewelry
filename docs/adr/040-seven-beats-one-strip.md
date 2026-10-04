# ADR 040 — Seven beats, one strip

**Date**: 2026-10-04
**Status**: Accepted provisionally. The owner has not yet chosen between seven beats and eight;
this records the default taken so the integration branch can be gated, and it is reversible by
restoring the three removed pieces.
**Supersedes**: the eight-beat "Homepage Section Sequence" in `CLAUDE.md` before 2026-10-04.

## Context

The redesign (PR #100) renders seven sections: Hero, Materials, one "Curated pieces" strip,
CollectionGrid, RealMoment, CareSection, FollowUp. `CLAUDE.md` documented eight: three
horizontal strips, a dark campaign band, a collection grid and the materials section. The campaign
band and two strips were removed with no record, and `homepage-composition-contract.test.ts` and
`e2e/homepage-composition.spec.ts` still pinned the old sequence. The review of 2026-10-03 called
this out as a change made without a decision.

## Decision

Keep seven beats and one strip, and write the decision down.

- One strip, "CURATED PIECES", fed by bestsellers then new arrivals through `dedupeInOrder`. The
  "same product in two strips" failure the old test guarded cannot occur with one strip, so the
  distinctness check is reduced to "each product once".
- The campaign band's job — the single dark interruption — passes to CareSection, rebuilt on the
  contrast-tested dark tokens (`--black`, `--on-dark`, `--mist`). It had been `--graphite` with
  50%-alpha text, which was neither dark by the page rule nor demonstrably legible.
- CareSection moves to beat three, beside Materials: its content explains the metals, and the
  dark band must fall in the first half of the page to read as an interruption, not a conclusion.

## Consequences

- `CLAUDE.md`, the unit contract and the e2e spec all describe the same seven beats.
- The "exactly one dark section, in the first half" rule is unchanged and still enforced.
- A fourth strip or the campaign band returning is a new decision and a new ADR.
- Open for the owner: choose eight beats instead, and this ADR is superseded rather than edited.
