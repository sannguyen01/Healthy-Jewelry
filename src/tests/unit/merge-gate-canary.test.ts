import { describe, it, expect } from 'vitest'

const { isMergeGateCanaryRef } = await import('../../../scripts/lib/merge-denial.mjs')

/**
 * **The merge-gate canary's failure, kept where it cannot follow a mistaken merge onto `main`.**
 *
 * #94's canary was a test that failed everywhere. When it was merged, every later CI run on
 * `main` failed with it, and two more pull requests were needed to undo that. Here the failure
 * is conditional: it happens only in a pull request whose source branch is a canary
 * (`GITHUB_HEAD_REF`, which GitHub sets on `pull_request` runs and leaves empty on a push). The
 * canary pull request itself changes one dated line in `docs/runbooks/merge-gate-canary-log.md`.
 *
 * If that pull request is mistakenly merged, this test will not intentionally fail on `main`'s
 * push. That is the whole safety claim. Other checks can still fail, and the canary is still
 * never merged (docs/runbooks/main-ruleset.md, step 3).
 */
describe('the merge-gate canary', () => {
  it('is not running in a canary pull request (if it is, this failure is the canary working)', () => {
    const headRef = process.env.GITHUB_HEAD_REF ?? ''
    expect(
      isMergeGateCanaryRef(headRef),
      `This pull request's source branch is "${headRef}", a merge-gate canary. This test fails ` +
        'on purpose so that its required check is red; read it with scripts/probe-merge-denial.mjs ' +
        'and close the pull request unmerged (docs/runbooks/main-ruleset.md, step 3).',
    ).toBe(false)
  })

  it('reads the source branch on a pull_request run, so the canary case above can fire', () => {
    // A local run, or a push, has no source branch, and the case above passes there whatever the
    // predicate says. This is the observation that the field reaches the test runner at all:
    // without it, a canary would pass silently and read as NOT-DENIED for the wrong reason.
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      expect(process.env.GITHUB_HEAD_REF ?? '', 'a pull_request run with no GITHUB_HEAD_REF').not.toBe('')
    }
  })
})

describe('isMergeGateCanaryRef', () => {
  // Each case stands alone: a predicate that always answers false fails the first group, and one
  // that always answers true fails the second.
  it.each(['canary/merge-gate-2026-10-03', 'canary/merge-gate-2026-10-03-2', 'canary/merge-gate-2026-10-03-run-b'])(
    'accepts %s',
    (ref) => {
      expect(isMergeGateCanaryRef(ref)).toBe(true)
    },
  )

  it.each([
    ['an empty ref', ''],
    ['a full ref rather than a bare branch name', 'refs/heads/canary/merge-gate-2026-10-03'],
    ['a prefix with no date', 'canary/merge-gate-'],
    ['an unpadded date', 'canary/merge-gate-2026-1-3'],
    ['a near-miss prefix', 'canary/merge-gates-2026-10-03'],
    ['a leading character', 'xcanary/merge-gate-2026-10-03'],
    ['an upper-case suffix', 'canary/merge-gate-2026-10-03-B'],
    ['a trailing hyphen', 'canary/merge-gate-2026-10-03-'],
    ['an ordinary working branch', 'claude/incident-pr94-followup'],
    ["#94's branch name under another prefix", 'merge-gate-2026-10-02'],
  ])('rejects %s', (_label, ref) => {
    expect(isMergeGateCanaryRef(ref)).toBe(false)
  })

  it('checks the format, not the calendar: a decision, not an oversight', () => {
    // Its job is to keep the canary case inert on every other ref. An impossible date under the
    // canary prefix only makes a canary-named branch fail `verify`, which is harmless, and the
    // runbook names the branch with `date -u +%F`.
    expect(isMergeGateCanaryRef('canary/merge-gate-2026-13-45')).toBe(true)
  })

  it('rejects anything that is not a string', () => {
    for (const value of [undefined, null, 20261003, {}, ['canary/merge-gate-2026-10-03']]) {
      expect(isMergeGateCanaryRef(value)).toBe(false)
    }
  })
})
