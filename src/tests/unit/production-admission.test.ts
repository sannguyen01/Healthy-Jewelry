import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const { admissionVerdict, jobResult, requiredResults, PRODUCTION_REF } = await import(
  '../../../scripts/lib/production-admission.mjs'
)
const { main } = await import('../../../scripts/check-production-admission.mjs')
const { parseWorkflowJobs } = await import('../../../scripts/lib/workflow-jobs.mjs')

/**
 * **A check that did not run must never read as one that passed.**
 *
 * On 2026-10-02 a commit whose `verify` had failed reached `main`, and two READY production
 * deployments were built from it and given the production aliases (incident PR-94,
 * masterplan §13). Detection worked; admission did not. `Production admission` is the one
 * verdict the deployment platform can be told to wait for, and these tests hold it to the rule
 * that only explicit success admits.
 *
 * The matrix below is asserted by **counting**, not by re-deriving the policy: across every
 * combination of seven possible readings for three jobs, exactly one admits on a pull request,
 * exactly one admits on a push to `main`, and none admits anywhere else. A test that computed
 * the expected verdict with the same rule as the code would agree with any bug in it.
 */

// The four results GitHub reports, plus three ways a result can be absent or unrecognised.
const READINGS = ['success', 'failure', 'cancelled', 'skipped', undefined, '', 'neutral'] as const

const combinations = READINGS.flatMap((verify) =>
  READINGS.flatMap((e2e) => READINGS.map((dependencyScope) => ({ verify, e2e, dependencyScope }))),
)

type Reading = (typeof READINGS)[number]
interface Combination {
  verify: Reading
  e2e: Reading
  dependencyScope: Reading
}

const EVENTS: Array<{ label: string; event: string | undefined; ref: string | undefined; admits: Combination | null }> = [
  {
    label: 'a pull request',
    event: 'pull_request',
    ref: 'refs/pull/95/merge',
    admits: { verify: 'success', e2e: 'success', dependencyScope: 'success' },
  },
  {
    label: 'a push to main',
    event: 'push',
    ref: 'refs/heads/main',
    admits: { verify: 'success', e2e: 'success', dependencyScope: 'skipped' },
  },
  { label: 'a push to develop', event: 'push', ref: 'refs/heads/develop', admits: null },
  { label: 'a push to a feature branch', event: 'push', ref: 'refs/heads/claude/anything', admits: null },
  { label: 'a push with no ref', event: 'push', ref: undefined, admits: null },
  { label: 'a merge queue', event: 'merge_group', ref: 'refs/heads/gh-readonly-queue/main/pr-95-abc', admits: null },
  { label: 'a manual dispatch on main', event: 'workflow_dispatch', ref: 'refs/heads/main', admits: null },
  { label: 'a schedule on main', event: 'schedule', ref: 'refs/heads/main', admits: null },
  { label: 'no event at all', event: undefined, ref: 'refs/heads/main', admits: null },
]

describe('admissionVerdict is exhaustive and admits only explicit success', () => {
  it('has the whole matrix to count', () => {
    // The guard on the guard: comparing a count over an empty set to 1 or 0 proves nothing.
    expect(combinations).toHaveLength(READINGS.length ** 3)
    expect(combinations.length).toBe(343)
  })

  it.each(EVENTS)('$label: admits exactly the one combination its policy names', ({ event, ref, admits }) => {
    const admitted = combinations.filter((c) => admissionVerdict({ event, ref, ...c }).admitted)
    if (admits === null) {
      expect(admitted).toEqual([])
    } else {
      expect(admitted).toEqual([admits])
    }
  })

  it('never admits a missing, empty or unrecognised result for verify or e2e, on any event', () => {
    for (const { event, ref } of EVENTS) {
      for (const absent of [undefined, '', 'neutral']) {
        for (const job of ['verify', 'e2e'] as const) {
          const input = { event, ref, verify: 'success', e2e: 'success', dependencyScope: 'skipped', [job]: absent }
          expect(admissionVerdict(input).admitted, `${event} ${job}=${String(absent)}`).toBe(false)
        }
      }
    }
  })

  it('refuses a push to main whose dependency scope reports success: the workflow changed under it', () => {
    // The push rule rests on dependency-scope being PR-only. If it ever runs on push, this
    // verdict must be re-decided with its tests, not quietly accept either reading.
    const verdict = admissionVerdict({
      event: 'push',
      ref: PRODUCTION_REF,
      verify: 'success',
      e2e: 'success',
      dependencyScope: 'success',
    })
    expect(verdict.admitted).toBe(false)
    expect(verdict.unmet).toEqual(['dependencyScope: got success, needs skipped'])
  })

  it('refuses a merge queue by policy, and says that is the reason', () => {
    const verdict = admissionVerdict({ event: 'merge_group', verify: 'success', e2e: 'success', dependencyScope: 'skipped' })
    expect(verdict).toMatchObject({ admitted: false, policy: 'none' })
    expect(verdict.reason).toMatch(/no admission policy covers the merge_group event/)
  })

  it('reads nothing but its own inputs: no pull request head, no earlier run', () => {
    // A merge commit on main has its own push run and its own verdict, however green the pull
    // request that produced it was. Anything extra passed in is ignored.
    const pushRun = { event: 'push', ref: PRODUCTION_REF, verify: 'failure', e2e: 'skipped', dependencyScope: 'skipped' }
    const withGreenPr = { ...pushRun, pullRequestHead: { verify: 'success', e2e: 'success', dependencyScope: 'success' } }
    expect(admissionVerdict(withGreenPr)).toEqual(admissionVerdict(pushRun))
    expect(admissionVerdict(pushRun).admitted).toBe(false)
  })
})

describe('the incident, replayed', () => {
  it("refuses canary #94's own pull request run: verify failed, E2E skipped behind it", () => {
    const verdict = admissionVerdict({
      event: 'pull_request',
      ref: 'refs/pull/94/merge',
      verify: 'failure',
      e2e: 'skipped',
      dependencyScope: 'success',
    })
    expect(verdict.admitted).toBe(false)
    expect(verdict.unmet).toEqual(['verify: got failure, needs success', 'e2e: got skipped, needs success'])
  })

  it("refuses main's push run after the merge: the one the production deployment came from", () => {
    const verdict = admissionVerdict({
      event: 'push',
      ref: PRODUCTION_REF,
      verify: 'failure',
      e2e: 'skipped',
      dependencyScope: 'skipped',
    })
    expect(verdict.admitted).toBe(false)
    expect(verdict.reason).toBe('push-main: verify: got failure, needs success; e2e: got skipped, needs success')
  })
})

describe('the pieces the verdict is built from', () => {
  it('normalises a result to one GitHub reports, or missing', () => {
    expect(['success', 'failure', 'cancelled', 'skipped'].map(jobResult)).toEqual([
      'success',
      'failure',
      'cancelled',
      'skipped',
    ])
    expect([undefined, null, '', 'neutral', 'SUCCESS', 1, {}].map(jobResult)).toEqual(Array(7).fill('missing'))
  })

  it('has a policy for exactly two event shapes', () => {
    expect(requiredResults('pull_request', 'refs/pull/1/merge')).not.toBeNull()
    expect(requiredResults('push', PRODUCTION_REF)).not.toBeNull()
    expect(requiredResults('push', 'refs/heads/develop')).toBeNull()
    expect(requiredResults('merge_group', PRODUCTION_REF)).toBeNull()
  })
})

describe('the runner', () => {
  const quiet = () => {}

  it('exits 0 only when admitted, and 1 otherwise', () => {
    const green = { EVENT_NAME: 'push', REF_NAME: 'refs/heads/main', VERIFY_RESULT: 'success', E2E_RESULT: 'success', SCOPE_RESULT: 'skipped' }
    expect(main(green, quiet)).toBe(0)
    expect(main({ ...green, VERIFY_RESULT: 'failure' }, quiet)).toBe(1)
    expect(main({}, quiet)).toBe(1)
  })

  it('says which job missed and why', () => {
    const lines: string[] = []
    main({ EVENT_NAME: 'pull_request', VERIFY_RESULT: 'failure', E2E_RESULT: 'skipped', SCOPE_RESULT: 'success' }, (l: string) =>
      lines.push(l),
    )
    expect(lines).toEqual([
      'REFUSED (pull_request): pull_request: verify: got failure, needs success; e2e: got skipped, needs success',
    ])
  })

  it('writes the verdict to the job summary when there is one', () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'admission-')), 'summary.md')
    main({ EVENT_NAME: 'merge_group', GITHUB_STEP_SUMMARY: summary }, quiet)
    expect(readFileSync(summary, 'utf8')).toMatch(/^### Production admission\n\nREFUSED \(none\): no admission policy/)
  })

  it('fails as a process when verify failed, which is what the job will do', () => {
    // The job's `if: always()` is what makes it run at all when verify fails; this is what it
    // then does. Spawned rather than imported, so the exit code is the one CI would see.
    const run = (extra: Record<string, string>) =>
      spawnSync(process.execPath, [join(ROOT, 'scripts/check-production-admission.mjs')], {
        // GITHUB_STEP_SUMMARY is blanked because CI sets it, and this run must not write into
        // the real job summary.
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          EVENT_NAME: 'push',
          REF_NAME: 'refs/heads/main',
          SCOPE_RESULT: 'skipped',
          ...extra,
        },
        encoding: 'utf8',
      })
    const failed = run({ VERIFY_RESULT: 'failure', E2E_RESULT: 'skipped' })
    expect(failed.status).toBe(1)
    expect(failed.stdout).toMatch(/^REFUSED \(push-main\)/)

    const passed = run({ VERIFY_RESULT: 'success', E2E_RESULT: 'success' })
    expect(passed.status).toBe(0)
    expect(passed.stdout).toMatch(/^ADMITTED \(push-main\)/)
  })
})

describe('the production-admission job in ci.yml', () => {
  const ci = read('.github/workflows/ci.yml')
  const start = ci.indexOf('\n  production-admission:\n')
  // The job runs until the next line indented two spaces: the next job's key, or the comment
  // block above it. Cutting at the key alone would read that comment as part of this job.
  const lines = ci.slice(start + 1).split('\n')
  const end = lines.findIndex((line, i) => i > 0 && /^ {2}\S/.test(line))
  const job = (end === -1 ? lines : lines.slice(0, end)).join('\n')

  it('exists', () => {
    expect(start).toBeGreaterThan(-1)
    expect(job).toContain('name: Production admission')
  })

  it('waits for all three jobs and runs whatever they reported', () => {
    expect(job).toMatch(/^ {4}needs: \[verify, e2e, dependency-scope\]$/m)
    // Not the default success(): with it, the job is skipped when verify fails, and a skipped
    // check is the reading this job exists to refuse.
    expect(job).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m)
  })

  it("passes GitHub's own readings, and nothing an author writes", () => {
    const env = Object.fromEntries(
      [...job.matchAll(/^ {10}([A-Z0-9_]+): (.+)$/gm)].map((m) => [m[1], m[2].trim()]),
    )
    expect(env).toEqual({
      EVENT_NAME: '${{ github.event_name }}',
      REF_NAME: '${{ github.ref }}',
      VERIFY_RESULT: '${{ needs.verify.result }}',
      E2E_RESULT: '${{ needs.e2e.result }}',
      SCOPE_RESULT: "${{ needs['dependency-scope'].result }}",
    })
    expect(job).toContain('run: node scripts/check-production-admission.mjs')
  })

  it('is dependency-free, so the change it judges cannot break it', () => {
    expect(job).not.toMatch(/pnpm|npm (ci|install)/)
  })

  it('rests on dependency-scope being PR-only, which is still true', () => {
    const scope = ci.slice(ci.indexOf('\n  dependency-scope:\n'), ci.indexOf('\n  e2e:\n'))
    expect(scope).toMatch(/^ {4}if: github\.event_name == 'pull_request'$/m)
  })
})

describe('the check name is unique across every workflow', () => {
  // A deployment check matches on the name. Two jobs publishing it, in any workflow, would let
  // either one satisfy it.
  const workflows = readdirSync(join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f))

  it('finds workflows to read', () => {
    expect(workflows.length).toBeGreaterThan(1)
  })

  it('publishes Production admission exactly once, from ci.yml', () => {
    const publishers = workflows.flatMap((file) =>
      parseWorkflowJobs(read(`.github/workflows/${file}`))
        .filter((j: { checkName: string }) => j.checkName === 'Production admission')
        .map((j: { id: string }) => `${file}#${j.id}`),
    )
    expect(publishers).toEqual(['ci.yml#production-admission'])
  })

  it('is the context the control registry declares', () => {
    const registry = JSON.parse(read('docs/controls.json'))
    const control = registry.controls.find((c: { id: string }) => c.id === 'production-admission')
    expect(control).toMatchObject({ context: 'Production admission', contextSource: '.github/workflows/ci.yml' })
  })
})
