# 023 — The last link is a person

## Context

[ADR 022](022-absence-needs-its-own-alarm.md) closed with a concession:

> **The heartbeat cannot detect its own death.** If `control-audit.yml` stops running, nothing
> says so. Recorded as a known limit rather than closed with a fourth watcher — ADR 006's
> precedent, and the honest end of any monitoring chain. Somewhere the regress stops, and the
> useful thing is to say where.

That was written on 2026-08-28. It was true immediately, in the strongest possible sense:
**`control-audit.yml` was invalid YAML from the commit that created it and never ran once.**

Two JavaScript string literals inside `github-script` blocks carried a real newline where `'\n'`
was intended, ending the YAML block scalar mid-expression. GitHub rejects such a file before
scheduling anything, so each run appeared with `conclusion: failure` and **zero jobs** — no log,
no step summary, no annotation. Three entries in `docs/controls.json` named it as `probeRunsIn`,
two of them `status: "configured"`. Two guardrails passed over it, because both read the file as
text and a text search cannot tell a valid document from a broken one.

Nothing in this repository noticed. A person reading the Actions tab did, four hours after the
merge.

So the concession was not a footnote. It was the load-bearing fact, and leaving it as prose meant
the bottom rung could break on arrival with nothing to catch it — which is exactly what happened.

## Decision

**Every control names what catches its own failure, and following that chain must reach a
person.**

`docs/controls.json` gains a `backstop:` field with exactly two forms:

- `control:<id>` — another entry in the registry.
- `human:<cadence>` — the floor.

`control-registry.test.ts` walks the chain from every control and fails if it cycles, runs out, or
names a cadence nobody could keep. Two controls backstopping each other is not a chain, it is a
loop where each link is "covered" by something itself covered by nothing — and that is precisely
how a tier watched by nothing can look, from the inside, like a tier that is watched.

The floor is `docs/weekly-verification.md`: four checks, five minutes, once a week, **regardless
of what any dashboard says** — because the premise is that the dashboards may be lying. Two of the
four cannot be automated away by construction, since they ask whether the automation ran at all:

1. Does the newest `control-audit` run have **at least one job**? Zero means it did not parse and
   nothing in it executed.
2. Does the newest `production-smoke` run show `Live store and storefront: success`? `skipped`
   means the run happened and checked nothing.

## Consequences

- **The regress terminates by rule, not by exhaustion.** Previous ADRs stopped adding tiers when
  the next one seemed like too much; this one states where stopping is correct and makes the
  registry refuse to pretend otherwise.
- **A cadence with no checklist is an intention.** The test asserts `docs/weekly-verification.md`
  exists, so `human:weekly` cannot point at nothing.
- **The floor is not a promise.** A person may skip a week; that is the nature of a floor and the
  reason there are four tiers above it. What it removes is the situation this ADR exists because
  of — a tier that is dead and nothing anywhere is even *supposed* to notice.
- **An external monitor would be a lower rung, and is not built here.** A third-party uptime ping
  is outside GitHub and outside Vercel and would catch what a human week misses. It needs an
  account and a person to configure it, so it is named in the weekly checklist's own "what this is
  not" section rather than claimed.

Referenced by: `docs/controls.json`, `docs/weekly-verification.md`,
`src/tests/unit/control-registry.test.ts`, [ADR 022](022-absence-needs-its-own-alarm.md).
