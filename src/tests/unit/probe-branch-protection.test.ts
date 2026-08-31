import { describe, it, expect } from 'vitest'

const { verdict, escalationDecision, PRECONDITION_GREEN_RUNS } = await import(
  '../../../scripts/probe-branch-protection.mjs'
)
const { ACCEPTED_GAP_MAX_AGE_DAYS } = await import('../../../scripts/lib/accepted-gap.mjs')

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

/**
 * **When an absent gate should wake somebody, and when it should stay quiet.**
 *
 * The probe's exit code is deliberately blind to this: "absent, and the registry honestly
 * says so" is a consistent state and exits 0, because failing a scheduled audit over a
 * console action nobody in CI can perform produces a permanent red that people mute.
 *
 * The consequence, until 2026-08-31, was that the finding went into `merge-gate.log` and
 * stopped. `smoke-liveness` and `ci-liveness` each open a labelled issue; the merge gate —
 * the reason eleven commits reached `main` unverified on 2026-08-29 — had no channel at
 * all. `escalationDecision` is that channel's decision, and it is a pure function precisely
 * so it can be pointed at known answers here rather than learned from a live run (ADR 024).
 *
 * The four cases that must never escalate matter more than the two that must. An alarm that
 * fires on an unreadable token is an alarm about credentials wearing a branch-protection
 * label, which is ADR 010's confusion of "failed" with "could not run" rebuilt inside the
 * fix for it.
 */

const AT_THE_TIME = new Date('2026-08-31T00:00:00Z')
const FRESHLY_ACCEPTED = { acceptedSince: '2026-08-29', humanAction: 'GitHub → Settings' }
const LONG_ACCEPTED = { acceptedSince: '2026-06-01', humanAction: 'GitHub → Settings' }
const GREEN = Array(PRECONDITION_GREEN_RUNS).fill('success')
const RED_STREAK = ['failure', 'failure', 'failure', 'failure']

describe('an absent gate escalates for two reasons and no others', () => {
  it('escalates when the precondition ADR 015 named is now met', () => {
    // The state this repository is actually in: main unprotected, and the last four CI
    // runs green after the blackout. ADR 015 said protection was "only reasonable once a
    // passing run existed to enforce against" — so the stated blocker is gone.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: GREEN,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(true)
    expect(result.reason).toBe('precondition-met')
  })

  it('escalates when the acceptance has gone stale, whatever CI is doing', () => {
    const result = escalationDecision({
      verdict: 'absent',
      control: LONG_ACCEPTED,
      ciConclusions: RED_STREAK,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(true)
    expect(result.reason).toBe('stale-acceptance')
    expect(result.detail).toContain(String(ACCEPTED_GAP_MAX_AGE_DAYS))
  })

  it('stays quiet on a fresh acceptance with no green run to enforce against', () => {
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: RED_STREAK,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
    expect(result.reason).toBe(null)
  })

  it('does not count a green streak shorter than the threshold', () => {
    // One green run after a red streak is as likely to be the flake as the recovery.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: ['success', 'failure', 'failure', 'failure'],
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
  })

  it('treats an unreadable run history as no evidence, not as good news', () => {
    // `null` is "the API did not answer". Reading a precondition out of that is the
    // laundering ADR 006 is about, in the direction that produces a false alarm.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: null,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
  })
})

describe('every other verdict is silent here', () => {
  it.each(['enforced', 'mismatched', 'unevaluable'])('%s does not escalate', (state) => {
    // `mismatched` already exits 1 and fails loudly; `enforced` has nothing to say; and
    // `unevaluable` means the probe could not read the setting. Escalating on the last of
    // those would turn an expired token into an alarm about branch protection — ADR 010's
    // separation of "this check failed" from "this check could not run", rebuilt inside
    // the very fix that exists to honour it.
    const result = escalationDecision({
      verdict: state,
      control: LONG_ACCEPTED, // stale enough to fire, if the verdict were absent
      ciConclusions: GREEN, // green enough to fire, if the verdict were absent
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
    expect(result.reason).toBe(null)
  })
})
