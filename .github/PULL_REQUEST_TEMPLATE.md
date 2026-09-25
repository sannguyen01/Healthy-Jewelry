## Summary

<!-- Briefly describe what this PR does and why -->

## Type of Change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `chore` — dependency, config, or tooling change
- [ ] `docs` — documentation only
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `perf` — performance improvement

## Related Issue

Closes #<!-- issue number -->

## Commerce boundary

This site takes no orders, and that is enforced rather than described —
`COMMERCE-ELIMINATION-CONTRACT.md` is parsed on every run of this gate.

- [ ] **None** — touches nothing the contract governs
- [ ] **Register** — closes or adds a row in `docs/commerce-dependency-register.md`
- [ ] **Contract** — changes a rule, a position class, or the route inventory

**If Contract:** a change that *weakens* the contract must say here which capability it
re-permits and who approved that. Deleting a row from §3 or §7 silently re-permits a
capability and the diff that does it looks like tidying — which is the whole reason the file
is parsed instead of read.

**If Register:** a row is finished by **deleting** it. A spent row fails the build
(`register-row-is-spent`), and a new commerce reference with no row fails too
(`unregistered-commerce-reference`). Both directions, deliberately.

## Checklist

- [ ] `pnpm lint` passes locally
- [ ] `pnpm type-check` passes locally
- [ ] `pnpm exec vitest run` passes locally
- [ ] `pnpm verify:commerce-contract` reports no blocking findings
- [ ] New utility functions have unit tests in `src/tests/unit/`
- [ ] No hardcoded hex colour values (use `--hj-*` tokens)
- [ ] Product data comes from `src/lib/catalog`, never from a raw record import
      ([ADR 034](../docs/adr/034-the-catalogue-is-the-source.md))
- [ ] All copy matches the brand identity and PROHIBITED list in `CLAUDE.md`
- [ ] `generateMetadata()` present on any new page component
- [ ] No `.env` secrets committed

## Checklist — if this adds or changes a route

- [ ] Listed in `COMMERCE-ELIMINATION-CONTRACT.md` §6 or §7. The inventory is reconciled
      against the filesystem, `next.config.ts` and `e2e/retired-routes.spec.ts` in both
      directions, so an unlisted route fails and a listed one that does not exist fails
- [ ] A retired route is asserted **by status code** with `maxRedirects: 0` — `toHaveURL()`
      and a rendered word "Gone" both pass on an HTTP 200
- [ ] A 410 uses `goneRoute()` from `src/lib/http/goneResponse.ts`, not a hand-rolled
      `Response`

## Checklist — if this adds or changes a control

- [ ] Registered in `docs/controls.json` with its `knownLimit` written down
- [ ] Its decision is a pure function with a fixture test — a tool that has never been pointed
      at a known answer is a first draft
      ([ADR 024](../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md))
- [ ] A sentinel in `scripts/lib/sentinels.mjs` proves it can fail
      ([ADR 020](../docs/adr/020-a-test-that-cannot-fail-is-documentation.md))

## Screenshots / Screen Recording

<!-- Add screenshots for any UI changes. Include both desktop (1280px) and mobile (390px) —
     both mobile-only defects this project has shipped (the hero crop, the collection tiles
     at opacity 0.12) passed every desktop check. See e2e/hero-legibility.spec.ts. -->

## State Update

- [ ] `STATE.md` updated if this resolves, changes, or adds an open item
- [ ] A new ADR added under `docs/adr/` if this records a decision restated in 3+ places
      (see `docs/adr/README.md`'s "why only those")

## Notes for Reviewer

<!-- Anything the reviewer should pay particular attention to -->
