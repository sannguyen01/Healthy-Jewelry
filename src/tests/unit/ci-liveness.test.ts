import { describe, it, expect } from 'vitest'

const probe = await import('../../../scripts/probe-ci-liveness.mjs')
const { assessCiLiveness, REQUIRED_STEPS, DEFAULT_WINDOW_HOURS, BRANCH } = probe

/**
 * **The merge gate's dead-man's switch, exercised against the outage it was written for.**
 *
 * The step lists below are verbatim from the GitHub Actions API: run `33266819493` is the
 * eleventh consecutive dark run on `main`, and run `33289843710` is the first healthy one
 * after the lockfile was repaired. That matters more than usual here. This probe's entire
 * claim is that it would have caught something every existing control missed, and a claim
 * like that tested against a fixture written in my own vocabulary would assert only that I
 * agree with myself — the failure
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md) exists to
 * prevent, and the one that let two defects ship in `probe-assertion-liveness.mjs`.
 *
 * The real history says: `Install dependencies` failed 0 seconds in with
 * `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, and every check after it reported `skipped` —
 * including the whole E2E job. Eleven runs. Eleven pull requests merged by hand against a
 * gate that had not run. Nothing named it.
 */

/** Verbatim from `GET /repos/{owner}/{repo}/actions/runs/33266819493/jobs`. */
const REAL_STEPS_OF_A_DARK_RUN = [
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Run pnpm/action-setup@v4', conclusion: 'success' },
  { name: 'Set up Node.js', conclusion: 'success' },
  { name: 'Install dependencies', conclusion: 'failure' },
  { name: 'Lint', conclusion: 'skipped' },
  { name: 'Type-check', conclusion: 'skipped' },
  { name: 'Audit workflow credentials', conclusion: 'skipped' },
  { name: 'Credential audit summary', conclusion: 'success' },
  { name: 'Unit tests', conclusion: 'skipped' },
  { name: 'Cache Next.js build cache', conclusion: 'skipped' },
  { name: 'Production build', conclusion: 'skipped' },
  { name: 'Upload build output', conclusion: 'skipped' },
  { name: 'Post Set up Node.js', conclusion: 'skipped' },
  { name: 'Post Run pnpm/action-setup@v4', conclusion: 'success' },
  { name: 'Post Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Complete job', conclusion: 'success' },
]

/** Verbatim from run `33289843710` — the same job once the lockfile was repaired. */
const REAL_STEPS_OF_A_HEALTHY_RUN = [
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Run actions/checkout@v4', conclusion: 'success' },
  { name: 'Run pnpm/action-setup@v4', conclusion: 'success' },
  { name: 'Set up Node.js', conclusion: 'success' },
  { name: 'Install dependencies', conclusion: 'success' },
  { name: 'Lint', conclusion: 'success' },
  { name: 'Type-check', conclusion: 'success' },
  { name: 'Audit workflow credentials', conclusion: 'success' },
  { name: 'Credential audit summary', conclusion: 'success' },
  { name: 'Unit tests', conclusion: 'success' },
  { name: 'Cache Next.js build cache', conclusion: 'success' },
  { name: 'Production build', conclusion: 'success' },
  { name: 'Upload build output', conclusion: 'success' },
  { name: 'Complete job', conclusion: 'success' },
]

/**
 * A build that failed honestly: lint ran and rejected the code, so everything after it is
 * `skipped`. Structurally near-identical to the dark run — which is the whole reason this
 * probe keys on `Lint` rather than on the full set of checks.
 */
const STEPS_OF_AN_ORDINARY_RED_BUILD = [
  { name: 'Set up job', conclusion: 'success' },
  { name: 'Install dependencies', conclusion: 'success' },
  { name: 'Lint', conclusion: 'failure' },
  { name: 'Type-check', conclusion: 'skipped' },
  { name: 'Unit tests', conclusion: 'skipped' },
  { name: 'Production build', conclusion: 'skipped' },
]

const NOW = new Date('2026-08-29T18:00:00Z')

/** Real run IDs and timestamps from the blackout window. */
const DARK_RUNS = [
  { id: 33266819493, created_at: '2026-08-29T17:53:49Z', conclusion: 'failure' },
  { id: 33266804437, created_at: '2026-08-29T17:53:30Z', conclusion: 'failure' },
  { id: 33235017655, created_at: '2026-08-29T04:57:17Z', conclusion: 'failure' },
  { id: 33235008665, created_at: '2026-08-29T04:57:00Z', conclusion: 'failure' },
]

function darkHistory() {
  return {
    runs: DARK_RUNS,
    stepsByRunId: Object.fromEntries(DARK_RUNS.map((r) => [r.id, REAL_STEPS_OF_A_DARK_RUN])),
  }
}

describe('the real blackout', () => {
  it('is reported dark', () => {
    const result = assessCiLiveness({ ...darkHistory(), now: NOW })

    expect(result.verdict).toBe('dark')
    expect(result.reason).toBe('gate-not-executed')
  })

  it('counts the consecutive runs that evaluated nothing', () => {
    const result = assessCiLiveness({ ...darkHistory(), now: NOW })
    expect(result.streak).toBe(DARK_RUNS.length)
  })

  it('says the runs happened, which is the part that hid it', () => {
    const result = assessCiLiveness({ ...darkHistory(), now: NOW })

    // The failure mode was not "CI stopped". It was "CI ran and checked nothing", and a
    // summary that does not say so sends the reader back to the same red X they already
    // dismissed.
    expect(result.summary).toContain('The runs are happening')
    expect(result.summary).toContain('skipped')
  })

  it('reports no prior real evaluation when the whole fetched history is dark', () => {
    const result = assessCiLiveness({ ...darkHistory(), now: NOW })
    expect(result.lastExecutedAt).toBeNull()
  })
})

describe('a gate that is working', () => {
  it('a run whose Lint executed is lit', () => {
    const runs = [{ id: 33289843710, created_at: '2026-08-30T03:15:25Z', conclusion: 'success' }]
    const result = assessCiLiveness({
      runs,
      stepsByRunId: { 33289843710: REAL_STEPS_OF_A_HEALTHY_RUN },
      now: new Date('2026-08-30T04:00:00Z'),
    })

    expect(result.verdict).toBe('lit')
  })

  it('an ordinary red build is lit, not dark', () => {
    // The load-bearing case. Lint ran and rejected the code; type-check, tests and build
    // are `skipped` exactly as in the blackout. A probe that could not tell these apart
    // would alarm on every broken pull request and be muted within a week — ADR 011.
    const runs = [{ id: 1, created_at: '2026-08-29T17:00:00Z', conclusion: 'failure' }]
    const result = assessCiLiveness({
      runs,
      stepsByRunId: { 1: STEPS_OF_AN_ORDINARY_RED_BUILD },
      now: NOW,
    })

    expect(
      result.verdict,
      'A build whose lint ran and failed has evaluated the repository. That is the gate ' +
        'doing its job, and reporting it as a dark tier would make this channel noise.'
    ).toBe('lit')
  })

  it('one healthy run among dark ones is enough', () => {
    // "Has anything looked recently?" — not "is everything healthy?". The second question
    // belongs to CI's own failure channel.
    const runs = [
      { id: 99, created_at: '2026-08-29T17:55:00Z', conclusion: 'success' },
      ...DARK_RUNS,
    ]
    const result = assessCiLiveness({
      runs,
      stepsByRunId: {
        99: REAL_STEPS_OF_A_HEALTHY_RUN,
        ...Object.fromEntries(DARK_RUNS.map((r) => [r.id, REAL_STEPS_OF_A_DARK_RUN])),
      },
      now: NOW,
    })

    expect(result.verdict).toBe('lit')
  })
})

describe('silence is not a finding here', () => {
  it('no runs at all is idle, not dark', () => {
    // ci.yml fires on push and pull request. A quiet weekend is a quiet weekend, and the
    // cron-driven smoke probe's "no runs means a stopped tier" reasoning does not carry.
    const result = assessCiLiveness({ runs: [], stepsByRunId: {}, now: NOW })

    expect(result.verdict).toBe('idle')
    expect(result.summary).toContain('nothing landed')
  })

  it('runs older than the window are the same as no runs', () => {
    const result = assessCiLiveness({
      ...darkHistory(),
      now: new Date('2026-09-15T00:00:00Z'),
    })

    expect(result.verdict).toBe('idle')
  })
})

describe('a probe failure is never a finding about the gate', () => {
  it('missing step data is unevaluable, not dark', () => {
    // ADR 010's separation. Reporting "dark" here would manufacture an outage out of a
    // rate limit, which is the exact class of defect this family of tools exists to avoid.
    const result = assessCiLiveness({ runs: DARK_RUNS, stepsByRunId: {}, now: NOW })

    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('no-step-data')
  })

  it('partial step data still yields a verdict', () => {
    // Only the newest run's steps are known, and they are dark. That is enough to answer.
    const result = assessCiLiveness({
      runs: DARK_RUNS,
      stepsByRunId: { [DARK_RUNS[0].id]: REAL_STEPS_OF_A_DARK_RUN },
      now: NOW,
    })

    expect(result.verdict).toBe('dark')
  })
})

describe('the probe watches the thing it claims to', () => {
  it('keys on the first step that evaluates the repository', () => {
    expect(REQUIRED_STEPS).toEqual(['Lint'])
  })

  it('Lint is a real step of the verify job, not a name that matches nothing', () => {
    // A required step absent from every run would make this probe permanently dark, and a
    // typo here is indistinguishable from a genuine outage in the probe's own output.
    const names = REAL_STEPS_OF_A_HEALTHY_RUN.map((s) => s.name)
    for (const step of REQUIRED_STEPS) expect(names).toContain(step)
  })

  it('watches main, the branch that deploys', () => {
    expect(BRANCH).toBe('main')
  })

  it('its window is long enough to survive a weekend', () => {
    expect(DEFAULT_WINDOW_HOURS).toBeGreaterThanOrEqual(48)
  })
})
