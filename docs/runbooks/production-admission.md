# Runbook — production admission, and how its status is allowed to move

**Owner:** the repository owner (`sannguyen01`). **Workstream:** R-C of the incident recovery
(masterplan §13). **Control:** `production-admission` in `docs/controls.json`. **Status:**
`not-configured`. The check runs in CI, and Vercel does not wait for it yet.

On 2026-10-02 Vercel gave the production aliases to two READY builds from a `main` whose `verify`
had failed. A READY build only shows that the build finished. This runbook makes Vercel wait for
one GitHub check, `Production admission`, before it assigns production aliases. It also says what
evidence moves the control's status, and what never does. The reasoning is in
[ADR 039](../adr/039-a-ready-build-is-not-a-passing-build.md).

## What the check is

`Production admission` is the `production-admission` job in `.github/workflows/ci.yml`. It runs
after `verify`, `e2e` and `dependency-scope` under `always()`, so it runs and fails when they fail.

| Event | Admitted only when |
|---|---|
| `pull_request` | `verify`, `e2e` and `dependency-scope` are all `success` |
| push to `refs/heads/main` | `verify` and `e2e` are `success`, and `dependency-scope` is exactly `skipped` (it is PR-only) |
| anything else, including `merge_group` | never: no policy is defined |

The policy is `scripts/lib/production-admission.mjs`, tested exhaustively by
`src/tests/unit/production-admission.test.ts`. The ruleset keeps its three required contexts.
This fourth context is for Vercel only.

## Steps (owner, in Vercel's project settings)

1. **Confirm the baseline.** The project deploys from the GitHub integration, and production
   aliases (the apex and `www`) are assigned automatically to deployments of `main`. Record what
   you saw in the Evidence table.
2. **Wait until the check exists on a `main` commit.** That is the push run after the pull request
   that adds it merges. Vercel can only select a check it has seen. Its `Production admission` row
   should read `success`.
3. **Add a deployment check** on the GitHub check named exactly `Production admission`, set to
   block production alias assignment. The command-line equivalent lists as
   `vercel project checks --blocks deployment-alias`. Vercel reads the check on the
   **deployment's commit SHA**: the merge commit's own push run, not the pull request's head.
4. **Restrict Force Promote.** A person who can promote can bypass the check. Record who holds
   that right. It is a bypass, so it belongs in the same place as the ruleset's bypass list.
5. **Read it back.** List the project's checks that block alias assignment, and record the output
   in the table below. Its status becomes *configured, unproven*. It does not become *proven*.

## What moves the status, and what does not

| Evidence | Moves `productionPromotion` to |
|---|---|
| The CI job is green on a pull request and on `main`'s push run | nothing: the check exists, and nothing waits for it |
| Steps 3–5 done and read back | `configured-unproven` |
| A failing check on a **custom environment** keeps that environment's alias | still `configured-unproven`: a *configuration rehearsal*, not production |
| An owner-approved negative test on the **real production promotion path**: a candidate whose check fails does not get the production aliases, and the last good deployment keeps serving them | `proven` |

**Never manufacture a bad commit on `main` to run that negative test.** "Do not merge another
canary" takes precedence. If no safe path on the real promotion route exists, the status stays
*configured, unproven*, and that is the honest answer.

The check's own failing path is observed in a real run on a pull request where `verify` fails,
which is the next merge-gate canary. On a push to `main` it is unit-tested only.

## Stop and report, do not guess, when

- Vercel cannot associate the check with the deployment's commit SHA;
- the check is selectable under more than one source: the name must be unique across workflows,
  and a test enforces that for this repository;
- a production deployment takes the aliases while its commit's `Production admission` is not
  `success`. That is a failed control. Record it as one, never as a success.

## Evidence

Fill each row from what was observed, with the date and who observed it. An empty cell is the
honest state.

| Item | Observed | Date | Observer | Link |
|---|---|---|---|---|
| Git integration connected; automatic production aliasing on | | | | |
| `Production admission` `success` on a pull request run | | | | |
| `Production admission` `success` on `main`'s push run | | | | |
| Deployment check added, blocking production alias assignment | | | | |
| Who can Force Promote | | | | |
| Read-back of the project's alias-blocking checks | | | | |
| Negative test on the real promotion path (owner-approved), or "not run" | | | | |
