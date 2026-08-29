import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { classifyProbeResult } = await import('../../../scripts/probe-assertion-liveness.mjs')
const { SENTINELS } = await import('../../../scripts/lib/sentinels.mjs')

/**
 * **The mutation probe's verdict, pointed at known answers.**
 *
 * ## Why this file exists
 *
 * `probe-assertion-liveness.mjs` shipped two defects in one week:
 *
 * 1. A sentinel named `webhook-signature-contract.test.ts` as the spec protecting the
 *    HMAC invariant. That file's only relevant assertion compares the header against the
 *    same function that produced it, so it protects the invariant not at all — the probe
 *    correctly reported `dead`, and the finding was that the *sentinel* was wrong.
 * 2. On a machine missing the pinned `chrome-headless-shell` build, every Playwright run
 *    fails at browser launch. The probe read those failures as "the mutation was caught"
 *    and reported two sentinels alive, **having measured nothing**.
 *
 * Both were found by pointing the tool at an answer that was already known. Neither would
 * have survived a single fixture-based test — and this probe had **none**, while the two
 * probes that did (`verdict` in probe-branch-protection, `assessLiveness` in
 * probe-smoke-liveness) shipped clean.
 *
 * The difference was structural: their decisions were pure functions, and this one's was
 * tangled with filesystem and subprocess work, so there was nothing to test without
 * mutating a real file and running a real suite. `classifyProbeResult` is that decision,
 * extracted. See [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md).
 */

const green = { failed: false, exitCode: 0 }
const red = { failed: true, exitCode: 1 }

describe('the mutation was caught', () => {
  it('a green baseline and a red mutation means alive', () => {
    // The only combination that proves anything positive: the tests passed, then the
    // invariant broke, then they failed. Both halves are required.
    expect(classifyProbeResult({ occurrences: 1, baseline: green, mutated: red }).state).toBe(
      'alive'
    )
  })

  it('carries the exit code through, for the report', () => {
    const result = classifyProbeResult({
      occurrences: 1,
      baseline: green,
      mutated: { failed: true, exitCode: 2 },
    })
    expect(result.exitCode).toBe(2)
  })

  it('records when the build caught it rather than a test', () => {
    // A mutation that breaks `next build` is still something going red, which is what
    // the probe asks — but a reader should be able to tell which.
    const result = classifyProbeResult({
      occurrences: 1,
      baseline: green,
      mutated: { failed: true, exitCode: 1, viaBuild: true },
    })
    expect(result.state).toBe('alive')
    expect(result.viaBuild).toBe(true)
  })
})

describe('the mutation was not caught', () => {
  it('a green baseline and a green mutation means dead', () => {
    // The finding. The code was broken on purpose and the tests protecting it did not
    // notice: they execute it and depend on nothing.
    expect(classifyProbeResult({ occurrences: 1, baseline: green, mutated: green }).state).toBe(
      'dead'
    )
  })

  it('dead is the only state that indicts a test', () => {
    // The other three are findings about the probe or the environment. Conflating any of
    // them with `dead` is a false accusation against a test that may be perfectly alive.
    const states = [
      classifyProbeResult({ occurrences: 0, baseline: null, mutated: null }).state,
      classifyProbeResult({ occurrences: 2, baseline: null, mutated: null }).state,
      classifyProbeResult({ occurrences: 1, baseline: red, mutated: null }).state,
    ]
    expect(states).not.toContain('dead')
    expect(states).not.toContain('alive')
  })
})

describe('the mutation could not be applied', () => {
  it('an anchor that matches nothing is unapplicable', () => {
    expect(classifyProbeResult({ occurrences: 0, baseline: null, mutated: null }).state).toBe(
      'unapplicable'
    )
  })

  it('an anchor that matches twice is unapplicable', () => {
    // Ambiguous is as useless as absent: replacing the first of two occurrences mutates
    // something other than what the sentinel meant.
    expect(classifyProbeResult({ occurrences: 2, baseline: null, mutated: null }).state).toBe(
      'unapplicable'
    )
  })
})

describe('the result could not be evaluated', () => {
  it('an already-failing baseline is unevaluable, never alive', () => {
    // The exact defect. A missing browser binary makes every Playwright run fail, and the
    // first version of this probe read that as the mutation being caught. It reported the
    // answer it wanted and had measured nothing.
    expect(classifyProbeResult({ occurrences: 1, baseline: red, mutated: red }).state).toBe(
      'unevaluable'
    )
  })

  it('is unevaluable even when the mutated run also fails', () => {
    // The subtle half: both runs red looks exactly like a caught mutation from the
    // outside. Only the baseline distinguishes them.
    const wouldHaveBeenAlive = classifyProbeResult({
      occurrences: 1,
      baseline: red,
      mutated: red,
    })
    expect(wouldHaveBeenAlive.state).not.toBe('alive')
  })

  it('a missing baseline is unevaluable rather than assumed green', () => {
    expect(classifyProbeResult({ occurrences: 1, baseline: null, mutated: red }).state).toBe(
      'unevaluable'
    )
  })
})

describe('every sentinel still anchors to exactly one place', () => {
  // The registry half of the same question. A sentinel whose anchor has moved reports
  // `unapplicable` at runtime — correct, but only visible on the weekly schedule. Here it
  // is visible in the fast gate, which is where a refactor that moved it will be noticed.
  const ROOT = resolve(__dirname, '../../..')

  it.each(SENTINELS.map((s: { id: string; file: string; find: string }) => [s.id, s] as const))(
    '%s',
    (_id, sentinel) => {
      const source = readFileSync(join(ROOT, sentinel.file), 'utf8')
      const occurrences = source.split(sentinel.find).length - 1
      expect(
        occurrences,
        `${sentinel.id}: its anchor occurs ${occurrences} times in ${sentinel.file}, not ` +
          `once. The probe will report this unapplicable and measure nothing — update the ` +
          `sentinel to match where the code moved to.`
      ).toBe(1)
    }
  )

  it('the sentinel set has not quietly shrunk', () => {
    expect(SENTINELS.length).toBeGreaterThanOrEqual(12)
  })
})
