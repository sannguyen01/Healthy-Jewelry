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
