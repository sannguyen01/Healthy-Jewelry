import { describe, it, expect } from 'vitest'

const { checkoutHostPremise, driftFileContent, formatPremises, DNS_ANSWER_CODES } = await import(
  '../../../scripts/lib/premise-checks.mjs'
)

/**
 * **Every state of the premise, pointed at known answers.**
 *
 * The drifted branch is the one that never runs locally, so it is the one most likely to be
 * wrong the day it finally fires. A detector that has only ever been observed saying "fine"
 * is not a detector (ADR 008, ADR 024).
 *
 * The six premises this file used to exercise are gone with their subjects — five with the
 * store's read path in WS-6, the API-version clock with `scripts/lib/api-version.mjs` in
 * WS-C. `verify-premises.test.ts` records their ids. What is tested here is the one premise
 * founded in their place, and the third state none of them ever needed: *could not ask*.
 */

interface Premise {
  id: string
  decision: string
  holds: boolean
  evaluable: boolean
  detail: string
  kind: 'blocking' | 'opportunity'
}

const { VENDOR_DOMAINS } = await import('../../../scripts/lib/browse-only.mjs')

const HOST = 'checkout.healthyjewellery.com'
const CONTROL_OK = { ok: true, records: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] }
/**
 * The vendor's shops host, built from the one list that defines the vendor's domains
 * (`browse-only.mjs`, the contract's `negative-control` for exactly this) rather than typed
 * here as a second copy.
 */
const VENDOR_SHOPS_HOST = `shops.${VENDOR_DOMAINS[0]}`

const premise = (cname: object, control: object = CONTROL_OK): Premise =>
  checkoutHostPremise({ host: HOST, cname, control }) as Premise

describe('CHECKOUT-HOST-CNAME — the premise the WS-E clock rests on', () => {
  it('holds while the hostname still CNAMEs to the vendor', () => {
    const p = premise({ ok: true, records: [VENDOR_SHOPS_HOST] })
    expect(p.id).toBe('CHECKOUT-HOST-CNAME')
    expect(p.evaluable).toBe(true)
    expect(p.holds).toBe(true)
    expect(p.detail).toContain(VENDOR_SHOPS_HOST)
  })

  it('tolerates the trailing root dot a resolver may return', () => {
    expect(premise({ ok: true, records: [`${VENDOR_SHOPS_HOST}.`] }).holds).toBe(true)
  })

  it('drifts when the hostname resolves somewhere else', () => {
    // Somebody changed DNS outside the plan. Named, because the target is the finding.
    const p = premise({ ok: true, records: ['cname.vercel-dns.com'] })
    expect(p.evaluable).toBe(true)
    expect(p.holds).toBe(false)
    expect(p.detail).toContain('cname.vercel-dns.com')
    expect(p.detail).toMatch(/outside the plan/)
  })

  it('does not accept a lookalike as the vendor', () => {
    // Label-anchored: a name that merely contains the vendor's domain is somebody else's.
    const p = premise({ ok: true, records: [`${VENDOR_SHOPS_HOST}.attacker.example`] })
    expect(p.holds).toBe(false)
  })

  it('drifts on NXDOMAIN — the name was deleted outside the plan', () => {
    const p = premise({ ok: false, code: 'ENOTFOUND' })
    expect(p.evaluable).toBe(true)
    expect(p.holds).toBe(false)
    expect(p.detail).toMatch(/NXDOMAIN/)
  })

  it('drifts on ENODATA — the name is now an address record, not an alias', () => {
    const p = premise({ ok: false, code: 'ENODATA' })
    expect(p.evaluable).toBe(true)
    expect(p.holds).toBe(false)
    expect(p.detail).toMatch(/no longer a CNAME/)
  })

  it.each(['ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED', 'EREFUSED', 'SOMETHING-NEW'])(
    '%s is the resolver failing, never drift',
    (code) => {
      // The unsafe direction for a premise is inventing drift out of a broken resolver: a
      // `premise-drift` issue claiming DNS changed, filed because a runner timed out.
      const p = premise({ ok: false, code })
      expect(p.evaluable).toBe(false)
      expect(p.detail).toContain(code)
      expect(p.detail).toMatch(/not evidence that DNS changed/)
    }
  )

  it('is unevaluable when the control lookup fails, whatever the checkout answer says', () => {
    // A resolver that answers NXDOMAIN for everything would otherwise read as "the checkout
    // hostname was deleted". The apex's own NS records are the control.
    const p = premise({ ok: false, code: 'ENOTFOUND' }, { ok: false, code: 'ENOTFOUND' })
    expect(p.evaluable).toBe(false)
    expect(p.detail).toMatch(/control lookup/)
    expect(p.detail).toMatch(/This is not drift/)
  })

  it('is unevaluable when the control answered with nothing', () => {
    expect(premise({ ok: true, records: [VENDOR_SHOPS_HOST] }, { ok: true, records: [] }).evaluable).toBe(false)
  })

  it('treats exactly NXDOMAIN and ENODATA as answers', () => {
    expect([...DNS_ANSWER_CODES].sort()).toEqual(['ENODATA', 'ENOTFOUND'])
  })

  it('is blocking in every evaluable state, and names the decision it guards', () => {
    for (const cname of [
      { ok: true, records: [VENDOR_SHOPS_HOST] },
      { ok: true, records: ['elsewhere.example'] },
      { ok: false, code: 'ENOTFOUND' },
    ]) {
      const p = premise(cname)
      expect(p.kind).toBe('blocking')
      expect(p.decision).toContain('WS-E')
      expect(p.decision).toContain('docs/runbooks/ws-e-dns.md')
    }
  })
})

describe('driftFileContent — what the reporting step is allowed to conclude', () => {
  const holding = premise({ ok: true, records: [VENDOR_SHOPS_HOST] })
  const drifted = premise({ ok: true, records: ['elsewhere.example'] })
  const unevaluable = premise({ ok: false, code: 'ETIMEOUT' })

  it('writes an empty array when every premise was asked and holds', () => {
    // The reporter closes an open drift issue on `[]`. Only a real all-clear may say that.
    expect(driftFileContent([holding])).toEqual([])
  })

  it('writes nothing when a premise could not be asked and nothing drifted', () => {
    // `[]` here would close a real drift issue on the strength of a timeout. A missing file
    // makes the reporter return early — the honest answer to an unanswered question.
    expect(driftFileContent([unevaluable])).toBeNull()
    expect(driftFileContent([holding, unevaluable])).toBeNull()
  })

  it('always writes a drifted premise, even beside an unevaluable one', () => {
    const content = driftFileContent([drifted, unevaluable])
    expect(content).toHaveLength(1)
    expect(content?.[0].id).toBe('CHECKOUT-HOST-CNAME')
    expect(content?.[0].holds).toBe(false)
  })

  it('never lists an unevaluable premise as drifted', () => {
    expect(driftFileContent([drifted, unevaluable])).not.toContainEqual(unevaluable)
  })
})

describe('formatPremises', () => {
  it('says so plainly when everything holds', () => {
    expect(formatPremises([holdingPremise()]).summary).toBe('All 1 premises hold.')
  })

  it('names drifted and unevaluable premises separately', () => {
    const result = formatPremises([
      premise({ ok: true, records: ['elsewhere.example'] }),
      premise({ ok: false, code: 'ETIMEOUT' }),
    ])
    expect(result.drifted).toHaveLength(1)
    expect(result.unevaluable).toHaveLength(1)
    expect(result.summary).toMatch(/1 of 2 premises have drifted/)
    expect(result.summary).toMatch(/1 of 2 could not be evaluated/)
  })

  it('marks the three states distinctly', () => {
    // Read at a glance in a job summary: a reader must not have to compare sentences to
    // find the one that changed, or mistake "could not ask" for "changed".
    const { lines } = formatPremises([
      holdingPremise(),
      premise({ ok: true, records: ['elsewhere.example'] }),
      premise({ ok: false, code: 'ETIMEOUT' }),
    ])
    expect(lines.map((l: string) => l[0])).toEqual(['·', '!', '?'])
  })
})

function holdingPremise(): Premise {
  return premise({ ok: true, records: [VENDOR_SHOPS_HOST] })
}
