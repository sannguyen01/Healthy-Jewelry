import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
