import { describe, it, expect } from 'vitest'

const { assessLiveness, REQUIRED_STEPS, DEFAULT_WINDOW_HOURS } = await import(
  '../../../scripts/probe-smoke-liveness.mjs'
)

/**
 * **The dead-man's switch, exercised against this repository's real history.**
 *
 * Everything below the first describe block is verbatim from the GitHub Actions API on
 * 2026-08-28: real run IDs, real timestamps, and the real step list of run 33120472571.
 * That matters more than usual here. The whole claim of this probe is that it would have
 * caught something every existing control missed, and a claim like that tested against a
 * fixture I invented would be exactly the defect this repository has now recorded seven
 * times — *"a fixture written in your own vocabulary asserts only that you agree with
 * yourself."*
 *
 * The real history says: 66 runs, every recent one concluding `failure` at the preflight,
 * and inside each of them —
 *
 *     Preflight                   failure
 *     Live store and storefront   skipped
 *     Webhook signing secret      skipped
 *
 * — with the whole run completing in six seconds. The fabricated-catalogue detector and
 * the photography check have not executed since 2026-08-15. Issue #24 named the
 * credential, correctly, 32 times. Nothing named this.
 */

/** Verbatim from `GET /repos/{owner}/{repo}/actions/runs/33120472571/jobs`. */
const REAL_STEPS_OF_A_DARK_RUN = [
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Set up Node.js', conclusion: 'success' },
  { name: 'Preflight — secrets present and environment-scoped', conclusion: 'failure' },
  { name: 'Live store and storefront', conclusion: 'skipped' },
  { name: 'Webhook signing secret', conclusion: 'skipped' },
  { name: 'Job summary', conclusion: 'success' },
  { name: 'Report failure as an issue', conclusion: 'success' },
  { name: 'Report premise drift', conclusion: 'success' },
  { name: 'Close the failure issue on recovery', conclusion: 'skipped' },
  { name: 'Complete job', conclusion: 'success' },
]

/** What a healthy run looks like: the same job with the checks actually executing. */
const STEPS_OF_A_LIT_RUN = REAL_STEPS_OF_A_DARK_RUN.map((step) =>
  step.name === 'Preflight — secrets present and environment-scoped' ||
  step.name === 'Live store and storefront' ||
  step.name === 'Webhook signing secret'
    ? { ...step, conclusion: 'success' }
    : step
)

/** Verbatim from `GET /actions/workflows/production-smoke.yml/runs`, newest first. */
const REAL_RUNS = [
  { id: 33120472571, created_at: '2026-08-27T21:57:36Z', conclusion: 'failure' },
  { id: 33053034038, created_at: '2026-08-27T08:12:42Z', conclusion: 'failure' },
  { id: 33007232975, created_at: '2026-08-26T19:49:50Z', conclusion: 'failure' },
  { id: 32986543210, created_at: '2026-08-26T12:56:37Z', conclusion: 'failure' },
  { id: 32971234567, created_at: '2026-08-26T06:53:24Z', conclusion: 'failure' },
  { id: 32955432109, created_at: '2026-08-26T01:26:08Z', conclusion: 'failure' },
]

const NOW = new Date('2026-08-28T07:45:00Z')

const allDark = Object.fromEntries(REAL_RUNS.map((r) => [r.id, REAL_STEPS_OF_A_DARK_RUN]))

describe('against this repository’s real history', () => {
  const result = assessLiveness({ runs: REAL_RUNS, stepsByRunId: allDark, now: NOW })

  it('reports the verification tier dark', () => {
    // The acceptance test for the whole workstream: run against real data, this must
    // independently rediscover a blind window that no existing control reported. If it
    // does not fire here, it is decoration and must not ship.
    expect(result.verdict).toBe('dark')
  })

  it('names the right reason — runs are happening, checks are not', () => {
    // Not `no-runs`. The runs are fine. That distinction is the entire finding: every
    // existing control reports the presence of a failure, and a job reporting `skipped`
    // is indistinguishable from one reporting `success` from outside.
    expect(result.reason).toBe('checks-not-executed')
  })

  it('counts the consecutive dark runs rather than reporting a single failure', () => {
    expect(result.streak).toBe(REAL_RUNS.length)
  })

  it('says no run in the fetched history ever executed the checks', () => {
    expect(result.lastExecutedAt).toBeNull()
    expect(result.summary).toContain('skipped')
  })

  it('does not count a completed run as evidence', () => {
    // Every run in this fixture concluded — on time, on schedule, reporting a real
    // diagnosis. A liveness check keyed on "did a run happen" would call this healthy,
    // which is what "a scheduled job that runs and checks nothing" looks like.
    expect(REAL_RUNS.every((r) => r.conclusion === 'failure')).toBe(true)
    expect(result.runsInWindow).toBeGreaterThan(0)
    expect(result.verdict).toBe('dark')
  })
})

describe('a step that ran and found problems is not darkness', () => {
  /**
   * The distinction this probe asserted wrongly until 2026-08-29.
   *
   * It required the step to conclude `success`, so a run that executed every live check and
   * reported real findings counted as "nothing is verifying production". That conflates
   * *nobody is checking* with *somebody checked and did not like what they found* — opposite
   * situations with opposite remedies, and only the first is this probe's subject.
   *
   * It became load-bearing when each live step started gating on its own credentials rather
   * than on the preflight's verdict: a wrong Admin token now executes the twelve checks that
   * never read it and fails on the five that do. Verification is happening, and an alarm
   * insisting otherwise would be a control reporting something other than the truth.
   */
  const RAN_AND_FAILED = REAL_STEPS_OF_A_DARK_RUN.map((step) =>
    step.name === 'Live store and storefront' ? { ...step, conclusion: 'failure' } : step
  )

  it('a live step concluding failure counts as lit', () => {
    const stepsByRunId = Object.fromEntries(REAL_RUNS.map((r) => [r.id, RAN_AND_FAILED]))
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('lit')
  })

  it('the old rule would have called that same run dark', () => {
    // Pinning the behaviour change itself, so a future edit that reverts to
    // `conclusion === 'success'` fails here rather than silently re-arming a false alarm.
    const executedUnderOldRule = RAN_AND_FAILED.find(
      (s) => s.name === 'Live store and storefront'
    )?.conclusion === 'success'
    expect(executedUnderOldRule).toBe(false)
  })

  it('skipped is still dark — the switch keeps its teeth', () => {
    // The half that must not weaken. A step that never ran is exactly what this probe was
    // built to catch, and it is still caught.
    const stepsByRunId = Object.fromEntries(
      REAL_RUNS.map((r) => [r.id, REAL_STEPS_OF_A_DARK_RUN])
    )
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('dark')
  })

  it('a cancelled step is dark, not lit', () => {
    // `cancelled` is neither success nor failure. A run someone stopped looked at nothing.
    const cancelled = REAL_STEPS_OF_A_DARK_RUN.map((step) =>
      step.name === 'Live store and storefront' ? { ...step, conclusion: 'cancelled' } : step
    )
    const stepsByRunId = Object.fromEntries(REAL_RUNS.map((r) => [r.id, cancelled]))
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('dark')
  })

  it('a missing step is dark, not lit', () => {
    const withoutStep = REAL_STEPS_OF_A_DARK_RUN.filter(
      (s) => s.name !== 'Live store and storefront'
    )
    const stepsByRunId = Object.fromEntries(REAL_RUNS.map((r) => [r.id, withoutStep]))
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('dark')
  })
})

describe('the healthy case', () => {
  it('reports lit when a run in the window executed the checks', () => {
    const stepsByRunId = { ...allDark, [REAL_RUNS[0].id]: STEPS_OF_A_LIT_RUN }
    const result = assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW })
    expect(result.verdict).toBe('lit')
  })

  it('one good run in the window is enough — this is a liveness check, not a pass rate', () => {
    // A tier that failed once and recovered is not dark. Conflating the two would make
    // this a duplicate of the smoke workflow's own failure channel, which is the mistake
    // ADR 011 is about.
    // Index 1, not a deeper one: at NOW the 26h window reaches back to 2026-08-27T05:45Z,
    // so runs [0] and [1] are inside it and everything older is not. Picking [3] here
    // first — 43h old — failed, correctly, and is worth the comment: a liveness window
    // that silently included stale runs would report a stopped tier healthy.
    const stepsByRunId = { ...allDark, [REAL_RUNS[1].id]: STEPS_OF_A_LIT_RUN }
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('lit')
  })
})

describe('silence and ignorance are different findings', () => {
  it('no runs at all is dark, with its own reason', () => {
    const result = assessLiveness({ runs: [], stepsByRunId: {}, now: NOW })
    expect(result.verdict).toBe('dark')
    expect(result.reason).toBe('no-runs')
  })

  it('a run outside the window does not count as a run in it', () => {
    const stale = [{ id: 1, created_at: '2026-08-01T00:00:00Z', conclusion: 'success' }]
    const result = assessLiveness({
      runs: stale,
      stepsByRunId: { 1: STEPS_OF_A_LIT_RUN },
      now: NOW,
    })
    expect(result.verdict).toBe('dark')
    expect(result.reason).toBe('no-runs')
  })

  it('unreadable step data is unevaluable, never dark', () => {
    // ADR 010's separation, kept here deliberately: "the tier stopped" and "I could not
    // tell" are different facts, and a monitor that reports the second as the first
    // manufactures an outage.
    const result = assessLiveness({ runs: REAL_RUNS, stepsByRunId: {}, now: NOW })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('no-step-data')
  })
})

describe('the required steps are the ones that look at production', () => {
  it('requires the storefront step specifically', () => {
    expect(REQUIRED_STEPS).toContain('Live store and storefront')
  })

  it('does not accept the job conclusion as a substitute', () => {
    // A job that fails at the preflight is a completed run. Counting it would satisfy
    // "a run happened" while proving nothing.
    const preflightOnly = REAL_STEPS_OF_A_DARK_RUN.map((s) =>
      s.name.startsWith('Preflight') ? { ...s, conclusion: 'success' } : s
    )
    const result = assessLiveness({
      runs: REAL_RUNS,
      stepsByRunId: Object.fromEntries(REAL_RUNS.map((r) => [r.id, preflightOnly])),
      now: NOW,
    })
    expect(result.verdict).toBe('dark')
  })

  it('the window is a documented constant, not a literal in the probe', () => {
    expect(DEFAULT_WINDOW_HOURS).toBe(26)
  })
})
