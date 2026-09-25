import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const { SENTINELS } = await import('../../../scripts/lib/sentinels.mjs')

interface Sentinel {
  id: string
  runner: string
  specs: string[]
  invariant: string
  scar: string
}

const sentinels = SENTINELS as Sentinel[]

/**
 * **Three documents named a number of sentinels. None of them named the right one.**
 *
 * On 2026-09-21 `scripts/lib/sentinels.mjs` declared **13** sentinels — 11 with a vitest
 * runner, 2 with a Playwright one. `docs/controls.json` said the control covered
 * *"seventeen named invariants"*. The `control-audit.yml` job summary printed
 * *"Assertion liveness (12 sentinels)"*. Nothing compared any of the three to the source,
 * so all three were free to drift, and two of them had.
 *
 * That is not a cosmetic disagreement. `probe-accepted-gap.mjs` and the weekly human
 * backstop both read `docs/controls.json` to decide whether a control is worth trusting,
 * and a registry claiming seventeen where eleven run is a claim of coverage that does not
 * exist. It is the same failure `doc-numeric-claims.test.ts` was written for — a number in
 * prose is a claim like any other — reaching two files that sweep does not cover, because
 * one is JSON and the other is YAML.
 *
 * Both counts are asserted because they answer different questions. The registry claims
 * what the control *covers*; the job summary labels what that scheduled step *evaluated*,
 * and the step deliberately runs vitest sentinels only — the two Playwright ones each need
 * a production build, and `--with-e2e` is a by-hand invocation.
 */
describe('the sentinel inventory and the documents that count it', () => {
  const vitest = sentinels.filter((s) => s.runner === 'vitest')
  const playwright = sentinels.filter((s) => s.runner === 'playwright')

  it('has sentinels to count', () => {
    // The guard on the guard. Every assertion below compares two numbers, and comparing
    // zero to zero passes (ADR 020).
    expect(sentinels.length).toBeGreaterThan(5)
    expect(vitest.length).toBeGreaterThan(0)
    expect(playwright.length).toBeGreaterThan(0)
    expect(vitest.length + playwright.length).toBe(sentinels.length)
  })

  it('gives every sentinel a unique id', () => {
    const ids = sentinels.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every sentinel the fields the probe reports with', () => {
    // A sentinel that fires with no `scar` produces a finding a reader cannot weigh:
    // "this test cannot fail" without "and here is what it failed to catch once".
    for (const s of sentinels) {
      expect(s.invariant?.length, `${s.id} has no invariant`).toBeGreaterThan(10)
      expect(s.scar?.length, `${s.id} has no scar`).toBeGreaterThan(10)
      expect(s.specs?.length, `${s.id} names no specs`).toBeGreaterThan(0)
    }
  })

  it('is counted correctly by the control registry', () => {
    const registry = JSON.parse(read('docs/controls.json'))
    const control = registry.controls.find(
      (c: { id: string }) => c.id === 'assertion-liveness',
    )
    expect(control, 'docs/controls.json has no assertion-liveness control').toBeDefined()

    // The claim names the whole declared set, which is what the control covers.
    expect(
      control.claims,
      `assertion-liveness claims a different number than the ${sentinels.length} sentinels declared`,
    ).toContain(`${sentinels.length} named invariants`)
  })

  it('is counted correctly by the control-audit job summary', () => {
    const workflow = read('.github/workflows/control-audit.yml')

    // The label names what that step evaluates, not what the set contains. Writing the
    // full 13 there would overstate a scheduled run by two.
    expect(
      workflow,
      `the control-audit summary label disagrees with the ${vitest.length} vitest sentinels`,
    ).toContain(`Assertion liveness (${vitest.length} vitest sentinels)`)
  })

  it('runs the scheduled probe without --with-e2e, which is what makes that label right', () => {
    // The join between the two assertions above. If the step ever passed `--with-e2e`,
    // the vitest-only count would silently become the wrong label for it.
    const workflow = read('.github/workflows/control-audit.yml')
    const step = workflow.slice(workflow.indexOf('probe-assertion-liveness.mjs'))
    expect(step.slice(0, 120)).not.toContain('--with-e2e')
  })
})

/**
 * **The probe's own precondition, which darkened it for every scheduled run.**
 *
 * `assertCleanTree` refuses on a dirty working tree, because the probe mutates tracked
 * source and restores it. Correct — and it read `git status --porcelain` whole, which lists
 * untracked files as `?? path`.
 *
 * Every step above it in `control-audit.yml` pipes its probe through `tee <name>.log` into
 * the workspace root. So `merge-gate.log` and `accepted-gap.log` existed by the time this
 * one started, porcelain was non-empty, and the probe threw before mutating anything — on
 * every scheduled run, surfacing as one `failure` cell in a job summary while
 * `continue-on-error: true` kept the job green.
 *
 * Asserted here rather than left to the probe, because the probe cannot test its own
 * refusal without a dirty tree to refuse.
 */
describe('the liveness probe refuses a dirty tree, not a dirty directory', () => {
  const source = read('scripts/probe-assertion-liveness.mjs')

  it('filters untracked entries out of the status it judges', () => {
    expect(source).toContain("!line.startsWith('??')")
  })

  it('still refuses on a tracked modification', () => {
    // The filter must drop `??` lines only. A blanket "ignore everything" would turn the
    // safety guard into a comment, and this probe overwrites tracked source files.
    expect(source).toContain("if (status.trim() !== '') {")
    expect(source).toContain('The working tree has uncommitted changes.')
  })

  it('is exercised by a workflow that writes untracked logs before it runs', () => {
    // The join. If those `tee` steps ever moved after this one, the filter would still be
    // right but the scar above would stop being the reason — and a reader deleting it
    // would reintroduce the defect.
    const workflow = read('.github/workflows/control-audit.yml')
    const teeIndex = workflow.indexOf('tee merge-gate.log')
    const probeIndex = workflow.indexOf('probe-assertion-liveness.mjs')

    expect(teeIndex).toBeGreaterThan(-1)
    expect(probeIndex).toBeGreaterThan(teeIndex)
  })
})
