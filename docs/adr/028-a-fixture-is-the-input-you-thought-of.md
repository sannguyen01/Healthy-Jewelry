# 028 — A fixture is the input you thought of

## Context

[ADR 024](024-a-tool-never-pointed-at-a-known-answer.md) requires that a verification tool be
pointed at a known answer before it is admitted to `docs/controls.json`. That rule works. Three
probes were built in one week; the two that shipped with their decisions extracted as pure
functions and fixture tests around them shipped correct, and the one that shipped with neither
produced two defects.

It is not sufficient for one class of tool, and the 2026-08-31 parser work is the evidence.

`preflightArguments`, `conditions` and `pageRoutes` each read a real file, each had a
hand-written liveness anchor asserting the parse found *something*, and each passed every
fixture it had. Pointed at generated input for the first time, two of the three were wrong:

- **`preflightArguments` over-read past an un-continued newline.** `split(/\s+/)` treats `\n`
  like a space, so `node …preflight-secrets.mjs A B\necho done` returned five arguments —
  `echo` and `done` presented as secrets the preflight covers. Not a short list, which the
  liveness anchor would have caught. A *longer* one, which it cannot see. Downstream, that
  surfaces as a confusing failure in a test about credentials rather than as a parser bug.
- **`pageRoutes` did not know about route groups or parallel routes.**
  `(marketing)/deals/page.tsx` serves `/deals`; the walk emitted `/(marketing)/deals`, a string
  no browser requests. `sitemap-completeness` would have demanded that non-route be classified
  *and* never noticed the real `/deals` was missing — a false finding standing in for a true
  one. Neither convention is used in this repository today, which is exactly why it was
  invisible: the fixture set was the repository, and the repository had not tried it yet.

Both are the same failure, and it is not "insufficient tests". It is that **a fixture is, by
construction, an input somebody thought of.** For a tool whose input the author controls, that
is most of the space. For a tool that parses input the author does *not* control — a workflow
someone else reformats, a directory someone else creates — the interesting inputs are the ones
nobody had in mind, and a fixture suite cannot reach them by getting larger.

The credential classifier made the same point from the other side: fuzzed with generated
response shapes, it produced three crash paths before any reached production, against a track
record of finding the first three by incident.

## Decision

A **parser or classifier** — a total, pure function mapping input the author does not control
to a value another check depends on — needs, in addition to ADR 024's known-answer test, two
properties over generated input before it is relied upon:

1. **Equivalence.** Renderings a maintainer would call identical must parse identically.
   Re-indentation, line continuations, quote style, YAML block scalars, interleaved comments.
   This is the property that catches silent narrowing and silent widening, which are the
   failures no liveness anchor sees.
2. **Loud emptiness.** Input the reader genuinely cannot handle must yield *nothing*, never
   something plausible. Empty trips the consumer's liveness assertion; a wrong-but-non-empty
   answer is the one that passes.

Generators live in `src/tests/support/generate.ts` and are hand-rolled, matching the precedent
in `production-smoke-handles.test.ts`. Deliberately not randomised: randomness finds crashes,
and a crash here would be the good outcome — the failure this repository keeps shipping is a
check that quietly stops covering what it was written for.

## Scope, and why it is narrow

This applies to parsers and classifiers, **not to every verification tool.** A probe that reads
a GitHub API response into a four-way verdict is fully characterised by four fixtures, and
demanding generated input there would tax the case where a fixture genuinely is the whole
story. A rule that costs more than it returns is a rule people work around, and this repository
already has one channel it had to stop from being muted (ADR 011).

The test for whether this ADR applies: **can someone who is not you change the input?** If the
input is a file another contributor reformats, a directory another contributor creates, or a
response another service composes, the answer is yes.

## Consequences

- `src/tests/unit/parser-fuzz.test.ts` implements both properties for the three readers under
  `src/tests/support/parsers.ts`, and each property was mutation-checked: removing the
  behaviour it describes turns it red.
- This does not claim exhaustiveness, and per
  [ADR 007](007-regex-guardrails-have-unknown-coverage.md) it cannot. The generators cover the
  renderings someone thought of, one level up from the fixtures. That is a better place to
  stand, not a proof.
- The honest limit worth stating: this ADR was written *after* the tools it governs. Every rule
  here was learned from a defect rather than anticipated, which is the pattern ADR 024 already
  named and this one repeats one level higher.
