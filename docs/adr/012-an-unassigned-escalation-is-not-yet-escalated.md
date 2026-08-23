# 012 — An unassigned escalation is not yet escalated

## Context

Issue #24 was opened 2026-08-15, correctly diagnosed on its first run
(`SHOPIFY_ADMIN_ACCESS_TOKEN` holds a Storefront token, not an Admin one — it must start with
`shpat_`), and correctly escalated per [ADR 011](011-repeated-identical-failures-must-escalate.md)
on 2026-08-22 after three identical diagnoses: `human-required` label, `[escalated]` title
prefix, comments stopped. As of this ADR (2026-08-23) it is **still open, still
`human-required`, and has no assignee.** The mechanism engineering built — correct diagnosis,
correct dedup, correct one-time loud escalation — has worked exactly as designed for over a
week while nothing has happened.

ADR 011 already names its own limit, in its own Consequences section: *"This does not fix
issue #24. Nothing in this repository can — the value is a console credential, and the fix is
a human pasting the right one in."* That is true and was the right thing to write. But it
describes the wrong failure. The gap issue #24 exposes now is not "the code can't paste a
credential" — obviously true, and never in question — it is that **`human-required` names a
condition, not a person.** A label is broadcast to everyone watching the repository, which in
practice reaches whoever happens to be reading issues that day, which over eight days has been
no one. ADR 011 solved *a channel that repeats itself is a channel people mute*. It never
addressed *a channel that speaks once to no one in particular is easy to miss entirely.*

The same shape appears one layer up, in [`loop-constraints.md`](../../loop-constraints.md)'s
own written rule — *"Max 3 fix attempts per item; escalate after"* — which the Hero section's
five-to-six round regression history (see `STATE.md`'s architecture notes and
`e2e/hero-legibility.spec.ts`'s history) blew past twice over without ever triggering, because
the agentic loop meant to enforce it (`LOOP.md`) has never been wired to a scheduler in this
repo. Two different escalation mechanisms, two different silent gaps, the same root shape:
**a rule that fires into open air is indistinguishable, from the outside, from a rule that
never fires at all.**

## Decision

An escalation is not complete until it names a person, and a person who does not respond is
itself information the mechanism should surface — not silence indistinguishable from
resolution.

Concretely, once `production-smoke.yml`'s ADR 011 escalation step fires (three identical
diagnoses, not yet escalated):

1. **Assign the issue**, not just label it. A single configured owner (a repo variable, not a
   hardcoded username, so it can change without a code edit) is added as assignee in the same
   step that adds `human-required`.
2. **A second timer, longer than the first.** ADR 011's three-strikes window catches the
   *diagnosis* repeating. This one catches the *response* not arriving: if a `human-required`
   issue is still open, still assigned to the same person, and has received no new comment
   after a longer threshold (proposed: 5 further days — long enough not to page someone for a
   problem they're already working, short enough that eight days doesn't become the norm), the
   next run escalates again — louder than a label, e.g. reassigning explicitly (which
   re-triggers a GitHub notification even to an existing assignee) or naming the staleness
   directly in a new comment. It does not re-run the three-strikes dedup logic; the diagnosis
   hasn't changed, the *silence* has.
3. **The loop scaffold gets the same treatment it would ask for.** `loop-constraints.md`'s
   three-attempt cap is only enforceable by something that runs continuously and counts. Until
   `LOOP.md` is wired to an actual scheduler (`LOOP.md:10-11` states plainly that nothing in
   this repo registers one), that rule is prose, not a control — the same distinction ADR 007
   draws between a guardrail and something that merely reads like one. This ADR does not fix
   that; it names it, the same way ADR 011 named issue #24 without being able to close it.

## Consequences

- **Not implemented in this change.** Step 1 and 2 above touch `.github/workflows/*.yml`,
  which `loop-constraints.md`'s repo-specific hard gates mark as *"maintained, not frozen;
  escalate instead"* of autonomous edits — the one category of file this project has drawn an
  explicit line around. This ADR is the escalation loop-constraints.md itself asks for: the
  decision is written and dated, the workflow edit is a separate, human-directed change.
- Issue #24 itself was assigned directly, outside of this workflow change, once this gap was
  found — see `STATE.md`. That closes the *instance*. This ADR is about closing the *pattern*
  so the next `human-required` issue doesn't repeat it.
- The corollary this project already applies to guardrails (ADR 007: *"what would I see if
  this failed?"*) applies here too: what would a maintainer see if an escalation went
  unanswered forever, under the mechanism this ADR proposes? A second, louder ping, not
  silence. Under the mechanism as it exists today, at time of writing: nothing, indefinitely.
- This does not solve the general case posed alongside it — a defect sitting on the seam
  between three independently correct systems (build, Shopify operations, content) has no
  single console this pattern can name an owner for, only single-cause credential failures
  like issue #24. A cross-functional gap needs a named owner *decided by a human*, not inferred
  by a workflow; what this ADR guarantees is that once decided, that name doesn't go stale
  into a label nobody reads.

Referenced by: `.github/workflows/production-smoke.yml` (pending human-directed change),
[ADR 011](011-repeated-identical-failures-must-escalate.md), `loop-constraints.md`, `LOOP.md`,
`STATE.md`.
