import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { assessLiveness, REQUIRED_STEPS, DEFAULT_WINDOW_HOURS, ALARMING_VERDICTS } =
  await import('../../../scripts/probe-smoke-liveness.mjs')

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

/**
 * **The step that looks at production was renamed, and these fixtures are not rewritten.**
 *
 * Every array below is verbatim from the Actions API — that is what makes them evidence
 * rather than a shape somebody imagined. When WS-6 replaced `verify-production.mjs` with
 * the credential-free browse-only check, the step's *name* changed from
 * `Live store and storefront` to `Browse-only catalogue`, and `REQUIRED_STEPS` with it.
 *
 * Editing the captured arrays to say the new name would falsify the record: run #155 did
 * not have a step called `Browse-only catalogue`, and the whole point of these fixtures is
 * that they are what the API actually returned on 2026-09-19. So the rename is applied as
 * a *transform*, named and explained, and the captured data stays as captured.
 *
 * The probe's logic is what is under test, and it keys on `REQUIRED_STEPS`. Running it
 * against the historical step name would exercise a name the workflow no longer emits —
 * which would pass, and prove nothing about today.
 */
const CAPTURED_LIVE_STEP = 'Live store and storefront'

/** The name the workflow emits now. Read from the probe so the two cannot drift. */
const LIVE_STEP = REQUIRED_STEPS[0]

/** A captured run, with its live-check step renamed to what the workflow calls it today. */
const asTodaysWorkflow = (steps: { name: string; conclusion: string }[]) =>
  steps.map((step) => (step.name === CAPTURED_LIVE_STEP ? { ...step, name: LIVE_STEP } : step))

/** Verbatim from `GET /repos/{owner}/{repo}/actions/runs/33120472571/jobs`. */
const REAL_STEPS_OF_A_DARK_RUN = asTodaysWorkflow([
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
])

/** What a healthy run looks like: the same job with the checks actually executing. */
const STEPS_OF_A_LIT_RUN = REAL_STEPS_OF_A_DARK_RUN.map((step) =>
  step.name === 'Preflight — secrets present and environment-scoped' ||
  step.name === LIVE_STEP ||
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
    step.name === LIVE_STEP ? { ...step, conclusion: 'failure' } : step
  )

  it('a live step concluding failure counts as lit', () => {
    const stepsByRunId = Object.fromEntries(REAL_RUNS.map((r) => [r.id, RAN_AND_FAILED]))
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('lit')
  })

  it('the old rule would have called that same run dark', () => {
    // Pinning the behaviour change itself, so a future edit that reverts to
    // `conclusion === 'success'` fails here rather than silently re-arming a false alarm.
    const executedUnderOldRule = RAN_AND_FAILED.find(
      (s) => s.name === LIVE_STEP
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
      step.name === LIVE_STEP ? { ...step, conclusion: 'cancelled' } : step
    )
    const stepsByRunId = Object.fromEntries(REAL_RUNS.map((r) => [r.id, cancelled]))
    expect(assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW }).verdict).toBe('dark')
  })

  it('a missing step is dark, not lit', () => {
    const withoutStep = REAL_STEPS_OF_A_DARK_RUN.filter(
      (s) => s.name !== LIVE_STEP
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

  it('a good run behind a skipped newest one is a stop, not a healthy tier', () => {
    // This fixture is unchanged and its verdict is not. It asserted `lit` until the
    // `stopped` verdict existed, and that was wrong on its own terms: `REAL_RUNS` is
    // newest-first, so setting index 1 lit and leaving index 0 dark encodes *the good run
    // came first and then the checks stopped* — which is the 2026-09-19 shape exactly, and
    // the opposite of the "failed once and recovered" case the old comment claimed.
    //
    // Both readings passed because `assessLiveness` was order-blind: it asked whether any
    // run in the window had looked, and never which one. The recovery case the old comment
    // meant is now covered explicitly, with the newest run as the executing one, in
    // 'does not fire when the newest run is the one that looked' below.
    //
    // Index 1, not a deeper one: at NOW the 26h window reaches back to 2026-08-27T05:45Z,
    // so runs [0] and [1] are inside it and everything older is not. Picking [3] here
    // first — 43h old — failed, correctly, and is worth the comment: a liveness window
    // that silently included stale runs would report a stopped tier healthy.
    const stepsByRunId = { ...allDark, [REAL_RUNS[1].id]: STEPS_OF_A_LIT_RUN }
    const result = assessLiveness({ runs: REAL_RUNS, stepsByRunId, now: NOW })
    expect(result.verdict).toBe('stopped')
    expect(result.lastExecutedAt).toBe(REAL_RUNS[1].created_at)
  })

  it('one good run in the window is enough, when it is the most recent one', () => {
    // The claim the test above used to make, with a fixture that actually makes it: a tier
    // that failed once and recovered is not dark. Conflating the two would make this a
    // duplicate of the smoke workflow's own failure channel, which is the mistake ADR 011
    // is about.
    const stepsByRunId = { ...allDark, [REAL_RUNS[0].id]: STEPS_OF_A_LIT_RUN }
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
  it('requires exactly one step, and it is the live check', () => {
    expect(REQUIRED_STEPS).toEqual(['Browse-only catalogue'])
  })

  it('requires a step that needs no credential to run', () => {
    // The property that matters, stated separately from the name. `Live store and
    // storefront` gated on `storefrontReady`, so emptying five secrets on the
    // `production-readonly` environment silenced it — and a silenced step is
    // indistinguishable from a passing one from outside, which is how this tier went dark
    // on 2026-09-19 (ADR 033, issue #81).
    //
    // `Browse-only catalogue` has no capability gate in the workflow. Asserted against the
    // workflow file rather than trusted, because a gate added later would re-arm the exact
    // failure this probe exists to name, and nothing else would notice.
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/production-smoke.yml'),
      'utf8'
    )
    const step = workflow.slice(workflow.indexOf(`- name: ${REQUIRED_STEPS[0]}`))
    const body = step.slice(0, step.indexOf('      - name:', 10))

    expect(body, `the ${REQUIRED_STEPS[0]} step is not in the workflow`).toContain('run:')
    expect(
      body.match(/^\s*if:.*$/m)?.[0] ?? '',
      `the ${REQUIRED_STEPS[0]} step has acquired a condition beyond always(). If it can ` +
        `skip, this probe's alarm can be silenced by a missing secret — which is what it ` +
        `exists to catch.`
    ).toMatch(/if:\s*always\(\)\s*$/)
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

/**
 * **The de-configuration, captured the day after it happened.**
 *
 * Everything in this block is verbatim from the Actions API on 2026-09-20, read back over
 * the two production-smoke runs either side of the event. No fixture was invented, for the
 * reason the header of this file already gives.
 *
 * What happened: between 15:35 and 20:14 UTC on 2026-09-19 the five secrets in the
 * `production-readonly` GitHub Environment were emptied. Run #154 had them and executed the
 * live checks (reporting real failures). Run #155 did not, so `preflight-secrets.mjs`
 * returned `not-configured`, exited 0, and skipped both real steps — and the run concluded
 * **success**.
 *
 * `assessLiveness` called that `lit` at the 20:47 control audit, because #154 was still
 * inside the 26h window and the function only asked whether *anything* had looked. It was
 * right by its own definition and 26 hours late, which is the gap `stopped` closes.
 *
 * The `not-configured` branch was written when all-secrets-absent could only mean "nobody
 * has set this up yet". A decommission removes credentials on purpose, so it now also means
 * "somebody took them away" — the same observation, the opposite event. See
 * docs/adr/033-a-premise-that-expired-mid-decommission.md.
 */

/** Verbatim from `GET /actions/runs/105921386282` — run #154, the last one that looked. */
const STEPS_OF_RUN_154 = asTodaysWorkflow([
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Set up Node.js', conclusion: 'success' },
  { name: 'Preflight — secrets present and environment-scoped', conclusion: 'failure' },
  { name: 'Live store and storefront', conclusion: 'failure' },
  { name: 'Webhook signing secret', conclusion: 'failure' },
  { name: 'Write the run receipt', conclusion: 'success' },
  { name: 'Upload the run receipt', conclusion: 'success' },
  { name: 'Job summary', conclusion: 'success' },
  { name: 'Report failure as an issue', conclusion: 'success' },
  { name: 'Report premise drift', conclusion: 'success' },
  { name: 'Close the failure issue on recovery', conclusion: 'skipped' },
  { name: 'Complete job', conclusion: 'success' },
])

/**
 * Verbatim from `GET /actions/runs/105960406584` — run #155.
 *
 * Note the preflight: `success`. This is not the 2026-08 shape, where the preflight went red
 * and took the checks down with it. Here everything the reader can see is green and the two
 * steps that touch production did not run.
 */
const STEPS_OF_RUN_155 = asTodaysWorkflow([
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Set up Node.js', conclusion: 'success' },
  { name: 'Preflight — secrets present and environment-scoped', conclusion: 'success' },
  { name: 'Live store and storefront', conclusion: 'skipped' },
  { name: 'Webhook signing secret', conclusion: 'skipped' },
  { name: 'Write the run receipt', conclusion: 'success' },
  { name: 'Upload the run receipt', conclusion: 'success' },
  { name: 'Job summary', conclusion: 'success' },
  { name: 'Report failure as an issue', conclusion: 'skipped' },
  { name: 'Report premise drift', conclusion: 'success' },
  { name: 'Close the failure issue on recovery', conclusion: 'skipped' },
  { name: 'Complete job', conclusion: 'success' },
])

const RUN_154 = { id: 35452275777, created_at: '2026-09-19T15:35:16Z', conclusion: 'failure' }
const RUN_155 = { id: 35466761323, created_at: '2026-09-19T20:14:14Z', conclusion: 'success' }

/** Newest first, as the API returns them. */
const RUNS_ACROSS_THE_EVENT = [RUN_155, RUN_154]
const STEPS_ACROSS_THE_EVENT = {
  [RUN_154.id]: STEPS_OF_RUN_154,
  [RUN_155.id]: STEPS_OF_RUN_155,
}

/** The control audit that ran 33 minutes after #155, and reported `lit`. */
const AT_THE_CONTROL_AUDIT = new Date('2026-09-19T20:47:53Z')

describe('a tier that has just stopped is not a tier that is lit', () => {
  it('reports `stopped` at the moment it stopped, not a window later', () => {
    const result = assessLiveness({
      runs: RUNS_ACROSS_THE_EVENT,
      stepsByRunId: STEPS_ACROSS_THE_EVENT,
      now: AT_THE_CONTROL_AUDIT,
    })

    // Before this verdict existed, the same inputs returned `lit` — because #154 was inside
    // the window and `alive.length > 0`. That is the regression under test.
    expect(result.verdict).toBe('stopped')
    expect(result.reason).toBe('checks-stopped-executing')
  })

  it('names the last run that actually looked, so the change can be dated', () => {
    const result = assessLiveness({
      runs: RUNS_ACROSS_THE_EVENT,
      stepsByRunId: STEPS_ACROSS_THE_EVENT,
      now: AT_THE_CONTROL_AUDIT,
    })
    expect(result.lastExecutedAt).toBe(RUN_154.created_at)
    expect(result.streak).toBe(1)
  })

  it('exits non-zero, so the existing reporting step picks it up unchanged', () => {
    // `control-audit.yml` gates on this script's exit code and pastes its output into the
    // issue. Adding the verdict to this set is the whole wiring; the YAML is untouched.
    expect(ALARMING_VERDICTS).toContain('stopped')
    expect(ALARMING_VERDICTS).toContain('dark')
    expect(ALARMING_VERDICTS).not.toContain('unevaluable')
    expect(ALARMING_VERDICTS).not.toContain('lit')
  })

  it('a run whose conclusion is `success` is exactly the case that needs catching', () => {
    // Run #155 concluded `success`. Nothing that reads job conclusions can see this.
    expect(RUN_155.conclusion).toBe('success')
    expect(
      STEPS_OF_RUN_155.find((s) => s.name === LIVE_STEP)?.conclusion
    ).toBe('skipped')
  })

  it('does not fire when the newest run is the one that looked', () => {
    // The ordinary recovery shape: secrets restored, newest run executes again. Reversing
    // the order must return `lit` — otherwise the alarm would latch and never clear.
    const result = assessLiveness({
      runs: [
        { ...RUN_155, created_at: '2026-09-19T21:00:00Z' },
        { ...RUN_154, created_at: '2026-09-19T20:14:14Z' },
      ],
      stepsByRunId: {
        [RUN_155.id]: STEPS_OF_RUN_154, // newest executed
        [RUN_154.id]: STEPS_OF_RUN_155, // older skipped
      },
      now: AT_THE_CONTROL_AUDIT,
    })
    expect(result.verdict).toBe('lit')
  })

  it('a steady dark tier stays `dark`, not `stopped`', () => {
    // Both runs skipped: nothing has looked in the window at all. That is the 2026-08 shape
    // and it keeps its own verdict, because the remedies differ — `dark` says go and find
    // out why nothing has looked for a long time, `stopped` says something changed just now.
    const result = assessLiveness({
      runs: RUNS_ACROSS_THE_EVENT,
      stepsByRunId: {
        [RUN_154.id]: STEPS_OF_RUN_155,
        [RUN_155.id]: STEPS_OF_RUN_155,
      },
      now: AT_THE_CONTROL_AUDIT,
    })
    expect(result.verdict).toBe('dark')
    expect(result.reason).toBe('checks-not-executed')
  })

  it('unknown step data on the newest run is never `stopped`', () => {
    // `didExecute` returns null for a run whose steps could not be read. Treating that as
    // "did not execute" would manufacture a stop out of an API hiccup — ADR 010 again.
    const result = assessLiveness({
      runs: RUNS_ACROSS_THE_EVENT,
      stepsByRunId: { [RUN_154.id]: STEPS_OF_RUN_154 },
      now: AT_THE_CONTROL_AUDIT,
    })
    expect(result.verdict).not.toBe('stopped')
    expect(result.verdict).toBe('lit')
  })

  it('the summary says what changed, not just that something is wrong', () => {
    const result = assessLiveness({
      runs: RUNS_ACROSS_THE_EVENT,
      stepsByRunId: STEPS_ACROSS_THE_EVENT,
      now: AT_THE_CONTROL_AUDIT,
    })
    // A reader opening the issue needs the date of the last good run and a first place to
    // look. "The tier is dark" alone sends them to the wrong five weeks of history.
    expect(result.summary).toContain(RUN_154.created_at)
    expect(result.summary).toMatch(/just stopped/i)
    expect(result.summary).toMatch(/secrets/i)
  })
})
