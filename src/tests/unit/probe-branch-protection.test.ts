import { describe, it, expect } from 'vitest'

const { verdict } = await import('../../../scripts/probe-branch-protection.mjs')

/**
 * The classification logic of the merge-gate probe, exercised without a token.
 *
 * This is the part of the probe that has to be right, and it is the part a live run
 * cannot demonstrate: a scheduled run against a repository whose protection is absent
 * only ever shows one of these four branches. The other three are reachable only here.
 *
 * The 404 case is the reason this file exists. GitHub answers "this branch has no
 * protection" with a 404, and a 404 handled as an error turns *there is no gate* into
 * *the check could not run* — a monitoring script laundering its most important finding
 * into a shrug. That is ADR 006's shape exactly, so it gets a test rather than a comment.
 */

const CLAIMED_CONTEXTS = ['Lint · Type-check · Unit tests · Build', 'E2E tests (Playwright)']

const claimNotConfigured = { requiredContexts: CLAIMED_CONTEXTS, status: 'not-configured' }
const claimConfigured = { requiredContexts: CLAIMED_CONTEXTS, status: 'configured' }

describe('an unprotected branch is a finding, not an error', () => {
  const absent = { state: 'absent', contexts: [], detail: 'no protection' }

  it('agrees when the registry also says not-configured', () => {
    const result = verdict(claimNotConfigured, absent)
    expect(result.verdict).toBe('absent')
    expect(result.agrees).toBe(true)
  })

  it('disagrees when the registry claims the gate is configured', () => {
    // The exact regression ADR 015 recorded: a document asserting a gate that is not
    // there. If this ever passes silently the probe has stopped being a control.
    const result = verdict(claimConfigured, absent)
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/ADR 015/)
  })
})

describe('protection is compared context by context', () => {
  it('enforced when the required set matches exactly', () => {
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: [...CLAIMED_CONTEXTS].reverse(), // order is not part of the contract
      detail: '',
    })
    expect(result.verdict).toBe('enforced')
    expect(result.agrees).toBe(true)
  })

  it('mismatched when GitHub requires the job IDs instead of the check names', () => {
    // The booby trap itself: `verify` and `e2e` are contexts nothing publishes, so a
    // repository configured this way blocks every pull request forever with no message
    // saying why. This is the single most valuable thing this probe can detect.
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: ['verify', 'e2e'],
      detail: '',
    })
    expect(result.verdict).toBe('mismatched')
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/blocks every pull request forever/)
  })

  it('mismatched when only one of the two checks is required', () => {
    // A gate with a hole in it, and the hole is invisible: the PR goes green on the
    // half that is enforced.
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: ['Lint · Type-check · Unit tests · Build'],
      detail: '',
    })
    expect(result.verdict).toBe('mismatched')
    expect(result.agrees).toBe(false)
  })

  it('reports a stale registry when protection exists but the registry says otherwise', () => {
    const result = verdict(claimNotConfigured, {
      state: 'protected',
      contexts: CLAIMED_CONTEXTS,
      detail: '',
    })
    expect(result.verdict).toBe('enforced')
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/stale registry/)
  })
})

describe('unreadable is not the same as unprotected', () => {
  it('reports unevaluable rather than absent', () => {
    // ADR 010's separation, applied here: "this check failed" and "this check could not
    // run" are different facts, and collapsing them is how a control goes quiet.
    const result = verdict(claimNotConfigured, {
      state: 'unevaluable',
      contexts: [],
      detail: 'GitHub returned 403',
    })
    expect(result.verdict).toBe('unevaluable')
    expect(result.agrees).toBeNull()
  })

  it('never exits non-zero on unevaluable — agrees is null, not false', () => {
    // The script exits 1 only on `agrees === false`. A token problem must not turn the
    // scheduled audit red, or the audit becomes the noise it exists to replace.
    const result = verdict(claimConfigured, { state: 'unevaluable', contexts: [], detail: '' })
    expect(result.agrees).not.toBe(false)
  })
})
