# Contributing

## Branch protection

Nothing lands on `main` directly — every change goes through a PR.

**`main` is not currently branch-protected and no status checks are required** — this
line claimed otherwise until 2026-08-25. CI still runs on every PR and its result is
the thing to read before merging; it is simply not enforced. See
`docs/testing-strategy.md` and `docs/adr/015-a-gate-that-was-only-ever-documented.md`.

To enable enforcement, the required contexts are exactly these two strings:

```required-checks
Lint · Type-check · Unit tests · Build
Dependency scope
E2E tests (Playwright)
```

Not `verify`/`e2e` — those are the job IDs in `ci.yml`, and GitHub publishes each check
run under the job's `name:`. Requiring a job ID registers a context nothing ever
reports, which does not error: it blocks every pull request permanently and silently.
The block above is machine-checked against `ci.yml` by
`src/tests/unit/required-checks-contract.test.ts`, so those strings are provably the
ones GitHub publishes today. Run `pnpm exec vitest run required-checks-contract` before
typing them in.

## Branch naming

Observed convention in this repo's history:

- `fix/<short-description>` — bug fixes (e.g. `fix/hero-visibility-gradient`)
- `chore/<short-description>` — tooling, config, dependency, cleanup work
- `docs/<short-description>` — documentation-only changes
- `claude/<project-slug>-<random-suffix>` — sessions driven by Claude Code
  (e.g. `claude/healthy-jewellery-e2e-strategy-bvx261`); the suffix is
  generated, not chosen — don't hand-craft one, just keep the prefix if a tool
  generates the branch for you.

## PR process

1. Branch off `main`.
2. Make the change. Follow the coding standards in `CLAUDE.md`.
3. Run the full local verification before opening the PR:
   ```
   pnpm lint && pnpm type-check && pnpm exec vitest run && pnpm build
   ```
   (This repo uses **pnpm**, not npm — `.github/PULL_REQUEST_TEMPLATE.md`'s
   checklist previously said `npm run …`; fixed to match. If you're editing
   the template, keep it in sync with this command.)
4. Open the PR — `.github/PULL_REQUEST_TEMPLATE.md` loads automatically.
   Fill in the Summary, check off the Type of Change, and complete the
   Checklist honestly. Don't check a box you didn't verify.
5. CI runs `verify` then `e2e` automatically. **Read both before merging** — they are
   not enforced, so nothing stops a red merge except you. This line read "Both must be
   green before merge" until 2026-08-28, eight lines below the paragraph correcting
   exactly that claim: PR #39 fixed four of the five documents ADR 015 named and
   reproduced the contradiction inside the fifth.
6. Squash or merge per the repo's configured merge methods (all three —
   merge/squash/rebase — are currently enabled; standard merge commits are
   the norm for this repo's history).

## What belongs in a single PR

This repo has a `maxFiles: 10` / one-fix-per-run convention from its loop
scaffold (`LOOP.md`, `gate.yaml`) — if a session's work naturally splits into
unrelated concerns (e.g. a visual fix and an unrelated security hardening
change), split it into separate PRs rather than bundling. See `STATE.md`'s
2026-07-28 note on the PR #4/#5 split for a worked example.

## Testing expectations

Full detail in `docs/testing-strategy.md`. In short: `vitest` coverage is
scoped to `src/lib`, `src/store`, `src/config` on purpose. **E2E is the only
automated coverage the UI layer has** — if you touch anything a user sees or
clicks, add or update a spec in `e2e/`, not just a component unit test.

## Documentation that must stay in sync

If your change affects any of the following, update it in the same PR — these
have drifted before and caused real confusion:

- `CLAUDE.md` — architecture, design tokens, site map, component directory
  listing
- `STATE.md` — anything that moves an item from pending to resolved, or
  surfaces a new gotcha
- `SHOPIFY_SETUP.md` / `docs/webhooks.md` / `docs/catalog-conventions.md` — any
  change to Shopify integration behavior
- `CHANGELOG.md` — append an entry; don't rewrite history
