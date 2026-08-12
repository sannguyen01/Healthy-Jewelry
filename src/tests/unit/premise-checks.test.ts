import { describe, it, expect } from 'vitest'

const {
  i18nPremise,
  collectionSetPremise,
  specMetafieldPremise,
  paymentsPremise,
  apiVersionPremise,
  formatPremises,
} = await import('../../../scripts/lib/premise-checks.mjs')

const { API_VERSION_ACCESSIBLE_UNTIL, MIGRATION_LEAD_DAYS, SHOPIFY_API_VERSION } = await import(
  '../../../scripts/lib/api-version.mjs'
)

/**
 * **Both states, every premise.**
 *
 * The drifted branch is the one that never runs locally, so it is the one most likely to be
 * wrong the day it finally fires. This project has already paid for that: the
 * completed-order branch of the cart could not be exercised in development and was the half
 * that broke, which is why `checkout-journey.test.ts` guards the expiry path as carefully
 * as the order path.
 *
 * A detector that has only ever been observed saying "fine" is not a detector.
 */

interface Premise {
  id: string
  decision: string
  holds: boolean
  detail: string
  kind: 'blocking' | 'opportunity'
}

describe('i18n premise (ADR 005)', () => {
  it('holds while the store is English-only', () => {
    const p = i18nPremise([{ locale: 'en', published: true }]) as Premise
    expect(p.holds).toBe(true)
    expect(p.kind).toBe('opportunity')
  })

  it('drifts when a Vietnamese locale appears', () => {
    // ADR 005's own stated prerequisite. Its arrival is the signal to revisit.
    const p = i18nPremise([
      { locale: 'en', published: true },
      { locale: 'vi', published: true },
    ]) as Premise

    expect(p.holds).toBe(false)
    expect(p.detail).toContain('vi')
    expect(p.detail).toMatch(/revisit/i)
  })

  it('treats a regional English locale as still English', () => {
    // `en-GB` is not translated content; flagging it would be a false alarm on day one.
    const p = i18nPremise([{ locale: 'en' }, { locale: 'en-GB' }]) as Premise
    expect(p.holds).toBe(true)
  })

  it('names the decision it guards', () => {
    const p = i18nPremise([{ locale: 'en' }]) as Premise
    expect(p.decision).toContain('005')
  })
})

describe('collection-set premise (dynamicParams = false)', () => {
  const known = [
    { handle: 'rings' },
    { handle: 'necklaces' },
    { handle: 'earrings' },
    { handle: 'bracelets' },
    { handle: 'charms' },
  ]

  it('holds when Shopify has only known collections', () => {
    const p = collectionSetPremise(known, known) as Premise
    expect(p.holds).toBe(true)
  })

  it('exempts the Shopify built-in frontpage collection', () => {
    // Present on every Shopify store and never one of ours. Without this the check
    // false-positives on day one, which is how a new detector loses its reader.
    const p = collectionSetPremise([...known, { handle: 'frontpage' }], known) as Premise
    expect(p.holds).toBe(true)
  })

  it('drifts when Shopify has a collection hjCollections does not', () => {
    // The regression I introduced in Round 5 and did not detect: this URL hard-404s.
    const p = collectionSetPremise([...known, { handle: 'anklets' }], known) as Premise

    expect(p.holds).toBe(false)
    expect(p.detail).toContain('anklets')
    expect(p.detail).toMatch(/404/)
  })

  it('is blocking, not an opportunity', () => {
    // Customers are getting 404s. This one is not a "nice to revisit".
    const p = collectionSetPremise([...known, { handle: 'anklets' }], known) as Premise
    expect(p.kind).toBe('blocking')
  })

  it('does not flag ours-but-not-in-Shopify', () => {
    // The reverse direction is harmless: a collection we know about that Shopify dropped
    // renders an empty listing, not a 404. Flagging it would be noise.
    const p = collectionSetPremise([{ handle: 'rings' }], known) as Premise
    expect(p.holds).toBe(true)
  })
})

describe('spec metafield premise', () => {
  it('holds while no product has a spec', () => {
    expect((specMetafieldPremise(0, 22) as Premise).holds).toBe(true)
  })

  it('drifts once a real measurement is entered', () => {
    const p = specMetafieldPremise(3, 22) as Premise
    expect(p.holds).toBe(false)
    expect(p.detail).toContain('3/22')
  })
})

/**
 * The premise with a **date on it**, which makes it the clearest case for the whole idea.
 *
 * Shopify publishes exactly when an API version stops being served, and on that day every
 * request falls forward to a different API with a 200 and no signal. That already happened
 * here — `2025-01` was pinned for roughly seven months past its retirement and nothing went
 * red. See ADR 009.
 *
 * The clock is injected so all three branches run in CI today. The `expiring` and `expired`
 * branches are, by construction, ones that can never be observed locally otherwise.
 */
describe('API version premise (ADR 009)', () => {
  const deadline = new Date(API_VERSION_ACCESSIBLE_UNTIL)
  const daysBefore = (n: number) => new Date(deadline.getTime() - n * 86_400_000)

  it('holds while the pinned version is comfortably accessible', () => {
    const p = apiVersionPremise(daysBefore(MIGRATION_LEAD_DAYS + 60)) as Premise
    expect(p.holds).toBe(true)
    expect(p.id).toBe('SHOPIFY-API-VERSION')
    expect(p.detail).toContain(SHOPIFY_API_VERSION)
  })

  it('drifts inside the migration lead time, before anything is broken', () => {
    const p = apiVersionPremise(daysBefore(MIGRATION_LEAD_DAYS - 10)) as Premise
    expect(p.holds).toBe(false)
    expect(p.detail).toContain('Migrate')
  })

  it('drifts once the version has retired, and says how long ago', () => {
    const p = apiVersionPremise(new Date(deadline.getTime() + 45 * 86_400_000)) as Premise
    expect(p.holds).toBe(false)
    expect(p.detail).toContain('45')
    expect(p.detail).toContain('stopped being served')
  })

  /**
   * `opportunity`, not `blocking`, and the distinction is load-bearing. While the version
   * is still accessible there is a scheduled window to migrate calmly, and turning the run
   * red over a future date is how a signal becomes noise. The *breakage* case — Shopify
   * already serving something else — is a hard check in verify-production.mjs instead.
   */
  it('is an opportunity, never a red build', () => {
    for (const at of [daysBefore(365), daysBefore(1), new Date(deadline.getTime() + 86_400_000)]) {
      expect((apiVersionPremise(at) as Premise).kind).toBe('opportunity')
    }
  })

  it('points at the ADR that records the decision', () => {
    expect((apiVersionPremise() as Premise).decision).toContain('009')
  })
})

describe('payments premise — the one that expires by itself', () => {
  it('reports unverifiable while no order exists', () => {
    const p = paymentsPremise(0, []) as Premise

    expect(p.holds).toBe(true)
    expect(p.detail).toMatch(/supportedDigitalWallets/)
    expect(p.detail).toMatch(/upgrades itself/i)
  })

  it('upgrades to a real assertion once an order exists', () => {
    // The premise "not machine-verifiable" stops being true the moment
    // Order.paymentGatewayNames has something to read.
    const p = paymentsPremise(1, ['Bank Deposit']) as Premise

    expect(p.holds).toBe(true)
    expect(p.detail).toContain('Bank Deposit')
    expect(p.detail).toMatch(/expired/i)
  })

  it('drifts when orders exist but name no gateway', () => {
    // Orders without a payment gateway mean money is not being taken — the exact outcome
    // the blocker exists to prevent, now detectable.
    const p = paymentsPremise(2, []) as Premise

    expect(p.holds).toBe(false)
    expect(p.detail).toMatch(/none names a payment gateway/i)
  })

  it('de-duplicates gateway names across orders', () => {
    const p = paymentsPremise(3, ['Bank Deposit', 'Bank Deposit']) as Premise
    expect(p.detail.match(/Bank Deposit/g)).toHaveLength(1)
  })
})

describe('formatPremises', () => {
  const holding = [
    i18nPremise([{ locale: 'en' }]),
    specMetafieldPremise(0, 22),
  ] as Premise[]

  it('says so plainly when everything holds', () => {
    const { drifted, summary } = formatPremises(holding)
    expect(drifted).toHaveLength(0)
    expect(summary).toMatch(/All 2 premises hold/)
  })

  it('names every drifted premise in the summary', () => {
    const drifted = [...holding, specMetafieldPremise(1, 22)] as Premise[]
    const result = formatPremises(drifted)

    expect(result.drifted).toHaveLength(1)
    expect(result.summary).toContain('SHOPIFY-SPEC-METAFIELD')
  })

  it('marks drifted lines distinctly from holding ones', () => {
    // The output is read at a glance in a job summary; a reader must not have to compare
    // sentences to find the one that changed.
    const { lines } = formatPremises([
      i18nPremise([{ locale: 'en' }]),
      i18nPremise([{ locale: 'en' }, { locale: 'vi' }]),
    ] as Premise[])

    expect(lines[0].startsWith('·')).toBe(true)
    expect(lines[1].startsWith('!')).toBe(true)
  })
})
