# Runbook — the `main` ruleset, and the read-only proof that it holds

**Owner:** the repository owner (`sannguyen01`). **Workstream:** WS-C. **Status:** the gate is **proven, once**. Ruleset 24077858 read back conclusive at 05:00 UTC on 2026-10-03. At 07:56 UTC the v2 canary #98 read **`denied`**, attributable to the failing `verify` context, and was closed unmerged. Canary #94 (2026-10-02) read **NOT-DENIED** and was merged; that stays recorded as a failed experiment. Details are in Evidence. The repair, the read-back's conclusive conditions and the v2 canary design are in masterplan §13 (R-B).

`main` auto-deploys to production. Until this runbook was carried out, the merge button was the
deploy button with no required check between them. `docs/controls.json`'s `merge-gate` entry is
the authority on whether it still holds. This document is the exact configuration, the commands that apply it, the
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

**A ruleset already exists, so repair it rather than adding a second one.** Ruleset `Main`
(24077858) read back on 2026-10-03 with one `deletion` rule, a target of `~ALL`,
`~DEFAULT_BRANCH` and `refs/heads/main`, and Integration 1236702 on its bypass list (Evidence).

1. **Identify Integration 1236702 first** (Settings → Rules → the ruleset → Bypass list names
   it), and record what it is and what uses it. Removing its bypass is the owner's decision once
   that is known; the gate needs the list empty. It is the bypass **actor**. Integration 15368 in
   the JSON above is the check **source**. They answer different questions: never substitute one
   for the other, and verify each rather than copying it.
2. **Narrow the target to `main` before adding the pull-request rule.** On `~ALL`, a
   pull-request rule blocks every direct push to every branch, agents' working branches
   included.
3. **`PUT` replaces the whole ruleset.** Every rule, condition and bypass entry not in the file
   is removed. It is a full-policy replacement, not an append, so compare before applying:

   | | Before (read 2026-10-03) | After (the JSON above) |
   |---|---|---|
   | Enforcement | `active` | `active` |
   | Target | `~ALL`, `~DEFAULT_BRANCH`, `refs/heads/main` | `refs/heads/main` |
   | Rules | `deletion` | `deletion`, `non_fast_forward`, `pull_request` (0 approvals), `required_status_checks` (the three contexts from integration 15368, strict) |
   | Bypass | Integration 1236702, `always` | none |
   | Name | `Main` | `main — merge gate` |

   Then apply it, and read it back at once (Step 2):

```sh
gh api --method PUT repos/sannguyen01/healthy-jewelry/rulesets/24077858 --input ruleset.json
```

Console equivalent: **GitHub → Settings → Rules → Rulesets → New branch ruleset.** Name as
above; enforcement *Active*; bypass list *empty*; target `main`; tick *Restrict deletions*,
*Block force pushes*, *Require a pull request before merging* (0 approvals, code-owner review
off), *Require status checks to pass* with *Require branches to be up to date* and the three
contexts, each sourced from *GitHub Actions*.

Do **not** also create a classic branch-protection rule. The probe reads both and judges their
union, but two mechanisms stating one policy is two places for it to drift.

## Step 2 — read it back, with a credential nobody types

**No canary runs until this read is conclusive.** The owner reporting that the ruleset was
edited is not a read. #94 ran on a report, and was merged.

GitHub omits `bypass_actors` from a ruleset read by a credential without enough access, so the
read needs one it will show them to. It must come from a mechanism that keeps it out of the
command line, the shell history, chat, issues and files. Either:

- **in CI:** run *Actions → Control audit → Run workflow*. Its probe step uses the
  `CONTROL_AUDIT_TOKEN` repository secret (a token with `administration:read`) and prints the
  verdict in the job summary; or
- **locally, from the owner's own login:** the GitHub CLI hands over its stored credential
  without it being typed:

  ```sh
  GITHUB_TOKEN="$(gh auth token)" node scripts/probe-branch-protection.mjs --json
  ```

  An agent session reads the same rules through its own GitHub proxy (`gh api
  repos/sannguyen01/healthy-jewelry/rulesets/24077858`). That is how the 2026-10-03 reading
  below was taken.

**What to read: all of it.** One ruleset object is not the protection on `main`.

| Layer | Read from | Conclusive when |
|---|---|---|
| Every ruleset | `rulesets?includes_parents=true`, then `rulesets/{id}` for each | every ruleset that reaches `main` is listed and read in full, and none but the repaired one adds a rule or a bypass |
| Target | `rulesets/{id}` → `conditions.ref_name.include` and `exclude` | `refs/heads/main` only. `rules/branches/main` cannot show that `~ALL` was narrowed |
| Effective rules | `rules/branches/main`, each rule attributed by its `ruleset_id` | every rule comes from a ruleset read above |
| Contexts | the `required_status_checks` rule | exactly the three, each with `integration_id` 15368 (GitHub Actions). The probe checks the names, and a person confirms the source |
| Strict | the same rule's `strict_required_status_checks_policy` | `true` |
| Pull request | a `pull_request` rule | present, zero approvals |
| Force push, deletion | the `non_fast_forward` and `deletion` rules | both present |
| Bypass list | `rulesets/{id}` → `bypass_actors`, for every ruleset that reaches `main` | **returned, and empty**. Not returned is `unevaluable`, never "empty" |
| Classic protection | `branches/main` → `protection` (a summary), and `branches/main/protection` (the full rule) | the summary reads `enabled: false`, **and** the owner's recorded Settings → Branches inspection shows no classic rule, because the full endpoint answers 403 from the agent session. A 403 is not absence |

**Anything unread keeps the verdict `unevaluable`**, unless a recorded owner inspection closes
that exact gap: the evidence record says who looked, at what, and when.
`evaluateProtection()` and the probe judge the readings they are given. Their output is attached
beside the raw readings, never instead of them, and a verdict never stands in for a reading that
was not taken.

With every row conclusive, the probe reads `"verdict": "enforced"` and `"agrees": false`: the
registry still says `not-configured`. Fill the evidence record below. Then, in a pull request,
set `merge-gate`'s `status` to `configured` in `docs/controls.json`. That control claims the
configuration, and this read is what proves it. The next audit reads `agrees: true` and closes
the `merge-gate-unenforced` issue. Whether GitHub *refuses* a failing pull request is a separate
claim, `merge-denial-proof`, and only Step 3 proves it.

A workflow token cannot see a ruleset's bypass list, so the scheduled audit will read
`unevaluable` unless `CONTROL_AUDIT_TOKEN` is set. That is deliberate: "not shown" is not
"empty".

## Step 3 — the canary: proof of denial, read-only

**Never press merge on the canary. Never enable auto-merge on it.** If the ruleset is wrong,
merging it deploys a known-bad commit to production — the failure this whole runbook exists
to prevent, performed as its test. GitHub already computes whether the merge would be allowed;
the proof is reading that.

An agent may carry out steps 3a–3d only with the owner's explicit permission to push the canary
branch, and only **after** Step 2's evidence record is filled with every row conclusive. A canary
pushed before that reads `NOT-DENIED` by definition and proves nothing. #94 was pushed on a
report rather than a read, and was merged.

**The v2 design, since 2026-10-03.** #94's canary was `expect(1).toBe(2)`, which failed
everywhere, so its merge turned `main` red. Now:
- The failure lives in `src/tests/unit/merge-gate-canary.test.ts`. It fails only when
  `GITHUB_HEAD_REF` (a pull request's source branch) names a canary branch.
- The canary changes nothing but one dated line in `docs/runbooks/merge-gate-canary-log.md`.
- If it is mistakenly merged, that test will not intentionally fail on `main`'s push. That is
  the only safety claim. Other checks can still fail, and a canary is never merged.

1. **3a.** From an up-to-date `main`, create `canary/merge-gate-$(date -u +%F)` (add `-2`, `-3`
   for another run that day). Make one commit that appends one line to
   `docs/runbooks/merge-gate-canary-log.md`: the date, the branch, and why it was run. No other
   file, no credential, no customer data.
2. **3b.** Push it and open a pull request titled `CANARY — DO NOT MERGE`, **ready for review,
   not draft, no auto-merge**. Wait until `Lint · Type-check · Unit tests · Build` has concluded
   `failure`. The failing test must be `the merge-gate canary`, and nothing else. Expect:
   - `Dependency scope`: success. It fails only on an unjustified major dependency bump, and the
     canary bumps nothing.
   - `E2E tests (Playwright)`: **skipped**, because it `needs: verify`.
   - `Production admission`: **failure**, `REFUSED (pull_request)`. This is the first real run
     of its failing path; record that run.

   GitHub counts a skipped required check as satisfied, so the denial rests on `verify` alone,
   and the evidence record says so.
3. **3c.** Read the verdict — from any checkout of `main`; the probe is there since `be34099`:

   ```sh
   GITHUB_TOKEN="$(gh auth token)" node scripts/probe-merge-denial.mjs --pr <number> --observer <your name> --out canary-evidence.json
   ```

   Exit 0 and `"verdict": "denied"` is the proof. Since 2026-09-27 it is only produced when all
   of these hold, each read separately:

   - `mergeable_state` is `blocked` and a required context has not passed on the head commit;
   - the pull request is **not a draft** (`draft: false`) — GitHub reported a draft PR as
     `clean`, so the state alone cannot rule this out;
   - it has **no conflicts** (`mergeable: true`);
   - it is **not behind** `main` (`behind_by: 0` from comparing the two) — strict mode blocks
     that on its own;
   - the **test merge commit** does not disagree with the head about any required context.
     GitHub may evaluate either; if they disagree the answer is `unevaluable /
     head-merge-attribution-disagrees`, and the pull request's checks tab and merge box are
     compared by hand before anything is recorded.

   **Whatever the verdict, record the readings and close it unmerged at once.** Exit 1,
   `NOT-DENIED`, means the merge button works on a failing pull request: read
   `probe-branch-protection.mjs`'s findings next. Closing destroys no evidence: the readings are recorded,
   and the PR can be reopened. Leaving a red PR open with a working merge button is how #94 was
   merged. Exit 2 is `unevaluable`: read
   `reason`. `precondition-unknown:*` and `mergeability-not-computed` usually mean "re-run in a
   minute"; `draft`, `conflicts` and `behind-base` mean the canary is not testing what it should
   — fix the canary, never the verdict.
4. **3d.** Close the pull request **without merging**; the owner deletes the branch. Fill the
   canary evidence record below; every field comes from `canary-evidence.json` and the check
   runs. Only a conclusive `denied`, attributable to the failing check, moves `githubGate`
   (masterplan §6) to `proven`. It does **not** move `merge-denial-proof` to `configured`: that
   registry status means a probe runs on its own, and this one is run by hand, with the owner's
   permission, from this runbook (`control-registry.test.ts`, ADR 006). The proof is recorded
   in that entry's `acceptedWhy`. Until 2026-10-03 this step said the opposite.

## Evidence

Filled in only when the action has happened, in words, with a date and who observed it. An
empty cell is the honest state.

Each transition also gets one record in these shapes, copied below the table and filled from the
readings. `null` means *not read*, which is different from `false` or `[]`. While any field a
verdict depends on is `null`, that verdict is `unevaluable`: `bypassListReadable: false` keeps
`bypassActors: null`, and the read cannot be conclusive. Names and IDs only, never a credential.

The read-back (Step 2):

```json
{
  "control": "githubGate",
  "verdict": null,
  "observedAt": null,
  "observer": null,
  "rulesets": [{ "id": null, "updatedAt": null, "enforcement": null, "include": null, "exclude": null }],
  "effectiveRuleSources": null,
  "effectiveContexts": null,
  "contextIntegrationIds": null,
  "contextSourceVerified": null,
  "strict": null,
  "pullRequestRequired": null,
  "nonFastForward": null,
  "deletion": null,
  "bypassListReadable": null,
  "bypassActors": null,
  "classicSummaryEnabled": null,
  "classicFullReadable": null,
  "classicOwnerInspection": null,
  "judgeOutput": null,
  "canaryVerdict": "not-run"
}
```

Filled, 2026-10-03 03:49 UTC, after the owner's ruleset update:

```json
{
  "control": "githubGate",
  "verdict": "unevaluable",
  "observedAt": "2026-10-03T03:49:22Z",
  "observer": "agent session (read-only, GitHub proxy)",
  "rulesets": [
    {
      "id": 24077858,
      "updatedAt": "2026-10-03T10:48:12.661+07:00",
      "enforcement": "active",
      "include": [
        "~DEFAULT_BRANCH",
        "refs/heads/main"
      ],
      "exclude": []
    }
  ],
  "effectiveRuleSources": {
    "deletion": 24077858,
    "non_fast_forward": 24077858
  },
  "effectiveContexts": [],
  "contextIntegrationIds": [],
  "contextSourceVerified": false,
  "strict": false,
  "pullRequestRequired": false,
  "nonFastForward": true,
  "deletion": true,
  "bypassListReadable": true,
  "bypassActors": [],
  "classicSummaryEnabled": false,
  "classicFullReadable": false,
  "classicOwnerInspection": null,
  "judgeOutput": [
    "contexts-mismatch:unevaluable",
    "not-strict:unevaluable",
    "no-pull-request-required:unevaluable",
    "code-owner-review-off:informational"
  ],
  "canaryVerdict": "not-run"
}
```

Filled, 2026-10-03 04:54 UTC, after the second update (a context nothing publishes):

```json
{
  "control": "githubGate",
  "verdict": "mismatched",
  "observedAt": "2026-10-03T04:54:07Z",
  "observer": "agent session (read-only, GitHub proxy)",
  "rulesets": [
    {
      "id": 24077858,
      "updatedAt": "2026-10-03T11:48:48.774+07:00",
      "enforcement": "active",
      "include": [
        "refs/heads/main"
      ],
      "exclude": []
    }
  ],
  "effectiveContexts": [
    "Github Actions"
  ],
  "contextIntegrationIds": [
    null
  ],
  "contextSourceVerified": false,
  "strict": true,
  "pullRequestRequired": false,
  "nonFastForward": true,
  "deletion": true,
  "bypassListReadable": true,
  "bypassActors": [],
  "classicSummaryEnabled": false,
  "classicFullReadable": false,
  "classicOwnerInspection": null,
  "judgeOutput": [
    "contexts-mismatch:blocking",
    "no-pull-request-required:unevaluable",
    "code-owner-review-off:informational"
  ],
  "canaryVerdict": "not-run"
}
```

Filled, 2026-10-03 05:00 UTC, after the third update. **Conclusive:**

```json
{
  "control": "githubGate",
  "verdict": "configured-unproven",
  "observedAt": "2026-10-03T05:00:17Z",
  "observer": "agent session (read-only, GitHub proxy); owner (classic layer and 1236702)",
  "rulesets": [
    {
      "id": 24077858,
      "updatedAt": "2026-10-03T11:59:37.881+07:00",
      "enforcement": "active",
      "include": [
        "refs/heads/main"
      ],
      "exclude": []
    }
  ],
  "effectiveRuleSources": {
    "deletion": 24077858,
    "non_fast_forward": 24077858,
    "required_status_checks": 24077858,
    "pull_request": 24077858
  },
  "effectiveContexts": [
    "Lint · Type-check · Unit tests · Build",
    "Dependency scope",
    "E2E tests (Playwright)"
  ],
  "contextIntegrationIds": [
    15368,
    15368,
    15368
  ],
  "contextSourceVerified": true,
  "strict": true,
  "pullRequestRequired": true,
  "nonFastForward": true,
  "deletion": true,
  "bypassListReadable": true,
  "bypassActors": [],
  "classicSummaryEnabled": false,
  "classicFullReadable": false,
  "classicOwnerInspection": "owner, 2026-10-03: Settings → Branches lists no classic rule",
  "removedBypassActor": "Integration 1236702 = the Claude GitHub App (owner, 2026-10-03)",
  "judgeOutput": [
    "verdict: enforced",
    "code-owner-review-off:informational"
  ],
  "canaryVerdict": "not-run"
}
```

The canary (Step 3):

```json
{
  "control": "merge-denial-proof",
  "branch": null,
  "pullRequest": null,
  "headSha": null,
  "testMergeSha": null,
  "baseSha": null,
  "checkRuns": [{ "name": null, "id": null, "sha": null, "conclusion": null }],
  "draft": null,
  "mergeable": null,
  "mergeableState": null,
  "behindBy": null,
  "productionAdmission": { "runId": null, "conclusion": null, "line": null },
  "verdict": null,
  "reason": null,
  "closedUnmerged": null,
  "closedAt": null,
  "observer": null
}
```

Filled, 2026-10-03 07:56 UTC, from #98. **`denied`, closed unmerged:**

```json
{
  "control": "merge-denial-proof",
  "branch": "canary/merge-gate-2026-10-03",
  "pullRequest": 98,
  "headSha": "a7a0b363449956945b17f4f4ecf748be5c3ee476",
  "testMergeSha": "9b316639908bfbcc201684faea55f7f946ac6d0d",
  "baseSha": "ddaac1cd833d7702eacd0cb5a183fb76bee74f31",
  "ruleset": { "id": 24077858, "updatedAt": "2026-10-03T11:59:37.881+07:00", "bypassActors": [] },
  "requiredContexts": ["Lint · Type-check · Unit tests · Build", "Dependency scope", "E2E tests (Playwright)"],
  "checkRuns": [
    { "name": "Lint · Type-check · Unit tests · Build", "id": 111159838517, "sha": "a7a0b36", "conclusion": "failure" },
    { "name": "Dependency scope", "id": 111159838414, "sha": "a7a0b36", "conclusion": "success" },
    { "name": "E2E tests (Playwright)", "id": 111160106015, "sha": "a7a0b36", "conclusion": "skipped" },
    { "name": "Production admission", "id": 111160105504, "sha": "a7a0b36", "conclusion": "failure" },
    { "name": "Lint · Type-check · Unit tests · Build", "id": 111135193995, "sha": "ddaac1c", "conclusion": "success" },
    { "name": "E2E tests (Playwright)", "id": 111135599556, "sha": "ddaac1c", "conclusion": "success" },
    { "name": "Dependency scope", "id": 111135195153, "sha": "ddaac1c", "conclusion": "skipped" },
    { "name": "Production admission", "id": 111136315373, "sha": "ddaac1c", "conclusion": "success" }
  ],
  "testMergeChecks": "none reported: the pull_request run checks out refs/pull/98/merge and reports against the head",
  "failingTests": ["the merge-gate canary > is not running in a canary pull request"],
  "unitTotals": { "failed": 1, "passed": 3474 },
  "draft": false,
  "mergeable": true,
  "mergeableState": "blocked",
  "mergeableStateReads": ["07:56:00Z blocked", "07:56:23Z blocked"],
  "behindBy": 0,
  "strict": true,
  "productionAdmission": {
    "runId": 37107871838,
    "conclusion": "failure",
    "line": "REFUSED (pull_request): pull_request: verify: got failure, needs success; e2e: got skipped, needs success"
  },
  "verdict": "denied",
  "reason": "required-context-unmet",
  "closedUnmerged": true,
  "closedAt": "2026-10-03T07:56:27Z",
  "mainAfterClose": "ddaac1c",
  "observer": "agent session (read-only reads; pushed and closed the canary with the owner's permission)",
  "method": "judgeDenial() and evidenceRecord() from scripts/lib/merge-denial.mjs, called directly on readings taken through the session's GitHub proxy. The probe's own token path is not usable from this session. No merge was attempted"
}
```

What this proves, and what it does not:
- **Proved:** at 07:56 UTC, under ruleset 24077858 as updated at 04:59:37 UTC, GitHub refused a
  ready-for-review pull request that had no conflicts and was not behind its base, because
  its required `verify` context had failed. Nobody pressed Merge. The same ruleset read #97
  `clean` that morning, with its required checks passing, so the block follows the failing check,
  not the ruleset as a whole.
- **Not proved:**
  - that it still holds after the ruleset next changes: re-run Step 3 when `updatedAt` moves;
  - `merge_group`: no merge queue, so untested;
  - the refusal message a person sees: the read cannot merge by construction.
- **Attribution limit.** GitHub records the close as the owner's account. This session's GitHub
  connector acts with the owner's credential, so GitHub's actor field cannot tell the two apart.
  The session's own tool record is what says the agent closed it, and that it never called a
  merge endpoint.

| Step | Observed (what, in words) | Date | By | Evidence (verdict, run, PR) |
|---|---|---|---|---|
| Contexts confirmed by `required-checks-contract` | | | | |
| Ruleset created (id) | the owner reported it created and read back; the id could not be read from the agent session | 2026-10-02 | owner (reported) | none readable: the session's token answered 401, and anonymous reads were rate-limited |
| `probe-branch-protection.mjs` read back `enforced` | **Not enforced.** On 2026-10-02 the read was `unevaluable` (401, then an anonymous rate limit). On 2026-10-03 the session's GitHub proxy read the rules, and the probe's own `evaluateProtection()` judged them `mismatched`. Ruleset `Main` (24077858) is `active`, targeting `~ALL`, `~DEFAULT_BRANCH` and `refs/heads/main`. Its only rule is `deletion`, with no required checks, no pull-request rule and no force-push block. Its bypass list holds Integration 1236702 (`always`). Classic protection and the ruleset's history answered 403 | 2026-10-02, 2026-10-03 | agent session | `verdict: mismatched`: contexts missing, not strict, no PR required, bypass actor present |
| Ruleset updated by the owner, read back in full | **Not conclusive.** At 03:48:12 UTC the owner narrowed the target to `~DEFAULT_BRANCH` and `refs/heads/main` (`~ALL` removed), emptied the bypass list (Integration 1236702 gone; what it was is still to be recorded), and added `non_fast_forward` beside `deletion`. The 03:49 read found only that one ruleset reaching `main`, and **no `pull_request` and no `required_status_checks` rule**. Classic summary `enabled: false`; full endpoint 403, so the owner's inspection is still owed. The owner then chose to merge #97 as a recorded override (masterplan §6), not under exception 2. The record follows the table | 2026-10-03 | owner (update); agent session (read) | `evaluateProtection`: `unevaluable`, with `contexts-mismatch`, `not-strict` and `no-pull-request-required` |
| Second and third updates, read back in full | **04:48:** strict required checks, but on one context, `Github Actions`, which nothing publishes; #97 read `blocked`; judge `mismatched`. **04:59:** the three real contexts from integration 15368, strict, and a `pull_request` rule. **05:00 read: conclusive.** The owner recorded no classic rule (Settings → Branches) and identified 1236702 as the Claude GitHub App. Records above | 2026-10-03 | owner (updates, classic inspection); agent session (reads) | judge `enforced`; `githubGate` → `configured-unproven` |
| `docs/controls.json` `merge-gate` set to `configured` | set in the records pull request that follows #98, on the 05:00 conclusive read-back and the 07:56 `denied`. Its accepted-gap fields go, and its `knownLimit` says what the six-hourly probe can and cannot see without `CONTROL_AUDIT_TOKEN` | 2026-10-03 | agent session (record); owner (merge) | the records pull request |
| Canary PR opened, ready for review, `verify` failed (PR number) | opened ready for review from `main` at `726dfc3`. `verify` failed, `Dependency scope` passed, E2E was skipped (`needs: verify`) | 2026-10-02 | agent session | #94, head `81099f6` |
| `probe-merge-denial.mjs` verdict `denied` — head SHA, merge commit SHA, ruleset ID | **NOT denied.** GitHub read `mergeable_state: unstable` twice: the merge button worked on a failing PR. `judgeDenial()` on those readings gave `NOT-DENIED / mergeable-with-unmet-required-context` against the runbook's contexts, and `unevaluable / rules-unreadable` against what the session could read. The readings came through the GitHub connector, because the probe's own token was refused. Merge commit SHA and ruleset ID were not readable | 2026-10-02 | agent session | #94 comment with the readings; canary left open for diagnosis, then merged (next row) |
| Required-context states (head and merge commit), `draft`, `mergeable`, `behind_by` | head: verify failing, Dependency scope passing, E2E skipped. `draft: false`. No conflicts: `unstable` is not `dirty`. `behind_by: 0` | 2026-10-02 | agent session | #94 |
| Canary closed unmerged, branch deleted | **No: the canary was merged.** It was left open for diagnosis after the NOT-DENIED reading, then merged at 16:15:34 UTC from the owner's account as merge commit `ebdebc0`. No agent merged it. The merge is the strongest possible evidence that the gate did not hold: a pull request whose required check had failed went into `main`. That put the failing test on `main` (CI red, production unaffected: tests are not shipped). #93 was merged a minute later (`be34099`) at a head that did not yet remove it, so `main` stayed red; the follow-up pull request that removes it (#95) carries this record. The branch `canary/merge-gate-2026-10-02` was **not deleted** and still exists at `81099f6`. The ruleset's `~ALL` deletion rule covered it until 03:48 UTC on 2026-10-03; since then the ruleset targets `main` only, and the branch is the owner's to delete | 2026-10-02 | GitHub (merges by `sannguyen01`); agent session (record) | #94 merged as `ebdebc0`; #93 merged as `be34099`; removal in #95; branch still present |
| v2 canary opened, ready for review, from `main` at `ddaac1c` | `canary/merge-gate-2026-10-03`, one dated line in `docs/runbooks/merge-gate-canary-log.md`, auto-merge off. Locally, under the canary's environment, exactly one test failed: the canary case | 2026-10-03 07:53:47 UTC | agent session, with the owner's permission | #98, head `a7a0b36` |
| v2 canary checks, PR run 37107871838 | `verify` **failure**, one test: the canary case, whose message names the branch. That shows directly that `GITHUB_HEAD_REF` reached the runner. 1 failed, 3,474 passed. E2E **skipped** (`needs: verify`). `Dependency scope` **success**. `Production admission` **failure**: `REFUSED (pull_request)`, the admission check's first failing path in a real run (matrix row 2) | 2026-10-03 | agent session (job logs) | check runs 111159838517, 111160106015, 111159838414, 111160105504 |
| v2 canary verdict | **`denied` / `required-context-unmet`**, on `verify` alone. `draft: false`, `mergeable: true`, `mergeable_state: blocked` (read twice, 07:56:00 and 07:56:23), `behind_by: 0`, strict. The test-merge commit `9b31663` reported no checks, so head and test-merge do not disagree. On the base `ddaac1c`, `verify` and E2E succeeded and `Dependency scope` was skipped, as on every push: the failure is the canary's own, not inherited. Record above | 2026-10-03 | agent session (judge run on read-only readings) | `githubGate` → `proven` |
| v2 canary closed unmerged | closed at 07:56:27 UTC, `merged: false`, `merged_at: null`; `main` still `ddaac1c`. Its Vercel deployment was a Preview, and the newest Production deployment is still `ddaac1c`'s (05:15:03 UTC). The branch is the owner's to delete | 2026-10-03 | agent session (close); GitHub records the owner's account (attribution limit above) | #98 |
