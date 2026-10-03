# Merge-gate canary log

A merge-gate canary pull request changes **one line in this file and nothing else**. It adds one
dated line below. The failure the canary needs comes from
`src/tests/unit/merge-gate-canary.test.ts`. That test fails only when the pull request's source
branch is named `canary/merge-gate-YYYY-MM-DD` (optionally with a `-suffix`), so the line itself
cannot alter a workflow, a ruleset or a required context.

If a canary pull request is mistakenly merged, that test will not intentionally fail on `main`'s
push. That is the only safety claim made here. Other checks can still fail, and a canary is never
merged: it is read with `scripts/probe-merge-denial.mjs` and closed unmerged whatever the verdict
(`docs/runbooks/main-ruleset.md`, step 3).

One line per canary: the date, the branch, and why it was run.

<!-- canary lines below -->
