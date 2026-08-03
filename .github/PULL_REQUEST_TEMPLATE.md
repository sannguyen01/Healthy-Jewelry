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

## Checklist

- [ ] `pnpm lint` passes locally
- [ ] `pnpm type-check` passes locally
- [ ] `pnpm exec vitest run` passes locally
- [ ] New utility functions have unit tests in `src/tests/unit/`
- [ ] No hardcoded hex colour values (use `--hj-*` tokens)
- [ ] No hardcoded product data in page components (use `lib/shopify/` or `lib/data/hj-data.ts`)
- [ ] All copy matches brand voice guidelines in `CLAUDE.md §1`
- [ ] `generateMetadata()` present on any new page component
- [ ] No `.env` secrets committed

## Screenshots / Screen Recording

<!-- Add screenshots for any UI changes. Include both desktop (1280px) and mobile (375px). -->

## Notes for Reviewer

<!-- Anything the reviewer should pay particular attention to -->
