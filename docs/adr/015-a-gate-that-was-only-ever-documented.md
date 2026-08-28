# 015 — A gate that was only ever documented

## Context

`main` is not branch-protected. Verified against the GitHub API: every branch in this
repository, `main` included, returns `"protected": false`. There are no required status checks
and, on the available evidence, there never have been.

Five places say otherwise:

- `docs/testing-strategy.md` § Branch protection — *"`main` requires both `verify` and `e2e` to
  pass. This is the part that makes the rest stick."*
- `CONTRIBUTING.md` — *"`main` requires the `verify` and `e2e` CI checks to pass."*
- `docs/safety.md` — auto-merge is safe *"once `verify` and `e2e` — both required checks on
  `main` — go green."*
- `loop-constraints.md` — *"`main` is branch-protected and requires `verify` + `e2e` to pass."*
- `.github/workflows/production-smoke.yml`'s header — *"Branch protection requires `verify` and
  `e2e`; it must never require this one."*

`docs/testing-strategy.md` contradicts itself eight lines apart. Line 7 says *"The repository
enforces no required status checks today, so a red suite has never blocked a merge either"* —
which is true — and line 280 says the opposite.

The merge record agrees with line 7. PRs #34–#37 were squash-merged by hand with
`E2E tests (Playwright)` red. #34 is unambiguous: the job concluded `failure` at 11:36:38Z and
the PR merged at 11:41:15Z, 4m37s later. #35, #36 and #37 merged while the job was still
`in_progress`. Required checks forbid both. Auto-merge cannot explain it either — auto-merge
merges *after* checks settle green.

Two things make this worse than a stale document.

**The safety argument depends on it.** `docs/safety.md` and `loop-constraints.md` both permit
GitHub auto-merge on human-opened PRs *on the grounds that* the gate decides the change is
safe. That reasoning has no gate under it. The permission is real; the justification is not.

**And the obvious remedy is booby-trapped.** `verify` and `e2e` are the *job IDs* in
`ci.yml`. GitHub publishes a check run under the job's `name:`, so the contexts it actually
reports are `Lint · Type-check · Unit tests · Build` and `E2E tests (Playwright)`. Typing the
documented strings into the required-checks box would register two contexts that nothing ever
reports: every PR blocked forever, and the E2E result still never gating anything. The fix
everyone would reach for first is the one that bricks the repository.

## Decision

A gate this repository claims must be verifiable from this repository. Until protection is
configured, the documents say it is not configured, and record what enabling it requires:

- **Required contexts, exactly**:

  ```required-checks
  Lint · Type-check · Unit tests · Build
  E2E tests (Playwright)
  ```

  Not `verify`, not `e2e`. As of 2026-08-28 that block is machine-checked against `ci.yml`
  by `src/tests/unit/required-checks-contract.test.ts` — see
  [ADR 018](018-a-claim-about-a-control-is-not-a-control.md), which generalises this
  record's finding from this one gate to every control the repository claims to have.
- **A promotion gate is sequenced after a merge gate, not before it.** Gating deploys while
  anyone can merge anything to `main` at any time is theatre: `main` auto-deploys to Vercel
  production with nothing in between, so the merge button *is* the deploy button.
- `vercel.json` joins `gate.yaml`'s denylist. It holds `buildCommand` and is the natural home
  for any future deploy gate, and it was the one file in that neighbourhood an unattended loop
  could rewrite — `.vercel/**`, `.github/workflows/**` and `next.config.ts` were all covered
  while it was not.

## Consequences

This is ADR 006's shape one level up. ADR 006 said a control that depends on manual setup must
fail loudly without it, because *"the control announces protection it is not providing, which
is worse than having no control — a green run is read as evidence."* There the control existed
and its setup was unverified. Here the control does not exist and five documents assert it
does, which is the same failure with nothing underneath it at all.

ADR 006's test — *"if the setup step never happens, does anything go red?"* — is answered
honestly for the first time: nothing does, and nothing ever did.

**Not implemented in this change.** Enabling branch protection is a GitHub console action, and
`production-smoke.yml`'s false comment sits in `.github/workflows/**`, which
`loop-constraints.md` marks escalate-not-edit. Both are named here for a human, which is what
ADR 012 established this file type is for: *"This ADR is the escalation `loop-constraints.md`
itself asks for."*

The suite is green as of 2026-08-25 (412 passed, 8 skipped, 0 failed), so enabling protection
would not freeze anything — which is the one precondition the old `testing-strategy.md`
paragraph got right: *"enabling it was only reasonable once a passing run existed to enforce
against."* That run now exists.
