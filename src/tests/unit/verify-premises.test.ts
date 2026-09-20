import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { collectPremises, RETIRED_PREMISE_IDS } = await import(
  '../../../scripts/verify-premises.mjs'
)
const { apiVersionPremise } = await import('../../../scripts/lib/premise-checks.mjs')
const { SHOPIFY_API_VERSION, API_VERSION_ACCESSIBLE_UNTIL } = await import(
  '../../../scripts/lib/api-version.mjs'
)

/**
 * **The premise collector, pointed at known answers.**
 *
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): of three
 * probes written in one week, every defect landed in the one whose decision was tangled
 * with I/O and therefore had no fixture test. `docs/controls.json` enforces the lesson as a
 * rule — a registered probe must be imported directly by some test — and it refused this
 * one until this file existed, which is the rule working.
 *
 * ## What is under test, and what is not
 *
 * `scripts/lib/premise-checks.mjs` owns whether `apiVersionPremise` classifies a date
 * correctly, and `premise-checks.test.ts` exercises that at length. This file owns the
 * narrower question the collector introduced: **which premises are still asked at all**.
 *
 * That question is the whole reason this script exists. Premise evaluation used to sit at
 * the bottom of `verify-production.mjs`, and five of its six premises took Shopify data as
 * input. Deleting that script would have taken the sixth with it — and the workflow's
 * reporting step returns early on a *missing* `premise-drift.json`, so the channel would
 * have gone quiet while looking healthy. That is exactly the shape
 * [ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md) names.
 */

describe('the collector asks the premises that can still be asked', () => {
  it('collects exactly one premise', () => {
    // Pinned rather than bounded, in both directions. A rise means a premise was added
    // without being recorded here; a fall means one quietly stopped being evaluated, which
    // is the failure this file exists to make visible.
    expect(collectPremises()).toHaveLength(1)
  })

  it('and it is the pinned API version', () => {
    expect(collectPremises()[0].id).toBe('SHOPIFY-API-VERSION')
  })

  it('names the five it retired, so their removal is a record rather than an absence', () => {
    expect([...RETIRED_PREMISE_IDS].sort()).toEqual([
      'SHOPIFY-COLLECTION-SET',
      'SHOPIFY-I18N',
      'SHOPIFY-PAYMENTS',
      'SHOPIFY-SPEC-METAFIELD',
      'SHOPIFY-WEBHOOK-DELIVERY',
    ])
  })

  it('no retired id is also collected', () => {
    // The two lists must be disjoint. An id in both would mean a premise documented as
    // retired is still being reported, which reads as a resurrection nobody decided on.
    const collected = collectPremises().map((p: { id: string }) => p.id)
    for (const retired of RETIRED_PREMISE_IDS) {
      expect(collected, `${retired} is listed as retired and still collected`).not.toContain(
        retired
      )
    }
  })

  it('every collected premise carries the fields the reporting step renders', () => {
    // The workflow's issue body interpolates `id`, `kind`, `detail` and `decision`. A
    // premise missing one renders "undefined" into a GitHub issue.
    for (const premise of collectPremises()) {
      expect(premise.id).toBeTruthy()
      expect(premise.kind).toBeTruthy()
      expect(premise.detail).toBeTruthy()
      expect(premise.decision).toBeTruthy()
      expect(typeof premise.holds).toBe('boolean')
    }
  })
})

describe('the premise still answers correctly at the dates that matter', () => {
  const RELEASE = new Date(`${SHOPIFY_API_VERSION}-01T00:00:00Z`)
  const DEADLINE = new Date(API_VERSION_ACCESSIBLE_UNTIL)
  const day = 24 * 60 * 60 * 1000

  it('holds shortly after the version is released', () => {
    expect(apiVersionPremise(new Date(RELEASE.getTime() + day)).holds).toBe(true)
  })

  it('does not hold the day after the version stops being served', () => {
    // The known answer. Shopify does not reject a retired version — it falls forward
    // silently, which is how this project stayed pinned to an unserved API for roughly
    // seven months (ADR 009).
    const after = apiVersionPremise(new Date(DEADLINE.getTime() + day))
    expect(after.holds).toBe(false)
    expect(after.detail).toMatch(/stopped being served/i)
  })

  it('is an opportunity, never a failure', () => {
    // A drifted premise means a decision is stale, not that the site is broken. Turning a
    // scheduled run red for an opportunity is how a channel becomes noise nobody reads.
    expect(apiVersionPremise(new Date(DEADLINE.getTime() + day)).kind).toBe('opportunity')
  })
})

describe('the script itself', () => {
  const source = readFileSync(join(process.cwd(), 'scripts/verify-premises.mjs'), 'utf8')

  it('writes premise-drift.json unconditionally', () => {
    // The distinction the reporting step depends on: an **empty array** means "all
    // premises hold again" and closes an open issue, while a **missing file** means
    // "premises could not be evaluated" and returns early. Writing only on drift would
    // collapse the first case into the second and leave a stale issue open forever.
    const line = source
      .split('\n')
      .find((l) => l.includes("writeFileSync('premise-drift.json'"))
    expect(line, 'nothing writes premise-drift.json').toBeDefined()

    // Indentation as the test for nesting. The write must sit at `main()`'s own level —
    // two spaces — not inside a branch. Reading the surrounding characters instead would
    // catch the module guard at the bottom of the file and fail for the wrong reason,
    // which is what the first draft of this assertion did.
    expect(
      line,
      'the write is nested inside a branch. An empty drift list must still produce a file: ' +
        'the reporting step closes an open issue on an empty array and returns early on a ' +
        'missing one, so collapsing the first into the second leaves a stale issue open.'
    ).toMatch(/^ {2}writeFileSync/)
  })

  it('exits 0, so a drifted premise never fails the run', () => {
    expect(source).toMatch(/return 0/)
    expect(source).not.toMatch(/return 1|process\.exit\(1\)/)
  })

  it('is guarded against running on import', () => {
    // This very file imports it. Without the guard, importing the module would write a
    // file into the repository root during the unit run.
    expect(source).toContain('if (import.meta.url === `file://${process.argv[1]}`)')
  })

  it('is named in the workflow that runs it', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/production-smoke.yml'),
      'utf8'
    )
    expect(
      workflow,
      'verify-premises.mjs is registered as a control but no workflow invokes it. A probe ' +
        'nothing runs is a probe that does not run, and a registry entry does not invoke it.'
    ).toContain('node scripts/verify-premises.mjs')
  })
})
