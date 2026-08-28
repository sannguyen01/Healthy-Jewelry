# 018 — A claim about a control is not a control

## Context

Six times this repository has shipped something that reported one thing and did another.
The records are already written; what has never been written is the sentence they share.

| ADR | The control | What it reported | What was true |
|---|---|---|---|
| 004 | The test suite | green | ran entirely against `mock.myshopify.com` while three commerce outages lived in the gap |
| 006 | `environment: production-readonly` | isolation | the environment self-creates empty, and the job still receives repository secrets |
| 010 | Two piped smoke steps | `success` | `tee` always succeeds; neither step could fail |
| 011 | The failure notification | 24 comments | one cause, said 24 times, in a channel people then mute |
| 015 | Five documents | `main` requires `verify` and `e2e` | `main` has never been protected, and those two strings are job IDs nothing publishes |
| 016 | `toBeVisible()`, `.click()`, a `scrollWidth` guard | pass | the MENU button's centre was outside the viewport on every phone |

The shape is one sentence: **the artefact that was supposed to provide confidence was
structurally incapable of producing it, and looked identical either way.** ADR 006 wrote that
down in 2026-08. ADR 010 called itself the third instance. ADR 015 called itself ADR 006 "one
level up". Each was correct, each was fixed in the one place it was found, and none of them
produced a way to ask the question again without a human doing the reading.

Two facts make that gap concrete rather than philosophical.

**The repair is more dangerous than the defect.** ADR 015 established that `main`'s required
contexts are `Lint · Type-check · Unit tests · Build` and `E2E tests (Playwright)`, not
`verify` and `e2e`. Requiring a context nothing publishes does not error — the pull request
waits forever on a check that will never arrive, with no message saying why. So the fix a
diligent person reaches for first, executed faithfully from the repository's own documentation,
bricks the repository permanently and silently. Writing the correct strings down does not solve
that; keeping them correct does, and prose cannot keep itself correct. A job renamed in
`ci.yml` turns every one of those paragraphs back into the trap it warns about, and nothing
would say so.

**And `main` is still unprotected today.** Verified 2026-08-28 against the GitHub API: every
branch, `main` included, returns `"protected": false`. ADR 015 recorded this on 2026-08-25 and
the state has not changed, because recording it was never going to change it.

## Decision

**A document may not assert that a control is configured unless a probe named in
`docs/controls.json` reads that configuration from its own source of truth and runs on its
own.** Prose is a claim. A probe is evidence.

Three parts, in the order they earn their keep:

**1. The anti-brick check.** `src/tests/unit/required-checks-contract.test.ts` parses
`ci.yml`, extracts the `name:` GitHub publishes for each job, and compares it against every
```required-checks fence in every markdown file in the repository — in both directions, in
the fast gate, in milliseconds. Rename a job and the suite fails until the documents follow.
The two strings a human will type into branch protection are now provably the two strings
GitHub reports today, which is what makes the documented repair safe to perform.

The fenced block is a convention rather than prose parsing on purpose:
[ADR 007](007-regex-guardrails-have-unknown-coverage.md) rules out guessing at grammar, and a
fence is exact. Its own coverage is asserted — the three documents that must carry one are
named, so the convention cannot quietly evaporate and leave a completeness check passing over
an empty set.

**2. The registry.** `docs/controls.json` holds one entry per control: what it claims, whether
it is configured, the probe that proves it, the workflow that runs the probe, whether it can
watch itself, and the human action still outstanding.
`src/tests/unit/control-registry.test.ts` enforces that an entry is checkable — the probe file
exists, the workflow it names *actually invokes it*, nothing claims `configured` without a
probe that runs automatically, and anything `not-configured` names the human action. The
wiring assertion is not hypothetical: `ci.yml` carried `fetch-depth: 0` with a comment
explaining that the credential auditor needed it, for a script invoked nowhere, for months.

Every ADR is classified as describing a control or recording a decision, with no third option
— the hole `--sage` fell through when it shipped as 9–13px text at 1.97:1 in four places
because nobody had ever decided what it was.

**3. The probe, and its four states.** `scripts/probe-branch-protection.mjs` asks GitHub, on a
six-hourly schedule in `.github/workflows/control-audit.yml`. GitHub answers "this branch has
no protection" with **404**, and a 404 handled as an error would turn *there is no gate at all*
into *the check could not run* — a monitoring script laundering its most important finding into
a shrug, which is ADR 006's failure reproduced inside the fix for it. So: `enforced`, `absent`,
`mismatched`, and `unevaluable` kept strictly apart, per
[ADR 010](010-a-control-that-cannot-fail.md)'s separation of a failure from a non-evaluation.

The probe reports and never blocks. Enabling protection is a console action, and a blocking
check on a state only a human can change is a permanent merge freeze — the ADR 008 trade,
unchanged.

## Consequences

- **`docs/controls.json` is JSON, not YAML.** This repo has no YAML parser dependency, so a
  YAML registry would need a hand-written one, and a hand-written parser that silently matches
  nothing is precisely the failure this registry exists to catch. A registry whose own reader
  could quietly return an empty set would be the joke writing itself. Every parser in this
  change reports what it found rather than only what matched, so its callers can assert the
  parse was complete instead of trusting it.
- **The registry can be wrong, and its test says so.** Writing this one, the wiring assertion
  immediately rejected an entry that named `scripts/lib/premise-checks.mjs` as the
  premise-detector probe: `production-smoke.yml` invokes `verify-production.mjs`, which
  *imports* that library and never names it. A probe named in a registry and called by no
  workflow does not run, and the entry was corrected to name what the workflow actually
  invokes. The check found a defect in the artefact it ships with, on its first execution.
- **The audit cannot audit itself.** If `control-audit.yml` stops running, nothing says so.
  Recorded as a known limit rather than closed with a fourth watcher — ADR 006's precedent,
  and the honest end of any monitoring chain.
- **Still not implemented here, and still the highest-value open item:** enabling branch
  protection on `main`. `main` auto-deploys to Vercel production, so the merge button is the
  deploy button with nothing in between. The registry's `humanAction` field carries the exact
  steps, and the audit will now report the gap every six hours instead of waiting to be
  rediscovered.

Referenced by: `docs/controls.json`, `.github/workflows/control-audit.yml`,
`scripts/probe-branch-protection.mjs`, `CONTRIBUTING.md`, `docs/testing-strategy.md`,
[ADR 015](015-a-gate-that-was-only-ever-documented.md).
