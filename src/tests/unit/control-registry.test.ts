import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

import { ACCEPTED_GAP_MAX_AGE_DAYS } from '../../../scripts/lib/accepted-gap.mjs'

/**
 * **A document may not assert that a control is configured unless a probe reads that
 * configuration from its own source of truth.**
 *
 * That is the rule. `docs/controls.json` is where it is written down, and this file is
 * what makes the registry more than a second place to be wrong.
 *
 * ## Why the rule exists
 *
 * This repository has now been burned six times by a control that reported something
 * other than the truth, and the shape is identical every time:
 *
 * - [ADR 004](../../../docs/adr/004-static-fallback-is-not-a-data-source.md) — a suite
 *   running entirely against a mock while three commerce outages lived in the gap.
 * - [ADR 006](../../../docs/adr/006-controls-must-fail-loudly.md) — an `environment:`
 *   key that reads as isolation and self-creates empty.
 * - [ADR 010](../../../docs/adr/010-a-control-that-cannot-fail.md) — two piped steps
 *   structurally incapable of reporting failure.
 * - [ADR 011](../../../docs/adr/011-repeated-identical-failures-must-escalate.md) — a
 *   notification channel that said the same thing 24 times.
 * - [ADR 015](../../../docs/adr/015-a-gate-that-was-only-ever-documented.md) — five
 *   documents asserting a merge gate that has never existed.
 * - [ADR 016](../../../docs/adr/016-fit-is-a-measurement-nobody-took.md) — three checks
 *   structurally blind to a control cut off at the viewport edge.
 *
 * Each was found by a human reading code, and each was fixed in the one place it was
 * found. What none of them produced was a way to ask the question again, of everything,
 * without a human. See [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md).
 *
 * ## The invariants
 *
 * A registry entry is a claim like any other, so the entries are checked too: every
 * probe exists, every probe is actually *wired into* the workflow that supposedly runs
 * it, nothing may claim to be configured with nothing checking it, and every ADR is
 * classified as describing either a control or a decision — with no third state, which
 * is the specific hole `--sage` fell through.
 */

const ROOT = resolve(__dirname, '../../..')

interface Control {
  id: string
  claims: string
  status: 'configured' | 'not-configured'
  probe: string
  probeRunsIn: string
  selfMonitoring?: boolean
  humanAction?: string
  knownLimit?: string
  backstop?: string
  acceptedSince?: string
  acceptedWhy?: string
  adr?: string
  requiredContexts?: string[]
  contextSource?: string
}

interface Registry {
  controls: Control[]
  decisionAdrs: Record<string, string>
}

const registry: Registry = JSON.parse(readFileSync(join(ROOT, 'docs/controls.json'), 'utf8'))

describe('the registry itself is readable', () => {
  it('declares controls', () => {
    // An empty registry satisfies every per-entry assertion below. That is the shape of
    // green this whole file exists to refuse.
    expect(registry.controls.length).toBeGreaterThan(0)
  })

  it('every entry has the fields a claim needs to be checkable', () => {
    for (const control of registry.controls) {
      expect(control.id, 'a control with no id').toBeTruthy()
      expect(control.claims, `${control.id}: no claim stated`).toBeTruthy()
      expect(['configured', 'not-configured'], `${control.id}: unknown status`).toContain(
        control.status
      )
      expect(control.probe, `${control.id}: no probe`).toBeTruthy()
      expect(control.probeRunsIn, `${control.id}: nothing says where the probe runs`).toBeTruthy()
    }
  })

  it('ids are unique', () => {
    const ids = registry.controls.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('every probe exists and is wired in', () => {
  it.each(registry.controls.map((c) => [c.id, c] as const))('%s: the probe file exists', (_id, control) => {
    expect(existsSync(join(ROOT, control.probe)), `${control.probe} does not exist`).toBe(true)
  })

  it.each(registry.controls.map((c) => [c.id, c] as const))(
    '%s: the workflow it runs in exists',
    (_id, control) => {
      expect(
        existsSync(join(ROOT, control.probeRunsIn)),
        `${control.probeRunsIn} does not exist`
      ).toBe(true)
    }
  )

  it.each(registry.controls.map((c) => [c.id, c] as const))(
    '%s: that workflow can actually run',
    (_id, control) => {
      // Existing is not running. `control-audit.yml` existed, contained every probe path
      // this registry names, and was invalid YAML from the day it was written — so GitHub
      // rejected it before scheduling anything and it produced three runs with zero jobs.
      // This registry asserted three controls were probed there, two of them "configured".
      //
      // The old version of this check read the file with readFileSync and grepped it. A
      // text search cannot tell a valid document from a broken one, which is why it passed
      // for the entire life of the defect. See
      // src/tests/unit/workflow-validity.test.ts for the full account.
      if (!control.probeRunsIn.endsWith('.yml') && !control.probeRunsIn.endsWith('.yaml')) return

      const source = readFileSync(join(ROOT, control.probeRunsIn), 'utf8')
      let jobs: string[] = []
      expect(() => {
        const parsed = parse(source) as { jobs?: Record<string, unknown> }
        jobs = Object.keys(parsed?.jobs ?? {})
      }, `${control.probeRunsIn} is not valid YAML, so ${control.id}'s probe never runs`).not.toThrow()

      expect(
        jobs.length,
        `${control.probeRunsIn} defines no jobs, so ${control.id}'s probe never runs`
      ).toBeGreaterThan(0)
    }
  )

  it.each(registry.controls.map((c) => [c.id, c] as const))(
    '%s: the workflow actually runs the probe',
    (_id, control) => {
      // The gap this closes is the one `ci.yml` already fell into once: it carried
      // `fetch-depth: 0` with a comment explaining that the credential auditor required
      // it, for a script that was invoked nowhere. A probe named in a registry and
      // called by no workflow is that bug with a registry entry on top of it.
      const workflow = readFileSync(join(ROOT, control.probeRunsIn), 'utf8')

      if (control.probe.startsWith('src/tests/')) {
        // Run as part of the unit suite rather than by name.
        expect(
          workflow,
          `${control.probeRunsIn} does not run the unit suite, so ${control.probe} never executes there`
        ).toMatch(/vitest run/)
      } else if (control.probe.startsWith('e2e/')) {
        expect(
          workflow,
          `${control.probeRunsIn} does not run the E2E suite, so ${control.probe} never executes there`
        ).toMatch(/pnpm e2e|playwright test/)
      } else if (control.probe.startsWith('.github/workflows/')) {
        // The probe is the workflow — inline logic, which is itself a known limit.
        expect(control.probe).toBe(control.probeRunsIn)
      } else {
        expect(
          workflow,
          `${control.probeRunsIn} never mentions ${control.probe}. A probe nothing invokes ` +
            `is a probe that does not run, and a registry entry does not invoke it.`
        ).toContain(control.probe)
      }
    }
  )
})

describe('every probe has been pointed at a known answer', () => {
  /**
   * **A verification tool may not be registered here until a test has fed it a fixture
   * with a known answer and asserted the verdict.**
   *
   * Three probes, one week, three self-referential defects — and they did not fall evenly.
   * `probe-branch-protection.mjs` and `probe-smoke-liveness.mjs` both shipped with their
   * decisions as pure functions and fixture tests around them, and both shipped correct.
   * `probe-assertion-liveness.mjs` shipped with neither, and produced two: a sentinel
   * naming a spec that protects nothing, and a missing browser binary read as proof that
   * a mutation had been caught.
   *
   * The rule is not "write more tests". It is that a tool whose verdict cannot be
   * exercised without side effects has no known-answer test *available* to it, so the
   * question never gets asked. Extracting the decision is the requirement; the test is
   * what proves the extraction was real.
   *
   * See ADR 024.
   */
  const scriptProbes = registry.controls.filter((c) => c.probe.startsWith('scripts/'))

  it('there are script probes to check', () => {
    expect(scriptProbes.length).toBeGreaterThan(0)
  })

  it.each(scriptProbes.map((c) => [c.id, c] as const))(
    '%s: some test imports its probe directly',
    (_id, control) => {
      const testDir = join(ROOT, 'src/tests/unit')
      const importers = readdirSync(testDir).filter((file) => {
        if (!file.endsWith('.test.ts') && !file.endsWith('.test.tsx')) return false
        const source = readFileSync(join(testDir, file), 'utf8')
        // An import, not a mention. The liveness probe was named in a doc comment for a
        // week while having no test at all, which is exactly the state this rejects.
        //
        // `\\s*` after the paren because prettier wraps a long destructuring import onto
        // the next line, and without it this matched only single-line imports. It was
        // passing for probe-smoke-liveness.mjs on the strength of heartbeat-window's
        // one-line import while smoke-liveness.test.ts — the actual known-answer test —
        // went unseen. A guardrail matching source with a regex has unknown coverage
        // (ADR 007), and this is that hole inside ADR 024's own enforcement.
        return new RegExp(
          `import\\(\\s*['"\`][^'"\`]*${control.probe.replace(/[/.]/g, '\\$&')}`
        ).test(source)
      })

      expect(
        importers.length,
        `${control.id} registers ${control.probe} as a control, and no test under ` +
          `src/tests/unit imports it. A tool that has never been pointed at a known ` +
          `answer is a first draft: every probe defect this repository has found was ` +
          `found that way, and the one probe without such a test produced two of them.\n\n` +
          `Extract its verdict into a pure function and assert it against fixtures, as ` +
          `probe-branch-protection.test.ts and smoke-liveness.test.ts do.`
      ).toBeGreaterThan(0)
    }
  )
})

describe('a claim of "configured" has to be backed by something', () => {
  it.each(registry.controls.filter((c) => c.status === 'configured').map((c) => [c.id, c] as const))(
    '%s: claims configured, so its probe must run automatically',
    (_id, control) => {
      const workflow = readFileSync(join(ROOT, control.probeRunsIn), 'utf8')
      // Either it runs on every change (the gate) or on a schedule. A probe that only
      // runs when a human remembers to dispatch it is not evidence of a configured
      // control — that is ADR 006's whole finding, one level up.
      expect(
        workflow,
        `${control.probeRunsIn} has neither a pull_request/push trigger nor a schedule, ` +
          `so nothing runs ${control.id}'s probe on its own.`
      ).toMatch(/^on:[\s\S]{0,400}?(pull_request|push|schedule)/m)
    }
  )

  it('a control that is not configured says what a human must do', () => {
    for (const control of registry.controls.filter((c) => c.status === 'not-configured')) {
      expect(
        control.humanAction,
        `${control.id} is not configured and names no human action. An unassigned ` +
          `escalation is not yet escalated — ADR 012.`
      ).toBeTruthy()
    }
  })

  it('a control that cannot watch itself says so', () => {
    // Not a failure — a disclosure. ADR 006's precedent: record the known limit rather
    // than overclaim. What is forbidden is leaving the field out, because then a reader
    // cannot tell an unexamined control from a self-monitoring one.
    for (const control of registry.controls) {
      expect(
        typeof control.selfMonitoring,
        `${control.id} does not say whether it monitors itself`
      ).toBe('boolean')
      if (control.selfMonitoring === false) {
        expect(
          control.knownLimit,
          `${control.id} is not self-monitoring and states no known limit`
        ).toBeTruthy()
      }
    }
  })
})

/**
 * How long an accepted gap may sit before someone has to say so again.
 *
 * Not a deadline for fixing it — a deadline for *re-deciding* it. Both open gaps are
 * console actions this repository cannot perform, and a check that failed until a human
 * changed a GitHub setting would be a permanent red suite, which is the ADR 008 trade in
 * reverse.
 *
 * Imported rather than declared, because it is no longer only this file's business:
 * `probe-branch-protection.mjs` reads the same threshold to decide whether an absent merge
 * gate has gone from *accepted* to *forgotten*. Two copies of a number that must agree is
 * the shape `api-version.mjs` and `cacheTags.ts` both exist to prevent, and this file is
 * the last place that should be reintroducing it.
 *
 * It also matters that the two sides disagree about *venue*, not about the number: this
 * assertion runs inside the merge gate, which is exactly the control that does not exist,
 * so the probe's issue is the copy of this deadline that can actually be enforced.
 */

/** Cadences a human backstop may name. A cadence nobody could keep is not a backstop. */
const HUMAN_CADENCES = ['per-pull-request', 'daily', 'weekly', 'monthly']

describe('the chain of backstops ends at a person', () => {
  /**
   * Every tier in this repository is code checked by other code in this repository, and
   * that chain cannot have a self-supporting bottom rung. `control-audit.yml` is the
   * proof: the workflow that watches every other control was invalid YAML from the commit
   * that created it, produced three runs with zero jobs, and **nothing here noticed**. A
   * human reading the Actions tab did.
   *
   * ADR 022 conceded that the audit cannot detect its own death and left it there. This
   * says where the regress stops instead, and refuses to let anyone pretend otherwise.
   */
  it('every control names a backstop', () => {
    for (const control of registry.controls) {
      expect(
        control.backstop,
        `${control.id} does not say what catches its own failure. Name either ` +
          `control:<id> or human:<cadence> — and if the honest answer is "nothing", that ` +
          `is what human:<cadence> is for.`
      ).toBeTruthy()
    }
  })

  it('every backstop is well-formed', () => {
    for (const control of registry.controls) {
      const backstop = control.backstop ?? ''
      const isControl = backstop.startsWith('control:')
      const isHuman = backstop.startsWith('human:')
      expect(
        isControl || isHuman,
        `${control.id}: backstop "${backstop}" is neither control:<id> nor human:<cadence>`
      ).toBe(true)

      if (isControl) {
        const target = backstop.slice('control:'.length)
        expect(
          registry.controls.map((c) => c.id),
          `${control.id} is backstopped by "${target}", which is not a control`
        ).toContain(target)
      }
      if (isHuman) {
        expect(
          HUMAN_CADENCES,
          `${control.id}: "${backstop.slice('human:'.length)}" is not a cadence anyone keeps`
        ).toContain(backstop.slice('human:'.length))
      }
    }
  })

  it.each(registry.controls.map((c) => [c.id, c] as const))(
    '%s: following its backstops reaches a person',
    (_id, control) => {
      const seen: string[] = []
      let current: Control | undefined = control

      while (current) {
        if (seen.includes(current.id)) {
          expect.fail(
            `The backstop chain from ${control.id} cycles: ${[...seen, current.id].join(' → ')}.\n\n` +
              `Two controls backstopping each other is a chain with no bottom — each one ` +
              `is "covered" by something that is itself covered by nothing.`
          )
        }
        seen.push(current.id)

        const backstop: string = current.backstop ?? ''
        if (backstop.startsWith('human:')) return // reached the floor

        const nextId: string = backstop.slice('control:'.length)
        current = registry.controls.find((c) => c.id === nextId)
      }

      expect.fail(`The backstop chain from ${control.id} runs out without reaching a person`)
    }
  )

  it('the human backstop is a document someone can actually follow', () => {
    // A cadence with no checklist is an intention. The floor has to be executable by a
    // person in a few minutes, or it is the same confession ADR 022 already made.
    expect(
      existsSync(join(ROOT, 'docs/weekly-verification.md')),
      'docs/weekly-verification.md is missing, so "human:weekly" points at nothing'
    ).toBe(true)
  })
})

describe('an accepted gap expires rather than decaying', () => {
  const accepted = registry.controls.filter((c) => c.status === 'not-configured')

  it('there are gaps to check', () => {
    // If this ever hits zero, both console actions are done — delete this block rather
    // than letting it pass over an empty set.
    expect(accepted.length).toBeGreaterThan(0)
  })

  it.each(accepted.map((c) => [c.id, c] as const))('%s: records when and why', (_id, control) => {
    expect(control.acceptedSince, `${control.id} does not say when its gap was accepted`).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    )
    expect(
      (control.acceptedWhy ?? '').length,
      `${control.id}: the reason is too short to be one`
    ).toBeGreaterThan(40)
  })

  it.each(accepted.map((c) => [c.id, c] as const))(
    '%s: the acceptance has been restated recently enough',
    (_id, control) => {
      const days = Math.floor(
        (Date.now() - new Date(control.acceptedSince ?? 0).getTime()) / 86_400_000
      )
      expect(
        days,
        `${control.id}'s gap was accepted ${days} days ago, over the ` +
          `${ACCEPTED_GAP_MAX_AGE_DAYS}-day limit.\n\n` +
          `This is not a deadline for fixing it — it is a deadline for deciding again. ` +
          `Either close the gap, or update acceptedSince and acceptedWhy to say it is ` +
          `still a deliberate choice. "Accepted" that nobody restates is indistinguishable ` +
          `from "forgotten", and the probe stays quiet either way.\n\n` +
          `${control.humanAction ?? ''}`
      ).toBeLessThanOrEqual(ACCEPTED_GAP_MAX_AGE_DAYS)
    }
  )
})

describe('every ADR is classified', () => {
  const adrFiles = readdirSync(join(ROOT, 'docs/adr'))
    .filter((f) => /^\d{3}-.*\.md$/.test(f))
    .map((f) => `docs/adr/${f}`)
    .sort()

  it('finds ADRs to classify', () => {
    expect(adrFiles.length).toBeGreaterThan(0)
  })

  it.each(adrFiles)('%s is either a control or a stated decision', (adr) => {
    const isControl = registry.controls.some((c) => c.adr === adr)
    const isDecision = adr in registry.decisionAdrs

    expect(
      isControl || isDecision,
      `${adr} appears in neither the controls list nor decisionAdrs in docs/controls.json.\n\n` +
        `Classify it. If it describes a mechanism whose absence would not be visible from ` +
        `the thing it protects, add a control entry naming the probe that proves it. If it ` +
        `records reasoning that is wrong out loud when violated, add it to decisionAdrs with ` +
        `that reason.\n\n` +
        `There is no third option, because "unclassified" is how --sage shipped as 9-13px ` +
        `text at 1.97:1 and how a merge gate nothing enforced was asserted by five documents.`
    ).toBe(true)

    // Both would mean two answers to one question, which is how a reader ends up
    // trusting whichever they found first.
    expect(isControl && isDecision, `${adr} is classified twice`).toBe(false)
  })

  it('every ADR a control points at exists', () => {
    for (const control of registry.controls) {
      if (!control.adr) continue
      expect(existsSync(join(ROOT, control.adr)), `${control.adr} does not exist`).toBe(true)
    }
  })

  it('every decisionAdrs key exists and carries a reason', () => {
    for (const [adr, reason] of Object.entries(registry.decisionAdrs)) {
      expect(existsSync(join(ROOT, adr)), `${adr} does not exist`).toBe(true)
      expect(reason.length, `${adr}: the reason is too short to be one`).toBeGreaterThan(20)
    }
  })
})
