# 030 — An equivalence relation is the control

## Context

Issue #24 — "Production smoke is failing" — was opened by the scheduled smoke workflow on
2026-08-15. On 2026-09-15 it held **100 comments**, one per failing run, across roughly 124
runs. Every one of them said the same thing: a Shopify Admin token sitting in the wrong
slot, a webhook secret that is the wrong one of the two.

It had escalated **zero times**.

`.github/workflows/production-smoke.yml` was supposed to make that impossible. It carried
this, in a comment above the step, written when [ADR 011](011-repeated-identical-failures-must-escalate.md)
was adopted:

> Issue #24 reached 24 byte-identical "Still failing" comments over six days — same secret,
> same wrong prefix, every six hours — because this step compared nothing. […] So: compare
> the new diagnosis to the last comment's. Unchanged → skip the comment and count the streak
> instead. At 3 unchanged in a row and not yet escalated → one escalation comment, a
> `human-required` label, and a title prefix, then silence.

The fix was written. It shipped. It never once ran to completion, and the issue went from 24
comments to 100 underneath a comment block describing the mechanism that was supposed to
stop it.

### Three reasons, in about a hundred and ten lines

**One — the comparison could never be true.** The step built its diagnosis from the raw tail
of each step's log, and the storefront log prints a figure measured on that run:

```
✓ Open Graph image renders within the crawler budget
  176ms cold, 17KB (budget 2500ms)
```

Nine consecutive comments on #24 read 176, 99, 145, 106, 186, 129, 209, 137, 194. So
`unchanged` was always `false`, the `!unchanged` branch fired every run, and the escalation
below it was dead code from the first commit.

This was not carelessness about volatility. The author had thought about it — `diagnosisOf()`
strips the run URL, for exactly this reason. They removed the volatile field visible in the
comment's header, and missed the one forty lines inside a `<details>` block.

**Two — the counter counted the thing it was suppressing.** `streak` counted *trailing
identical comments*, and the same branch suppressed the comment whenever the diagnosis was
identical. So the count could never exceed the single comment that had been let through, and
`streak < escalationThreshold` held forever. With the volatile figures removed, the
escalation would still never have fired.

**Three — the tail was not the tail.** `listComments({ per_page: 100 })` with no pagination,
then `comments[comments.length - 1]`. GitHub returns page one, so past a hundred comments
"the last comment" is the hundredth *oldest*. Issue #24 stood at exactly 100 when this was
written — one comment short of the cliff.

Three independent defects, all in one direction, none of them caught.

### Why none of them was caught

Because the code was not in a file.

All of it lived inside a YAML `script:` string. A function in a string literal cannot be
imported, so no test could reach it, so no test existed. The only way to exercise the
decision was to break production and wait six hours for the next scheduled run — and when it
ran, its output was a comment on an issue that looked exactly like the ninety-nine before it.

This repository already has the rule that would have caught it.
[ADR 024](024-a-tool-never-pointed-at-a-known-answer.md):

> A verification tool may not be registered until a test has fed it a fixture with a known
> answer and asserted the verdict. […] The rule is not "write more tests". It is that a tool
> whose verdict cannot be exercised without side effects has no known-answer test
> *available* to it, so the question never gets asked.

That is precisely what happened, and ADR 024 could not apply, because it talks about
`scripts/`. The registry said so out loud, in the `smoke-escalation` entry's own
`knownLimit`:

> The escalation logic lives inline in a github-script step and has no unit test. Issue #24
> shows it working — escalated and labelled `human-required` on 2026-08-22 — but that is
> evidence from one occurrence, not a standing check.

The limit was disclosed honestly and the disclosure was wrong on its facts: the one
occurrence it cited as evidence was a label applied by hand. Nothing here had ever escalated.
**A `knownLimit` is a promise that somebody will look. Nobody looked for a month.**

### What the decision actually is

Strip the plumbing away and this step answers one question: *are these two failures the same
failure?* That is an equivalence relation over diagnosis text, and it has two ways to be
wrong, which are mirror images:

| Too strict | Too loose |
|---|---|
| Nothing is ever equal | Everything is equal |
| A hundred identical comments | A new outage folded silently into an old streak |
| Looks broken | Looks fine |

The shipped version was maximally strict, and the obvious repairs — hash the interesting
bits, compare with a similarity threshold — move it toward the other failure without saying
how far. An approximate answer to "is this the same failure?" fails in whichever direction
its tuning leans, silently, exactly as this one did.

## Decision

**A decision that reaches a person is a pure function in a file, with a test that has been
pointed at a known answer. The workflow step that carries it is a transport and composes no
sentence of its own.**

Concretely:

1. **`scripts/lib/escalation.mjs`** holds `escalationDecision()` — pure, total, taking the
   open issue, the comments, the diagnosis and the labels, and returning what to do. Every
   human-readable string the channel emits is composed there, because a sentence inside a
   YAML string literal is a sentence no test can read.

2. **The equivalence relation is explicit and enumerated.** `diagnosisKey()` keeps only
   actionable verdict lines — `✗`, the `Failed:` summary, the `Could not be evaluated:`
   summary — and rewrites volatile tokens from a named allowlist: ISO timestamps, run ids,
   URLs, `Nms`, `NKB`. **Not a hash, not a ratio.** Adding a normaliser widens what counts
   as "the same failure", so it is an edit somebody makes on purpose, in a table, with a
   name attached.

   The module header carries the corresponding instruction: *a new per-run figure on a
   verdict line needs a normaliser entry in the same commit, or this bug returns in full.*
   Stated rather than implied, per [ADR 019](019-an-unclassified-entry-is-an-unverified-one.md).

3. **The relation's limit is asserted, not described.** Detail bullets under a `✗` header do
   not participate in the key, so two different wrongly-set secrets compare equal. That is a
   deliberate narrowing toward quiet, it errs in the direction that does not look broken,
   and it is a passing test in `escalation-decision.test.ts` so it stays a known property.

4. **The streak is durable.** It lives in a `<!-- smoke-streak: N -->` marker on the standing
   report comment, and the quiet path edits that comment in place. GitHub sends no mail for
   an edit, so "quiet" still means quiet — and the threshold becomes reachable, which it was
   not. The visible half of the marker also means a person opening the issue reads
   "unchanged for 12 consecutive runs" instead of counting comments.

5. **The escalation can happen more than once.** When the diagnosis moves, the
   `human-required` label and the `[escalated]` prefix come off, because the escalation
   comment already promises "until the diagnosis changes" and that sentence was untrue.

6. **A budget is the ratchet.** `src/tests/unit/workflow-inline-script-budget.test.ts` parses
   every workflow, finds every `github-script` step, and fails any whose `script:` body
   exceeds **45 lines of logic** (blank lines and `//` comments excluded — a budget that
   taxed explanation would be paid by deleting the explanation). The extracted transport is
   32 lines; 45 leaves room for plumbing and none for a decision.

   Four blocks exceed it today, all in the reporting tier, all holding decisions. They are
   listed by name and frozen at their current size. **The list may shrink; it may never
   grow.** A number chosen to fit today's worst case would ratchet nothing, and a list has
   to be read by whoever shortens it.

## Consequences

`src/tests/unit/escalation-decision.test.ts` covers every branch with injected inputs — no
clock, no issue, no six-hour round trip. Its fixtures are two comment bodies captured
verbatim from issue #24 (comments 5671158651 and 5674519891, 194ms against 163ms), because a
fixture shaped to the parser only proves the parser agrees with itself
([ADR 028](028-a-fixture-is-the-input-you-thought-of.md)). Both directions are asserted on
every property: same cause equal, different cause unequal.

The tests were mutation-checked before merge. Returning the raw input from `diagnosisKey` —
which is the shipped behaviour — turns the headline case red, along with eighteen others.
Dropping the `ms` normaliser, reading `reports[0]` instead of the tail, pinning the streak to
a constant, and narrowing the verdict lines each turn red the specific case that claims to
cover them.

`docs/controls.json` gains `workflow-inline-script-budget` and rewrites `smoke-escalation`:
its probe is now a unit test in the merge gate rather than the workflow describing itself,
and the `knownLimit` conceding that the logic had no test is gone because the concession is
no longer true.

**What this does not fix.** Nothing here proves the channel works *in production* — that the
workflow runs, that the token has the right scopes, that an edit really does stay silent. The
first of those is `smoke-liveness`'s job, and it is this control's backstop. The rest is the
same regress [ADR 022](022-absence-needs-its-own-alarm.md) records: at some tier the evidence
stops being automated, and here it stops at a person reading issue #24 and seeing the comment
count stop climbing.

**The generalisation.** [ADR 029](029-a-governance-clock-is-not-a-merge-gate.md) found a
control that reported correctly down a channel that could not act. This is its neighbour: a
control that could not report at all, because the reporting logic was written somewhere no
test could reach it. Both are failures of *venue* rather than of reasoning. The mechanism was
correct in both cases and the place it was put made it inert — and in both cases the
repository had already written down the rule it was breaking.
