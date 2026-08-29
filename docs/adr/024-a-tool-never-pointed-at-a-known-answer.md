# 024 — A tool that has never been pointed at a known answer is a first draft

## Context

Three probes were built in one week. Their defect rates were not close to equal.

| Probe | Decision | Fixture test at ship | Defects |
|---|---|---|---|
| `probe-branch-protection.mjs` | pure `verdict()` | yes | none |
| `probe-smoke-liveness.mjs` | pure `assessLiveness()` | yes, against verbatim API output | none |
| `probe-assertion-liveness.mjs` | tangled with fs + subprocess | **none** | **two** |

The two defects were:

1. A sentinel named `webhook-signature-contract.test.ts` as the spec protecting the HMAC
   invariant. That file's only relevant assertion compares the header against the same function
   that produced it, so it protects the invariant not at all. The probe reported `dead` correctly;
   the finding was that the *sentinel* was wrong.
2. On a machine missing the pinned `chrome-headless-shell` build, every Playwright run fails at
   browser launch. The probe read those failures as "the mutation was caught" and reported two
   sentinels **alive, having measured nothing.** It printed the answer it wanted.

Both were found the same way: by pointing the tool at an answer that was already known and
noticing the disagreement. Neither would have survived one fixture-based test.

The pattern is not "write more tests". It is structural. A tool whose verdict cannot be evaluated
without mutating a file and running a suite has no known-answer test *available* to it, so the
question is never asked — not out of carelessness, but because asking it is expensive. The two
probes with pure decisions got asked for free.

There is a third, worse instance in the same family: `control-audit.yml` was invalid YAML and
never ran. The workflow was checked by two guardrails that searched it as text, and neither had
ever been shown a broken workflow to confirm it could tell the difference.

## Decision

**A verification tool may not be registered in `docs/controls.json` until a test has fed it a
fixture with a known answer and asserted the verdict.**

Enforced by `control-registry.test.ts`: every entry whose `probe` is a `scripts/*.mjs` must have a
test under `src/tests/unit/` that **imports it** — an import, not a mention, because the liveness
probe was named in a doc comment for a week while having no test at all.

Meeting the rule requires extracting the decision. `classifyProbeResult` is that extraction for
the mutation probe: given the anchor count, the baseline result and the mutated result, it returns
`alive`, `dead`, `unapplicable` or `unevaluable`, and nothing else. The extraction is the work;
the test is what proves it was real.

Fixtures should come from reality where reality is available. `smoke-liveness.test.ts` uses
verbatim Actions API output from run `33120472571` — real IDs, real timestamps, the real step
list. A fixture written to suit the tool asserts only that the author agrees with themselves,
which is a lesson `STATE.md` already records about Shopify tag fixtures.

## Consequences

- **Purity is a requirement, not a preference.** A probe that cannot be asked a question without
  side effects will not be asked one.
- **Four states, and only one indicts a test.** `dead` means an assertion has stopped carrying
  information. `unapplicable` and `unevaluable` are findings about the probe or the environment,
  and reporting either as `dead` is a false accusation against a test that may be perfectly alive.
- **The rule is retrospective.** It was written after the fact, and the first thing it did was
  fail: removing `probe-liveness-decision.test.ts` makes `control-registry.test.ts` reject the
  `assertion-liveness` entry by name — which is the state that actually shipped.
- **This is [ADR 006](006-controls-must-fail-loudly.md)'s question, asked of the asker.** ADR 020
  applied *"if the thing this protects broke, would anything go red?"* to assertions. This applies
  it to the tools that ask it.

Referenced by: `scripts/probe-assertion-liveness.mjs`,
`src/tests/unit/probe-liveness-decision.test.ts`, `src/tests/unit/control-registry.test.ts`,
[ADR 020](020-a-test-that-cannot-fail-is-documentation.md).
