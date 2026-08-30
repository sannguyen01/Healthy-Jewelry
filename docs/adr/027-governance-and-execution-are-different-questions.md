# 027 — Governance and execution are different questions

## Context

GitHub Actions ANDs `success()` onto any step or job `if:` that names no status function.
This is not documented at the point of use and there is no warning — the condition simply
means more than it says.

`production-smoke.yml` gated every live check on `if: steps.preflight.outputs.configured ==
'true'`. Written as a question about *configuration*, evaluated as a question about
configuration **and execution**. The preflight failed on a wrong credential, the implicit
`success()` went false, and thirteen checks reported `skipped` for fourteen days — twelve
of which never read that credential. #46 fixed it by gating each check on the capability it
needs ([ADR 026](026-a-capability-is-not-a-verdict.md)).

That fix was found while investigating a different symptom, and finding one instance by
accident does not retire a class. An audit of every `if:` in the four workflows turned up a
second, still live, in the workflow built to audit the other controls:

```yaml
- name: Report a dark verification tier
  if: steps.smoke-liveness.outcome == 'failure'
```

Read plainly: *report when the tier is dark.* Read as GitHub evaluates it: *report when the
tier is dark **and nothing above me failed**.* It worked — for a reason written nowhere near
it. Every preceding step in that job sets `continue-on-error: true`, which keeps the job
green, which keeps the implicit `success()` true. The alarm's correctness was held by a
setting on a *different step*, unmentioned at the condition, and load-bearing by accident.

Removing one `continue-on-error` — an edit that reads like tightening a control, since it
makes a dead assertion fail the audit — would have silently disabled the alarm that reports
dark alarms. [ADR 022](022-absence-needs-its-own-alarm.md) one level up: the thing watching
for silence goes silent, and nothing is left to notice.

The same shape had already appeared twice more in this repository, in different syntax:

- **[ADR 010](010-a-control-that-cannot-fail.md).** `node script.mjs | tee out.log` under
  `bash -e` reports `tee`'s exit status. The step asks "did the script pass?" and evaluates
  "did the last command in the pipe pass?"
- **The lockfile outage of 2026-08-29.** `pnpm install --frozen-lockfile` failed, so eleven
  downstream checks reported `skipped` — including the whole E2E job. From outside, a
  skipped check is indistinguishable from a passing one.

Three mechanisms, one defect: **a control whose answer silently depends on a question
nobody asked it.**

## Decision

**An `if:` that reads another step's or job's result must name its own status function.**

`always() && …` for a step that reports on failure, `failure() && …` for one that only runs
after a failure, `success() && …` where the coupling is genuinely wanted. The rule is not
"always use `always()`" — it is that the execution condition must be *stated*, because a
stated coupling can be reviewed and an implicit one cannot.

Enforced by `src/tests/unit/workflow-condition-contract.test.ts`, which parses every
workflow with the `yaml` package and flags any condition referencing
`steps.*`/`needs.*` `.outcome`, `.conclusion`, `.outputs` or `.result` without a status
function. Parsed, not grepped: a regex over `if:` lines has unknown coverage
([ADR 007](007-regex-guardrails-have-unknown-coverage.md)) and would miss job-level
conditions and block scalars.

Conditions that genuinely want the implicit `success()` — the Playwright cache-hit pair in
`ci.yml` — are enumerated in an allowlist with a reason each, and a second assertion fails
when an allowlist entry no longer matches any condition in its workflow. There is no third
state between classified and unverified
([ADR 019](019-an-unclassified-entry-is-an-unverified-one.md)), and a stale exemption is
indistinguishable from a live one.

## Consequences

A condition now costs one more token to write and says what it means. The allowlist is the
pressure valve: an exemption is available, and taking it requires writing down why, which
is the difference between a decision and an oversight.

The rule is narrow on purpose. It fires only on conditions that *read another step's
result* — the case where the implicit `success()` answers a different question than the one
asked. `if: github.event_name == 'push'` is untouched, because there the implicit coupling
is neither surprising nor load-bearing.

This does not make `continue-on-error` unnecessary in `control-audit.yml`. That setting
still does its own job — a dead assertion is a health finding, not a reason to fail an audit
carrying other results. What changes is that the alarm no longer *depends* on it. Two
mechanisms that happened to be entangled are now separate, which is the whole decision:
governance and execution are different questions, and a control should not answer one while
appearing to answer the other.
