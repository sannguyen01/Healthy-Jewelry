# 022 — Absence needs its own alarm

## Context

`production-smoke.yml` has run every six hours since 2026-08-21. Every one of those runs has
failed at the preflight step: `SHOPIFY_ADMIN_ACCESS_TOKEN` on the `production-readonly`
environment holds the wrong kind of token. Issue #24 has been open since 2026-08-15, carries 32
comments, escalated correctly after three identical diagnoses, and has been labelled
`human-required` since 2026-08-22.

Every one of those controls worked. [ADR 011](011-repeated-identical-failures-must-escalate.md)'s
dedup-and-escalate did its job. [ADR 012](012-an-unassigned-escalation-is-not-yet-escalated.md)'s
assignment did its job. The diagnosis is correct, actionable, and names the exact console.

What none of them said is the part that matters. Run 33120472571, which is the shape of all
thirty-plus:

```
Preflight — secrets present and environment-scoped   failure
Live store and storefront                            skipped
Webhook signing secret                               skipped
```

The whole run completed in **six seconds**. `verify-production.mjs` never executed. So the
fabricated-catalogue detector — the only thing standing between customers and a static
placeholder catalogue whose variant IDs Shopify rejects at checkout — and
`classifyPhotographyCoverage`, which watches the one open item this storefront's entire premise
rests on, have both been dark since 2026-08-15.

Nothing anywhere reported that. Not because a control failed, but because **every control in
this repository reports the presence of a failure, and none reports the absence of a success.**

Three things conspire:

1. **A skipped job is indistinguishable from a passing one from outside.** The Actions API says
   `skipped`; a dashboard shows neither red nor green; the job summary prints it in a table row
   that reads like any other.
2. **The run's failure has a visible, correct, sufficient-looking cause.** A reader opens the red
   X, sees "wrong token", and stops. There is no reason to keep reading, and the thing worth
   knowing is further down.
3. **The notification channel was already saturated.** Issue #24 says the same true thing 32
   times. Adding a 33rd comment saying something *different* would land in a thread people have
   learned to skip — which is [ADR 011](011-repeated-identical-failures-must-escalate.md)'s
   finding turned against the reader.

## Decision

**A monitor that fires on the absence of a success, in its own channel.**

`scripts/probe-smoke-liveness.mjs` asks a different question from every other check here: not
*did something fail?* but *has anything looked at production recently?* It reads the Actions API
for `production-smoke.yml` runs in the last 26 hours and requires at least one in which the
**step** `Live store and storefront` concluded `success`.

The step, not the job. A job that fails at the preflight is a completed run, and a liveness check
keyed on "did a run happen" would call the last thirteen days healthy — which is exactly what a
scheduled job that runs and checks nothing looks like.

Four verdicts, kept apart for the reason [ADR 010](010-a-control-that-cannot-fail.md) gives:
`lit`, `dark` with reason `no-runs`, `dark` with reason `checks-not-executed`, and `unevaluable`
when the API cannot be read or step data is missing. A monitor that reports "I could not tell" as
"the tier stopped" manufactures an outage, and one that reports it as "lit" is the bug all over
again.

It gets **its own label and its own issue**. "The store is broken" and "we have not looked at the
store since the 15th" are different facts with different remedies, and issue #24 is what happens
when one channel carries both.

### The window is checked against the schedule

26 hours: four scheduled fires plus margin. `src/tests/unit/heartbeat-window.test.ts` parses the
cron out of `production-smoke.yml` and asserts the window spans at least two intervals (or the
alarm fires on every ordinary gap, and a channel that cries wolf is one people stop reading) and
at most six (or a stopped tier goes unnoticed for most of a day). It also asserts the window is
*not* an exact multiple, because a window of exactly four fires races the scheduler and alarms on
punctuality rather than absence — and that `control-audit.yml` runs at least as often as the
window, since the window bounds how stale the *answer* may be and the schedule bounds how stale
the *question* is.

A heartbeat whose window silently exceeds its own schedule is a control that cannot fire. That is
this repository's signature bug, and it must not be reintroduced by the fix for it.

### And the smoke run now says it in a sentence

`production-smoke.yml` writes `smoke-receipt.json` — which check reached which state, queryable —
and prints a leading verdict line above its summary table: *"⚠ 2 of 2 live checks did not
execute."*

A reader scanning three table rows of `skipped` sees three rows. A reader shown that sentence
sees the finding. Same data, and only one of them is read.

## Consequences

- **The probe's decision is a pure function, and its test uses real history.** `assessLiveness`
  takes runs and step conclusions and returns a verdict, so
  `src/tests/unit/smoke-liveness.test.ts` exercises it against verbatim API output from
  2026-08-28: real run IDs, real timestamps, the real step list of run 33120472571. A claim that
  this would have caught what everything else missed, tested against a fixture written for the
  purpose, would be the defect this repository has now recorded seven times — *a fixture written
  in your own vocabulary asserts only that you agree with yourself.*
- **The acceptance test is that it fires.** Against that real history the probe must return
  `dark` with reason `checks-not-executed` and a streak covering every fetched run. If it did
  not, it would be decoration and would not ship.
- **The heartbeat cannot detect its own death.** If `control-audit.yml` stops running, nothing
  says so. Recorded in `docs/controls.json` as `selfMonitoring: false` with the limit stated,
  rather than closed with a fourth watcher — [ADR 006](006-controls-must-fail-loudly.md)'s
  precedent, and the honest end of any monitoring chain. Somewhere the regress stops, and the
  useful thing is to say where.
- **This closes the loop [ADR 006](006-controls-must-fail-loudly.md) opened.** Its test was *"if
  the setup step never happens, does anything go red?"* The answer here was yes — the preflight
  went red, loudly, thirty-plus times. The question nobody had asked was the next one: *and while
  it is red, is anything still doing the work?*

Referenced by: `scripts/probe-smoke-liveness.mjs`, `scripts/lib/smoke-schedule.mjs`,
`.github/workflows/control-audit.yml`, `.github/workflows/production-smoke.yml`,
`src/tests/unit/smoke-liveness.test.ts`, `src/tests/unit/heartbeat-window.test.ts`.
