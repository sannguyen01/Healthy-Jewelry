import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { collectPremises, RETIRED_PREMISES, answer } = await import(
  '../../../scripts/verify-premises.mjs'
)

/**
 * **The premise collector, pointed at known answers.**
 *
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): a registered
 * probe must be imported directly by some test, and this is that test for
 * `scripts/verify-premises.mjs`.
 *
 * ## What is under test, and what is not
 *
 * `premise-checks.test.ts` owns whether the checkout-hostname premise classifies a DNS
 * answer correctly. This file owns the narrower question the collector introduced: **which
 * premises are still asked at all**, and whether the collector turns a resolver's behaviour
 * into the right input — including when the resolver throws.
 *
 * That question is the whole reason this script exists. When `scripts/lib/api-version.mjs`
 * went, the collector's one remaining premise went with it, and a collector of nothing
 * writes `[]` on every run — which the reporting step reads as "all premises hold again".
 * [ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)'s vacuous green, in the
 * one channel built to notice stale decisions.
 */

const { VENDOR_DOMAINS } = await import('../../../scripts/lib/browse-only.mjs')

const APEX = 'healthyjewellery.com'
const VENDOR_SHOPS_HOST = `shops.${VENDOR_DOMAINS[0]}`

type Answer = string[] | { code: string }

/** A resolver that answers from a table and never touches the network. */
function resolver(table: { ns: Answer; cname: Answer }) {
  const reply = (value: Answer) =>
    Array.isArray(value)
      ? Promise.resolve(value)
      : Promise.reject(Object.assign(new Error(value.code), { code: value.code }))
  const asked: string[] = []
  return {
    asked,
    resolveNs: (host: string) => (asked.push(`NS ${host}`), reply(table.ns)),
    resolveCname: (host: string) => (asked.push(`CNAME ${host}`), reply(table.cname)),
  }
}

describe('the collector asks the premises that can still be asked', () => {
  it('collects exactly one premise, and it is the checkout hostname', async () => {
    // Pinned rather than bounded, in both directions. A rise means a premise was added
    // without being recorded here; a fall to zero is the vacuous detector this replaced.
    const premises = await collectPremises({
      apex: APEX,
      resolver: resolver({ ns: ['ns1.vercel-dns.com'], cname: [VENDOR_SHOPS_HOST] }),
    })
    expect(premises).toHaveLength(1)
    expect(premises[0].id).toBe('CHECKOUT-HOST-CNAME')
    expect(premises[0].holds).toBe(true)
  })

  it('asks about checkout.<apex>, with the apex NS lookup as its control', async () => {
    const r = resolver({ ns: ['ns1.vercel-dns.com'], cname: [VENDOR_SHOPS_HOST] })
    await collectPremises({ apex: APEX, resolver: r })
    expect(r.asked).toEqual([`NS ${APEX}`, `CNAME checkout.${APEX}`])
  })

  it('turns a rejected lookup into data carrying its code, not an exception', async () => {
    const premises = await collectPremises({
      apex: APEX,
      resolver: resolver({ ns: ['ns1.vercel-dns.com'], cname: { code: 'ENOTFOUND' } }),
    })
    expect(premises[0].evaluable).toBe(true)
    expect(premises[0].holds).toBe(false)
  })

  it('reports a dead resolver as unevaluable, not as drift', async () => {
    // The sandbox case, and the one CI must never mistake for a DNS change.
    const premises = await collectPremises({
      apex: APEX,
      resolver: resolver({ ns: { code: 'ECONNREFUSED' }, cname: { code: 'ECONNREFUSED' } }),
    })
    expect(premises[0].evaluable).toBe(false)
  })

  it('reports a missing apex as unevaluable rather than dropping the premise', async () => {
    // An omitted premise and a holding one look identical in the list.
    const premises = await collectPremises({ apex: null })
    expect(premises).toHaveLength(1)
    expect(premises[0].evaluable).toBe(false)
  })

  it('answer() never throws, and keeps the code', async () => {
    const failed = await answer(() => Promise.reject(Object.assign(new Error('x'), { code: 'ESERVFAIL' })))
    expect(failed).toEqual({ ok: false, code: 'ESERVFAIL' })
    expect(await answer(() => Promise.resolve(['a.example']))).toEqual({ ok: true, records: ['a.example'] })
  })

  it('names the six it retired, and who retired each', () => {
    expect(RETIRED_PREMISES.map((p: { id: string }) => p.id).sort()).toEqual([
      'SHOPIFY-API-VERSION',
      'SHOPIFY-COLLECTION-SET',
      'SHOPIFY-I18N',
      'SHOPIFY-PAYMENTS',
      'SHOPIFY-SPEC-METAFIELD',
      'SHOPIFY-WEBHOOK-DELIVERY',
    ])
    for (const p of RETIRED_PREMISES) expect(['WS-6', 'WS-C']).toContain(p.retiredBy)
  })

  it('no retired id is also collected', async () => {
    const collected = (await collectPremises({ apex: null })).map((p: { id: string }) => p.id)
    for (const { id } of RETIRED_PREMISES) {
      expect(collected, `${id} is listed as retired and still collected`).not.toContain(id)
    }
  })

  it('every collected premise carries the fields the reporting step renders', async () => {
    // The workflow's issue body interpolates `id`, `kind`, `detail` and `decision`. A
    // premise missing one renders "undefined" into a GitHub issue.
    for (const premise of await collectPremises({ apex: null })) {
      expect(premise.id).toBeTruthy()
      expect(premise.kind).toBeTruthy()
      expect(premise.detail).toBeTruthy()
      expect(premise.decision).toBeTruthy()
      expect(typeof premise.holds).toBe('boolean')
      expect(typeof premise.evaluable).toBe('boolean')
    }
  })
})

describe('the script itself', () => {
  const source = readFileSync(join(process.cwd(), 'scripts/verify-premises.mjs'), 'utf8')

  it('decides what to write through driftFileContent, where a test can reach it', () => {
    // The three-way contract with the reporting step — non-empty opens, empty closes,
    // missing returns early — is asserted in premise-checks.test.ts against the decision.
    // This pins that the script actually routes its write through that decision.
    expect(source).toContain('const content = driftFileContent(premises)')
    expect(source).toContain(
      "if (content !== null) writeFileSync('premise-drift.json', JSON.stringify(content, null, 2))"
    )
  })

  it('exits 0, so a drifted premise never fails the run', () => {
    expect(source).toMatch(/return 0/)
    expect(source).not.toMatch(/return 1|process\.exit\(1\)/)
  })

  it('is guarded against running on import, through symlinks and encoded paths', () => {
    // This very file imports it. Without the guard, importing the module would resolve DNS
    // and write a file into the repository root during the unit run.
    expect(source).toContain('pathToFileURL(realpathSync(process.argv[1])).href')
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
