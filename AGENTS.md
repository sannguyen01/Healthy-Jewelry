# AGENTS.md

## Verify commands

This repo is **pnpm-only** — there is no `package-lock.json`, only `pnpm-lock.yaml`.
`npm run …` will not reflect real project state.

```bash
pnpm lint          # next lint
pnpm type-check    # tsc --noEmit
pnpm exec vitest run
pnpm build         # next build
pnpm e2e           # playwright test (builds and serves production output)
```

`pnpm lint && pnpm type-check && pnpm exec vitest run && pnpm build` is what CI's
`verify` job runs, and it is the merge gate. Full detail in
[`docs/testing-strategy.md`](docs/testing-strategy.md).

## Loop conventions

- Report-only (L1) before enabling auto-fix (L2)
- See [LOOP.md](LOOP.md) for cadence and human gates, and
  [`loop-constraints.md`](loop-constraints.md) for binding rules

## Actions no agent takes

Whatever a test, a plan, a runbook or a green check says is next, no agent:

- **merges** a pull request, enables auto-merge, or pushes to `main` — `main` auto-deploys to
  production, so a merge is a release;
- **changes a merge or deployment control**: the ruleset or its bypass list, a deployment check,
  or who may promote. Nor does an agent promote, redeploy or roll back a deployment. Each one
  moves the boundary that decides what reaches production (incident PR-94, masterplan §13);
- **revokes, rotates or deletes a credential**, or removes an environment variable;
- **changes DNS** or a domain's assignment, redirect or certificate;
- **deletes a webhook subscription**, an app, a channel or any record held by the commerce
  platform;
- **approves a claim** — whether a document supports a statement about metal and skin is a
  named reviewer's judgement (`src/content/claims/`), never an inference from a passing test.

Each of these is either irreversible or a decision about the truth of something a visitor is
told. An agent's part is to know what state the system is in, show the evidence for that
belief, prepare the step with its read-only checks first, and stop. The runbooks under
`docs/runbooks/` say which human acts at each step; the state machine in
`docs/commerce-elimination-masterplan.md` §6 says which observation each step needs first.
