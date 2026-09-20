# 033 — A premise that expired mid-decommission

## Context

`scripts/preflight-secrets.mjs` has three states. One of them, `not-configured` — *every*
smoke secret absent — exits 0, files no issue, and skips both live checks. Its own comment
gives the reason, and the reason was good:

> Nobody has done the setup yet, which is a known fact rather than news, and filing an issue
> about it every six hours trains the reader to mute the one channel that will later carry a
> real outage.

That is [ADR 011](011-repeated-identical-failures-must-escalate.md) applied correctly. An
alarm about a greenfield is noise, and noise is how a channel dies.

It rests on a premise: **all-secrets-absent means nobody has configured this yet.**

On 2026-09-19 that premise stopped being true, and the observation is on the record either
side of it.

| Run | Time (UTC) | Conclusion | `Live store and storefront` | `Webhook signing secret` |
|---|---|---|---|---|
| #154 | 15:35 | failure | **failure** (executed) | **failure** (executed) |
| #155 | 20:14 | **success** | **skipped** | **skipped** |

Between those two runs the five secrets in the `production-readonly` GitHub Environment were
emptied. Run #154 proves they were present. Run #155 proves they were not. Nothing in the
repository changed: both ran on `7d512cb`-era `main`, and #155 completed in sixteen seconds
reporting green.

So the same observation — no secrets — now carries two opposite meanings:

- **Never configured.** A greenfield. Not news. File nothing.
- **De-configured.** Somebody removed them, minutes ago, on purpose or by accident. The most
  urgent news this tier can produce.

A decommission is precisely the operation that removes credentials deliberately, so the
second meaning is not an edge case here. It is the expected traffic for the next several
weeks.

### The backstop existed and was 26 hours slow

`probe-smoke-liveness.mjs` is the dead-man's switch for exactly this
([ADR 022](022-absence-needs-its-own-alarm.md)), and it did not miss. It was simply asking a
different question. `assessLiveness` returned `lit` when *any* run inside a 26-hour window had
executed the required steps, and at the 20:47 control audit run #154 was still inside that
window. The verdict was correct by its own definition.

The window is not the defect — it is deliberately four scheduled slots plus margin, so one
delayed run cannot raise an alarm. The defect is that a *level* check was being asked to
report a *transition*. "Has anything looked recently?" and "did it just stop?" are different
questions, and the second one has an answer the first throws away: the ordering of the runs.

## Decision

**`assessLiveness` gains a fourth verdict, `stopped`**, returned when the newest run in the
window did not execute the required steps and an earlier run in the window did.

It is kept rigidly apart from `dark` for the same reason `dark` is kept apart from
`unevaluable` — the remedies differ, and a verdict that merges two remedies sends the reader
to the wrong place:

| Verdict | What it means | What to do |
|---|---|---|
| `lit` | the newest run looked | nothing |
| `stopped` | it looked, then it did not, and we can date the change | find what changed *just now* — usually secrets removed or rescoped |
| `dark` | nothing has looked for the whole window | find out why nothing has looked for a long time |
| `unevaluable` | this probe could not read the history | fix the probe, conclude nothing about the tier |

`stopped` names the last executing run in its summary, so the issue arrives with a date
rather than with an adjective.

`ALARMING_VERDICTS = ['dark', 'stopped']` is exported and drives the exit code.
`control-audit.yml` already gates its reporting step on this script's exit status and pastes
its output into the issue body, so **the wiring is the array and nothing else** — no YAML
change, and none of the inline-script budget
[ADR 030](030-an-equivalence-relation-is-the-control.md) exists to hold down.

`unevaluable` stays out of the set. An API this probe could not reach is a failure of the
probe, never a finding about the tier ([ADR 010](010-a-control-that-cannot-fail.md)), and the
newest run's step data being unreadable must therefore never read as a stop.

**`preflight-secrets.mjs` is left alone.** It is a dependency-free script running before any
network call, with no history to consult; teaching it to ask the Actions API whether this
environment used to work would give it a token, an egress dependency and a new failure mode,
to answer a question the liveness probe already has all the data for. The premise is repaired
where the evidence lives, not where the assumption was written.

## Consequences

- A de-configuration is reported within **one scheduled run** instead of after the 26-hour
  window clears. For the six-hourly control audit that is at most six hours, and typically
  much less.
- One existing test changed verdict, and the change is a finding rather than a cost.
  `'one good run in the window is enough — this is a liveness check, not a pass rate'` built
  its fixture newest-first with index 1 lit and index 0 dark — *the good run came first and
  then the checks stopped*. That is the 2026-09-19 shape, not the "failed once and recovered"
  case its comment claimed. Both readings passed only because the function was order-blind.
  The fixture is unchanged and now asserts `stopped`; the recovery claim it meant to make has
  its own test, with the newest run as the executing one.
- Eight new assertions, each shown to fail against a deliberate mutation: disabling the
  branch (4 fail), treating unknown step data as a stop (1 fail), and dropping `stopped` from
  the alarming set (1 fail). [ADR 020](020-a-test-that-cannot-fail-is-documentation.md).
- The fixtures are verbatim Actions API output for runs #154 and #155, read on 2026-09-20 —
  not written from memory. [ADR 028](028-a-fixture-is-the-input-you-thought-of.md) is the
  reason: a fixture in your own vocabulary asserts only that you agree with yourself.
- **This ADR does not close issue #24, and does not restore the secrets.** Both are console
  actions. What it changes is that the next removal announces itself.
- `probe-ci-liveness.mjs` shares `scripts/lib/liveness.mjs` and is deliberately untouched.
  The shared arithmetic — `didExecute`, `darkStreak` — is unchanged; only this probe's
  verdict *shaping* moved, which is the split that extraction was designed to allow.
