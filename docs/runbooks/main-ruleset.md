# Runbook — the `main` ruleset, and the read-only proof that it holds

**Owner:** the repository owner (`sannguyen01`). **Workstream:** WS-C. **Status:** not yet run.

`main` auto-deploys to production. Until this runbook is carried out, the merge button is the
deploy button with no required check between them (`docs/controls.json`, `merge-gate`:
`not-configured`). This document is the exact configuration, the commands that apply it, the
command that reads it back, and the procedure that proves GitHub refuses a bad pull request —
**without anyone pressing merge**.

## The decision this encodes: identity separation

Agents working on this repository act through the owner's GitHub identity. That has two
consequences, and they set what can actually be enforced:

1. **"Agents may not bypass" cannot be written as a bypass list.** GitHub cannot tell an agent
   from the owner, so any bypass granted to the owner is granted to every agent. The only
   bypass list that separates them is the empty one.
2. **Required code-owner review deadlocks a one-maintainer repository.** GitHub does not let
   the author of a pull request approve it, so with one human reviewer every pull request
   would wait forever.

So the enforceable set is:

| Property | Setting | Why |
|---|---|---|
| Required contexts | exactly the three below | what CI publishes; a context nothing reports blocks every PR forever (ADR 015) |
| Strict | on (`strict_required_status_checks_policy`) | two PRs green on their own can merge into a red `main` |
| Pull request required | on, zero approvals | no direct push to the deploy branch; zero because the only human is the author |
| Bypass actors | **none** | the owner is the agents; a bypass for one is a bypass for all |
| Force push, deletion | blocked | history on the deploy branch is the audit trail |
| Code-owner review | **off**, until a second human reviewer exists | on today, it deadlocks; `.github/CODEOWNERS` still requests the review |
| Agent policy | never call a merge endpoint | the one rule no setting can enforce; `probe-merge-denial.mjs` is read-only by construction |

`scripts/probe-branch-protection.mjs` holds GitHub to the first five on every scheduled
control audit, and reports code-owner review as information only.

**Strict mode, not a merge queue.** `ci.yml` answers `merge_group`, so a queue would not stall,
but `Dependency scope` skips in a merge group — it reads the pull request's description, which a
queue run does not carry — and GitHub counts a skipped required check as passing. The same pull
request's own run has already judged the same diff, so the skip is safe today; it is not
re-read if the description changes after that run. Revisit before enabling a queue.

## The three contexts

These are the check-run names `ci.yml` publishes — never the job IDs `verify` and `e2e`.
`required-checks-contract.test.ts` reads this block and fails if it drifts from the workflow or
from `docs/controls.json`.

```required-checks
Lint · Type-check · Unit tests · Build
Dependency scope
E2E tests (Playwright)
```

## Step 1 — confirm the strings, then create the ruleset

Run the contract test first; it proves the three strings are what GitHub publishes today.

```sh
pnpm exec vitest run required-checks-contract main-ruleset-runbook
gh api /apps/github-actions --jq .id     # expect 15368: the integration_id below
```

`integration_id` pins each context to GitHub Actions, so a commit status posted by anything
else under the same name cannot satisfy it. If the command above prints a different id, use
that id in every entry.

Save as `ruleset.json` (this block is read by `main-ruleset-runbook.test.ts`, which holds it to
the registry and to the probe's enforceable set):

```json ruleset
{
  "name": "main — merge gate",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Lint · Type-check · Unit tests · Build", "integration_id": 15368 },
          { "context": "Dependency scope", "integration_id": 15368 },
          { "context": "E2E tests (Playwright)", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

```sh
gh api --method POST repos/sannguyen01/healthy-jewelry/rulesets --input ruleset.json
```

Console equivalent: **GitHub → Settings → Rules → Rulesets → New branch ruleset.** Name as
above; enforcement *Active*; bypass list *empty*; target `main`; tick *Restrict deletions*,
*Block force pushes*, *Require a pull request before merging* (0 approvals, code-owner review
off), *Require status checks to pass* with *Require branches to be up to date* and the three
contexts, each sourced from *GitHub Actions*.

Do **not** also create a classic branch-protection rule. The probe reads both and judges their
union, but two mechanisms stating one policy is two places for it to drift.

## Step 2 — read it back

```sh
GITHUB_TOKEN=<a token with administration:read> node scripts/probe-branch-protection.mjs --json
```

Expected: `"verdict": "enforced"` and `"agrees": false` — the registry still says
`not-configured`, and the probe says so. Then set `merge-gate`'s `status` to `configured` in
`docs/controls.json` in a pull request; the next audit reads `agrees: true` and closes the
`merge-gate-unenforced` issue.

A workflow token cannot see a ruleset's bypass list, so the scheduled audit will read
`unevaluable` unless `CONTROL_AUDIT_TOKEN` is set. That is deliberate: "not shown" is not
"empty".

## Step 3 — the canary: proof of denial, read-only

**Never press merge on the canary. Never enable auto-merge on it.** If the ruleset is wrong,
merging it deploys a known-bad commit to production — the failure this whole runbook exists
to prevent, performed as its test. GitHub already computes whether the merge would be allowed;
the proof is reading that.

An agent may carry out steps 3a–3c only with the owner's explicit permission to push the canary
branch.

1. **3a.** From an up-to-date `main`, create `canary/merge-gate-<yyyy-mm-dd>` with one commit
   that fails a required check and changes nothing else — for example a unit test asserting
   `expect(1).toBe(2)` in `src/tests/unit/zz-merge-gate-canary.test.ts`.
2. **3b.** Push it and open a pull request titled `CANARY — do not merge`, **ready for review,
   not draft** (a draft is blocked for being a draft, which proves nothing about the checks).
   Wait until `Lint · Type-check · Unit tests · Build` has concluded `failure`.
3. **3c.** Read the verdict:

   ```sh
   GITHUB_TOKEN=<token> node scripts/probe-merge-denial.mjs --pr <number> --out canary-evidence.json
   ```

   Exit 0 and `"verdict": "denied"` is the proof: `mergeable_state` is `blocked` and a required
   context has not passed. Exit 1, `NOT-DENIED`, means the merge button works on a failing pull
   request — stop, do not merge, and read `probe-branch-protection.mjs`'s findings. Exit 2 is
   `unevaluable`: re-run after a minute (GitHub computes mergeability lazily), or read `reason`.
4. **3d.** Close the pull request **without merging** and delete the branch. Record the
   evidence below.

## Evidence

Filled in only when the action has happened, in words, with a date and who observed it. An
empty cell is the honest state.

| Step | Observed (what, in words) | Date | By | Evidence (verdict, run, PR) |
|---|---|---|---|---|
| Contexts confirmed by `required-checks-contract` | | | | |
| Ruleset created (id) | | | | |
| `probe-branch-protection.mjs` read back `enforced` | | | | |
| `docs/controls.json` `merge-gate` set to `configured` | | | | |
| Canary PR opened, required check failed | | | | |
| `probe-merge-denial.mjs` verdict `denied` (head SHA) | | | | |
| Canary closed unmerged, branch deleted | | | | |
