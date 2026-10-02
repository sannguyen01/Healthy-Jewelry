import { describe, expect, it } from 'vitest'

/**
 * CANARY — DO NOT MERGE.
 *
 * A deliberately failing test, and the only change on its branch. It exists to prove that the
 * `main` ruleset refuses a pull request whose required check failed, read through
 * `scripts/probe-merge-denial.mjs` without anyone pressing merge
 * (docs/runbooks/main-ruleset.md, step 3). Close the pull request unmerged and delete the branch.
 */
describe('merge-gate canary', () => {
  it('fails on purpose so the required check is red', () => {
    expect(1).toBe(2)
  })
})
