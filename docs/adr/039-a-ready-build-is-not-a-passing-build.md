# ADR 039 — A ready build is not a passing build

**Date**: 2026-10-03
**Status**: Accepted. The repository half is implemented. The platform half is `not-configured`
(`production-admission` in `docs/controls.json`).
**Supersedes**: nothing. Applies [ADR 027](027-governance-and-execution-are-different-questions.md)
and [ADR 018](018-a-claim-about-a-control-is-not-a-control.md) to the deployment boundary.

## Context

On 2026-10-02 the merge-gate canary, #94, carried one deliberately failing unit test. `verify`
failed on it, as designed, and the end-to-end job was skipped because it needs `verify`. Then:

- **The merge boundary did not stop it.** #94 was merged into `main` (`ebdebc0`), and #93 a minute
  later (`be34099`). The ruleset that existed held only a deletion rule (masterplan §13).
- **The deployment boundary did not stop it either.** Vercel built READY Production deployments
  from both commits and gave them the apex and `www` aliases. The platform's build command does
  not run the unit suite, so the build had no way to know.

Detection worked: `verify` was red on every run that included the test. Two admission
boundaries ignored that result. This ADR is about the second boundary. Fixing the ruleset
(R-B) narrows the way a red commit reaches `main`. It does not make the deployment platform read
CI, and a red commit can still reach `main` through a bypass, a misconfigured rule, or a direct
push by someone with rights.

Three facts shaped the decision:

1. **GitHub reports a skipped job as a success** to anything that asks whether checks passed.
   The canary's E2E was skipped. The same rule that lets a ruleset treat it as satisfied would
   let a deployment check treat it as passed.
2. **The three CI contexts do not mean the same thing on every event.** On a push to `main`,
   `Dependency scope` is skipped by design, because it reads a pull request description and a
   push has none. A deployment check listing the three would either wait for a context that
   never runs on a push, or rest on a "success" that means "did not run".
3. **The platform can wait for a GitHub check before assigning production aliases.** Its
   deployment checks block production alias assignment until the named checks pass on the
   deployment's commit.

## Decision

1. **One verdict, `Production admission`, passes only on explicit success.** A `ci.yml` job runs
   `scripts/check-production-admission.mjs`, whose policy (`scripts/lib/production-admission.mjs`)
   is exhaustive:
   - on `pull_request`, all three jobs must be `success`;
   - on a push to `refs/heads/main`, `verify` and `e2e` must be `success` and `dependency-scope`
     must be exactly `skipped`;
   - any other event or ref is refused, `merge_group` included, until a policy for it is written
     and tested.

   A missing, empty or unrecognised result is `missing`, and `missing` never passes.
2. **The job runs under `always()`.** Under the default `success()` it would be skipped when
   `verify` failed, and a skipped check is the exact reading it exists to refuse. It names its
   status function, as ADR 027 requires. That makes the job *eligible* to run after failed or
   skipped prerequisites, and nothing more. A cancelled run, a workflow that never triggers, a
   runner failure, or a missing or colliding check name can each leave no verdict at all. Each
   is a separate observation, and none is a refusal this job reported. (Corrected 2026-10-03 at
   the owner's review; the first text said a cancelled run "is therefore refused".)
3. **It is not a required context in the ruleset**, which keeps its three. On a pull request it
   passes only when the three already have, so requiring it adds nothing. It is refused on
   `merge_group` by design, so a queue would stall on it. `required-checks-contract.test.ts` still
   forces every CI job to be classified: a merge context, or a context another control declares.
4. **It is dependency-free.** It runs no install, so the dependency change it judges cannot break
   it.
5. **It judges its own run only.** A merge commit on `main` has its own SHA, push run and verdict,
   whatever the pull request showed. The deployment platform reads the check on the deployment's
   commit SHA, which is that same commit.
6. **Its status moves only on evidence.** It is `not-configured` until the owner adds the
   platform's deployment check. After that it is *configured, unproven*. It becomes *proven*
   only through an owner-approved negative test on the real promotion path that keeps the last
   good deployment on the aliases. A failing check on a custom environment is a configuration
   rehearsal, not proof for production. No bad commit is ever manufactured on `main` to test it.

## Consequences

- **The incident replays as a refusal.** Both of its runs are fixtures:
  - #94's pull request run: verify `failure`, e2e `skipped`;
  - `main`'s push run: verify `failure`, e2e `skipped`, scope `skipped`.
- **The check name is unique across every workflow.** A deployment check matches on the name, so
  a second job publishing it would let either satisfy it. A test enforces the uniqueness.
- **The `production-admission-explicit-success` sentinel** mutates the verdict to "admit unless
  something failed", GitHub's own reading of a skipped check, and the exhaustive matrix goes red.
- **What it cannot do is stated, not implied** (`knownLimit`):
  - Force Promote bypasses it;
  - it holds the custom production domains, not the deployment's own URL;
  - its failing path on a push to `main` is unit-tested, not observed.

  Its failing path in a real run is observed on a pull request where `verify` fails: the next
  canary.
- **The platform settings are owner actions** (`docs/runbooks/production-admission.md`). Nothing in
  this repository can make the platform wait.
