import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const { livenessIssuePlan, composeLivenessBody, LIVENESS_ISSUE_LABEL, LIVENESS_ISSUE_TITLE } =
  await import('../../../scripts/lib/liveness-report.mjs')

/**
 * **The reporting channel the assertion-liveness control did not have.**
 *
 * The step that runs `probe-assertion-liveness.mjs` is `continue-on-error: true`, and until
 * 2026-09-21 its only trace was one cell in a job summary. So when the probe started
 * refusing to run — the steps above it write untracked `.log` files, and
 * `git status --porcelain` counts those as a dirty working tree — it failed on every
 * scheduled run and nothing said so. The control that exists to find tests which cannot
 * fail had become a check that could not report.
 *
 * The decision lives here rather than in the workflow because
 * `workflow-inline-script-budget.test.ts` rejected the first version at 49 lines against a
 * 45-line budget, and it was right to: a decision inside a YAML string cannot be imported,
 * so the only way to exercise it is to break production and wait six hours (ADR 030).
 */

const RUN = 'https://github.com/o/r/actions/runs/1'
const DEAD_LOG = '✗ contrast-floor — dead\n    invariant: the AA floor is enforced'
const REFUSAL_LOG = 'Error: The working tree has uncommitted changes.'

describe('livenessIssuePlan', () => {
  it('opens one issue when the probe failed and nothing is open', () => {
    const plan = livenessIssuePlan({ outcome: 'failure', log: DEAD_LOG, runUrl: RUN })

    expect(plan.create).toBe(true)
    expect(plan.comment).toBeNull()
    expect(plan.close).toEqual([])
    expect(plan.body).toContain('contrast-floor')
  })

  it('comments on the open issue rather than opening a second', () => {
    // ADR 011: one issue per finding, updated. A new issue per scheduled run is how a
    // channel earns its mute.
    const plan = livenessIssuePlan({
      outcome: 'failure',
      log: DEAD_LOG,
      openIssues: [{ number: 7 }],
      comments: [{ body: 'something else entirely' }],
      runUrl: RUN,
    })

    expect(plan.create).toBe(false)
    expect(plan.comment).toBe(7)
  })

  it('says nothing when it has nothing new to say', () => {
    // Six-hourly, indefinitely, is what makes this matter: the same diagnosis posted four
    // times a day buries the one that changes.
    const body = composeLivenessBody({ log: DEAD_LOG, runUrl: RUN })
    const plan = livenessIssuePlan({
      outcome: 'failure',
      log: DEAD_LOG,
      openIssues: [{ number: 7 }],
      comments: [{ body }],
      runUrl: RUN,
    })

    expect(plan.comment).toBeNull()
    expect(plan.create).toBe(false)
  })

  it('does not mistake a different run url for a different diagnosis', () => {
    // The run link is the only part that changes between two identical findings, so the
    // comparison has to ignore it or the dedup never fires.
    const earlier = composeLivenessBody({ log: DEAD_LOG, runUrl: 'https://example/runs/999' })
    const plan = livenessIssuePlan({
      outcome: 'failure',
      log: DEAD_LOG,
      openIssues: [{ number: 7 }],
      comments: [{ body: earlier }],
      runUrl: RUN,
    })

    expect(plan.comment).toBeNull()
  })

  it('closes every open issue when the probe comes back clean', () => {
    const plan = livenessIssuePlan({
      outcome: 'success',
      openIssues: [{ number: 7 }, { number: 9 }],
      runUrl: RUN,
    })

    expect(plan.close).toEqual([7, 9])
    expect(plan.create).toBe(false)
    expect(plan.closeComment).toContain('alive again')
  })

  it('does nothing at all when the step neither passed nor failed', () => {
    // A cancelled or skipped step is an absence of evidence. Opening an issue from one
    // would report a finding nobody measured — ADR 010, and the reason `unevaluable` is a
    // separate verdict everywhere else in this repository.
    for (const outcome of ['skipped', 'cancelled', '']) {
      const plan = livenessIssuePlan({
        outcome,
        openIssues: [{ number: 7 }],
        runUrl: RUN,
      })

      expect(plan.create, `${outcome} should not open an issue`).toBe(false)
      expect(plan.comment, `${outcome} should not comment`).toBeNull()
      expect(plan.close, `${outcome} should not close anything`).toEqual([])
    }
  })
})

describe('composeLivenessBody', () => {
  it('carries the probe’s own words rather than paraphrasing them', () => {
    // The body is the only place the two findings this channel carries can be told apart.
    expect(composeLivenessBody({ log: DEAD_LOG, runUrl: RUN })).toContain('contrast-floor')
    expect(composeLivenessBody({ log: REFUSAL_LOG, runUrl: RUN })).toContain(
      'The working tree has uncommitted changes.',
    )
  })

  it('distinguishes a dead assertion from a control that could not run', () => {
    const body = composeLivenessBody({ log: DEAD_LOG, runUrl: RUN })

    expect(body).toContain('dead*')
    expect(body).toContain('refused to start*')
  })

  it('never invents a diagnosis from a missing log', () => {
    const body = composeLivenessBody({ log: null, runUrl: RUN })

    expect(body).toContain('produced no output at all')
    expect(body).not.toContain('```')
  })

  it('treats an empty log the same as an absent one', () => {
    expect(composeLivenessBody({ log: '   \n  ', runUrl: RUN })).toContain(
      'produced no output at all',
    )
  })

  it('keeps the end of a long log, where the verdict is printed', () => {
    const body = composeLivenessBody({ log: 'x'.repeat(5000) + 'VERDICT', runUrl: RUN })

    expect(body).toContain('VERDICT')
    expect(body.length).toBeLessThan(5000)
  })
})

describe('the control audit reaches the decision it claims to', () => {
  const workflow = read('.github/workflows/control-audit.yml')

  it('imports the module by a path that exists, under the label it filters on', () => {
    // A typo in either would surface only in a scheduled job, six hours later, and
    // silently — the exact reason this assertion exists for every other extracted
    // decision in this repository.
    expect(workflow).toContain('scripts/lib/liveness-report.mjs')
    expect(workflow).toContain('LIVENESS_ISSUE_LABEL')
    expect(LIVENESS_ISSUE_LABEL).toBe('assertions-dead')
    expect(LIVENESS_ISSUE_TITLE.length).toBeGreaterThan(20)
  })

  it('resolves the import absolutely, because github-script has no referrer module', () => {
    // `new AsyncFunction` has no module to resolve a relative specifier against.
    expect(workflow).toContain(
      'const lib = `file://${process.env.GITHUB_WORKSPACE}/scripts/lib/liveness-report.mjs`',
    )
  })

  it('hands the step outcome to the decision instead of gating on it', () => {
    // The reporter runs on `always()` and lets `livenessIssuePlan` decide, so one
    // function owns both the open and the close. Splitting them across two `if:`
    // conditions is what ADR 027 is about: a question of configuration answered by a
    // question of execution.
    expect(workflow).toContain("outcome: '${{ steps.liveness.outcome }}'")
  })
})
