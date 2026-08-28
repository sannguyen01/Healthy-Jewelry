# 020 — A test that cannot fail is documentation

## Context

`e2e/contact.spec.ts` asserted that submitting the contact form produced `{ success: true }`
and a success message. PR #32 had deleted that contract 17 days earlier — an unconfigured
mailer now returns 503 rather than fabricating success, because `{ success: true }` used to
mean "the form worked" while the message was silently dropped.

The spec kept passing for those 17 days. Not by luck: the E2E environment has no
`RESEND_API_KEY`, so the route had *always* been the thing under test only incidentally, and
the assertions still found a page that looked right. The signal was green and carried no
information about the success path at all.

Coverage tooling would have reported those lines covered the entire time, because the spec
executed them. Execution is not the property that matters. The property that matters is
**discrimination**: does this test distinguish a working success path from a broken one?

Nothing in this repository could answer that, and the same gap has been paid for repeatedly
under other names — a suite running entirely against a mock ([ADR 004](004-static-fallback-is-not-a-data-source.md)),
two piped steps that could not report failure ([ADR 010](010-a-control-that-cannot-fail.md)),
three checks structurally blind to a control cut off at the viewport edge
([ADR 016](016-fit-is-a-measurement-nobody-took.md)). Each is the same sentence: *the artefact
that was supposed to provide confidence was structurally incapable of producing it, and looked
identical either way.*

### The obvious detector does not work

The natural forcing function is to compare each spec's modification date against the route it
exercises, and flag the stale ones. That was measured against this suite before being rejected:

- `e2e/shop.spec.ts` (2026-08-02) is 24 days behind `globals.css` (2026-08-26) and is healthy.
- `contact.spec.ts` was **newer** than `src/app/api/contact/route.ts` for most of its fossil
  period.

Timestamps produce noise exactly where information is needed. They measure when someone last
typed in a file, and fossilisation is not about typing.

## Decision

Three tiers, weakest but cheapest first. The first two are structural and run in the fast gate;
the third is the one that actually answers the question, and it cannot be answered by reading
source at all.

**1. Anchor resolution.** `src/tests/unit/spec-anchor-contract.test.ts` resolves every
`page.goto(...)` in `e2e/**` from the AST and requires each to reach a real route. Playwright
will happily navigate to a 404, and assertions phrased as "a heading is visible" or "the status
is not 500" both pass on the error page — which is how a spec keeps reporting green after the
thing it tested is gone.

The resolver handles string literals, template heads, module constants, and loop variables both
destructured and accessed by property, because half the `goto` calls in this suite are one of
those. It reports what it could **not** resolve, and the test asserts that set is empty: a scan
that silently skips what it does not understand has unknown coverage, which is
[ADR 007](007-regex-guardrails-have-unknown-coverage.md)'s whole subject. A literal-only regex
would have covered a third of the suite and reported success.

**2. A coverage manifest.** Every route in `src/app/**` must be visited by a spec or listed in
`e2e/COVERAGE.md` with the layer that covers it instead. `vitest` coverage is scoped to
`src/lib`, `src/store` and `src/config` on purpose, so **E2E is the only automated coverage the
UI layer has**: a route no spec visits is not thinly covered, it is uncovered.

Three were. `/faq`, `/legal` and `/stores` had zero automated coverage of any kind, and nothing
anywhere said so. They are in `legal-pages.spec.ts`'s table now — shallow assertions, renders
without a 500 and has a heading, which is most of what can be wrong with a `PageHeader` and a
body of copy.

**3. Assertion liveness.** `scripts/probe-assertion-liveness.mjs` breaks one invariant at a
time and checks that the tests protecting it go red. Twelve sentinels, declared in
`scripts/lib/sentinels.mjs`, each naming the file to mutate, the mutation, the specs that must
fail, and **the place this repository already paid for that invariant** — so the set is a
regression list rather than a sample.

A sentinel whose mutation leaves the suite green is a dead assertion: the code is exercised and
nothing depends on the result.

This is ADR 006's own question — *"if the setup step never happens, does anything go red?"* —
asked of an assertion rather than a control, and asked by a machine rather than by whoever
happens to be reading. That distinction is the entire point. ADR 006 asked it once, in 2026-08,
about one workflow. ADR 010 asked it again about a different one. ADR 015 asked it a third time
about branch protection. Each answer was correct and each was a one-off, because a question
answered by reading is a question that gets asked once.

## Consequences

- **The probe refuses to run on a dirty working tree.** It edits tracked files and restores
  them in a `finally` and on SIGINT/SIGTERM, but a crash mid-run over uncommitted work would be
  unrecoverable. A tool that can destroy more than the bug it looks for is not worth having.
- **Three outcomes, not two.** `alive`, `dead`, and `unapplicable` — a sentinel whose anchor
  text no longer occurs exactly once in its file. That is a real finding (a check that cannot
  run is not a check) but a *different* one, and reporting it as "green under mutation" would be
  a false accusation against a test that may be perfectly alive. Same separation as
  [ADR 010](010-a-control-that-cannot-fail.md)'s, one layer up.
- **A mutation that breaks the build counts as caught.** For the Playwright sentinels, `pnpm
  build` failing is something going red, which is what the probe asks.
- **It runs weekly, not in the merge gate.** Twelve mutations, each a full test run and two of
  them a production build, is minutes. This is a health report, not a permission — the same
  trade [ADR 008](008-decisions-need-premise-detectors.md) made for premise drift.
- **The sentinel set is the deliverable, and it will rot.** Anchors are exact strings; a
  refactor moves them. That is why `unapplicable` is loud rather than skipped, and why each
  sentinel carries its scar: the next person deciding whether to fix or delete one needs to know
  what it was bought with.

Referenced by: `scripts/lib/sentinels.mjs`, `scripts/probe-assertion-liveness.mjs`,
`src/tests/unit/spec-anchor-contract.test.ts`, `src/lib/analysis/specAnchors.ts`,
`e2e/COVERAGE.md`, `.github/workflows/control-audit.yml`.
