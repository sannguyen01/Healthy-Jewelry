# 029 — A governance clock is not a merge gate

## Context

At 2026-09-15T00:00:00Z, `main` went red. Nothing had been pushed to it since the previous
afternoon.

`src/tests/unit/control-registry.test.ts` measured every deliberately-accepted control gap
against `Date.now()` and failed past `ACCEPTED_GAP_MAX_AGE_DAYS = 30`:

```
FAIL  an accepted gap expires rather than decaying
      > smoke-secret-isolation: the acceptance has been restated recently enough
AssertionError: smoke-secret-isolation's gap was accepted 31 days ago, over the 30-day limit.
      expected 31 to be less than or equal to 30
```

That test runs inside `verify` — the merge gate. So a clock ticking over turned **every pull
request in the repository** red, including dependabot's #66 and #67, whose diffs could not
have caused it. `merge-gate` was on the same fuse for 2026-10-01, which would have added a
second failing assertion to the same job.

The two gaps in question are `smoke-secret-isolation` (move five secrets onto a GitHub
Environment) and `merge-gate` (enable branch protection). **Both are GitHub Settings
actions.** Neither is reachable from a pull request, by anyone, in any diff.

So the assertion was addressed to the one population that cannot act on it, and it spoke by
blocking their unrelated work. The person who *can* act — the repository owner, in a settings
console — received nothing, because a red check on somebody else's PR is not a message.

### The check was right. Its severity was not.

The reasoning behind the threshold is sound and unchanged. `scripts/lib/accepted-gap.mjs`
states it exactly:

> It is **not a deadline for fixing the gap**. It is a deadline for deciding again. A gap
> nobody restates is indistinguishable from one nobody remembers, and the probe that watches
> it stays quiet in either case — which is precisely the state `merge-gate` was in while
> eleven commits reached `main` unverified.

Nothing about that is wrong. What was wrong is where it was enforced.

This repository already holds the correct posture for this exact class, in two places, with
the reasoning written out:

- **`ci.yml`'s orphaned-credential audit** is `continue-on-error: true`, and says why:
  *"it exits 1 when orphans exist, and there are three right now, so a blocking step would
  freeze every merge on a hygiene finding nobody can fix from a pull request. Same trade as
  premise drift (ADR 008): report prominently, never block."*
- **Premise drift** ([ADR 008](008-decisions-need-premise-detectors.md)) opens a
  `premise-drift` issue rather than failing anything.

Both describe the situation precisely. Neither was applied to the acceptance clock.

### Why it survived review

Because the duplication had already been noticed, and reasoned about backwards.
`scripts/probe-branch-protection.mjs` — which reads the *same* constant and *already*
escalates a stale acceptance — carries this comment:

> `stale-acceptance` — the gap has not been consciously restated inside
> `ACCEPTED_GAP_MAX_AGE_DAYS`. `control-registry.test.ts` already asserts this, but it
> asserts it *in the merge gate*, **which is the thing that does not exist.** A deadline
> enforced only by the absent control is not a deadline.

The premise is that an unprotected `main` makes the merge gate's verdict inert. That is true
of *merging* — anybody can press the button past a red check — and false of *signalling*: a
failing `verify` job is visible on every pull request whether or not anything requires it.
The assertion was not inert. It was fully effective, at the wrong severity, on the wrong
audience.

The duplication was also asymmetric in a way nobody checked. `escalationDecision()` is
hardwired to the `merge-gate` entry, so `merge-gate` staleness had two channels — a probe
*and* a blocking test — while `smoke-secret-isolation` had only the blocking one. The gap
with the worse coverage is the one that fired.

### The generalisation

This is the third variant of one defect in this repository, and the first in this direction:

| ADR | Shape |
|---|---|
| [010](010-a-control-that-cannot-fail.md) | A control that **could not** report failure |
| [018](018-a-claim-about-a-control-is-not-a-control.md) | A claim that **asserted** a control nothing implemented |
| **029** | A control that reported correctly, **down a channel that could not act** |

A finding is not delivered when it is *emitted*. It is delivered when it reaches somebody
who can change the thing it is about. Correctness of the check and correctness of the
channel are independent properties, and this repository had been checking only the first.

## Decision

**A check whose subject a pull request cannot change must not block a pull request.**

Concretely:

1. **Wall-clock and console-state findings report; they never gate.** If the condition can
   become true with no commit — a date passing, a setting changing, a credential expiring,
   a third party's state drifting — it belongs in a scheduled probe that opens an issue, not
   in `verify`.
2. **The merge gate keeps only what a diff can break.** For accepted gaps that is: does the
   entry record *when* it was accepted, in a parseable form; and does it record *why*, at a
   length that makes it a reason. Both fail on the commit that introduces them, which is the
   property the age check never had.
3. **A finding that reaches a person is a pure function with its own tests.** The decision to
   escalate, and the text a human reads, live in the probe — not in a YAML string literal.
   See [ADR 030](030-an-equivalence-relation-is-the-control.md).
4. **One fact, one label.** `merge-gate-unenforced` says branch protection is absent.
   `control-acceptance-stale` says an acceptance has stopped being restated. Both can be true
   of `merge-gate` at once and neither implies the other, and `smoke-secret-isolation` can
   only ever raise the second ([ADR 011](011-repeated-identical-failures-must-escalate.md)).

## Consequences

`scripts/probe-accepted-gap.mjs` ages every control with `status: "not-configured"`, on
`control-audit.yml`'s six-hourly schedule, and opens or updates a single
`control-acceptance-stale` issue, closing it on recovery. It exits **0 whatever it finds** —
a non-zero exit would have recreated the merge freeze inside a scheduled job.

Its `escalationDecision()` and `composeBody()` are pure and exported, covered by
`src/tests/unit/probe-accepted-gap.test.ts` with an injected clock. The check is therefore
**more** testable than it was as an assertion against `Date.now()`, not less: the old version
could only be exercised by waiting.

Two assertions were added to `control-registry.test.ts` that the age check never had. An
`acceptedSince` of `"2026-13-45"` matches the date-shaped regex and parses to `Invalid Date`;
`daysSinceAccepted` would return `NaN`; `NaN > 30` is `false` — so a typo would have read as
permanently fresh and the probe would never have spoken. A future-dated acceptance has the
same effect for longer. Both now fail on the commit that introduces them.

**What this deliberately does not do** is make either gap easier to ignore. The finding is
louder than before for the person who can act — a titled issue with the console path in it,
rather than a red X on someone else's pull request — and silent for everybody who cannot.
That asymmetry is the whole decision.

**The stated limit.** Nothing watches `control-audit.yml` itself. `probe-ci-liveness.mjs`
watches `ci.yml` and `probe-smoke-liveness.mjs` watches `production-smoke.yml`, but the
auditing tier has no auditor — so if it stops executing, this probe goes quiet and its
silence is indistinguishable from an all-clear. That is [ADR 022](022-absence-needs-its-own-alarm.md)
one tier up, it is unclosed, and it is recorded in the registry's `knownLimit` rather than
implied. The weekly human backstop is what covers it today.
