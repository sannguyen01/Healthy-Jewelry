import { describe, it, expect } from 'vitest'
import {
  CLAIM_CATEGORIES,
  CLAIM_IDS,
  claimSchema,
  loadClaimsRegistry,
  type ClaimRecord,
  type ClaimsRegistry,
  type Evidence,
} from '@/lib/catalog/claims-schema'
import {
  approvedWordings,
  claimsNearingExpiry,
  covers,
  documentedStandard,
  inline,
  lines,
  resolveClaim,
} from '@/lib/catalog/claims'
import {
  claimLines,
  claimText,
  getAllProducts,
  getClaimsRegistry,
  materialDesignation,
  materialStandard,
  productMaterialNotes,
  resolveClaimFor,
} from '@/lib/catalog'
import { rawClaims } from '@/lib/catalog/manifest'

/**
 * **The claims registry: what may be said about the metals, and when.**
 *
 * The owner's decision is *enforce now*. Every record in `src/content/claims/claims.json` is
 * `pending`, so every surface renders its neutral fallback, and the proposed wording waits
 * for a named reviewer and a document. This file proves the resolver honours that for every
 * decision state, for an applicability mismatch in each direction, and for expiry — with an
 * injected clock, so the expiry branch is exercised today rather than on the day a real
 * approval lapses (ADR 029: the old acceptance clock could only be tested by waiting).
 */

const PRODUCT_HANDLES = getAllProducts().map((p) => p.handle)
const NOW = new Date('2026-09-26T12:00:00Z')

const REAL: ClaimsRegistry = getClaimsRegistry()

const TITANIUM_DOC: Evidence = {
  documentId: 'DOC-TI-001',
  title: 'Mill certificate, Ti-6Al-4V ELI bar',
  appliesTo: { kind: 'material', materials: ['titanium'] },
  reviewer: 'A. Reviewer',
  reviewedOn: '2026-09-01',
}

/** The real registry with one claim replaced, so each case changes exactly one thing. */
function withClaim(id: ClaimRecord['id'], patch: Partial<ClaimRecord>): ClaimsRegistry {
  return {
    ...REAL,
    claims: REAL.claims.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }
}

function approved(evidence: Evidence[], extra: { decidedOn?: string; expiresOn?: string } = {}) {
  return {
    evidence,
    decision: {
      state: 'approved' as const,
      reviewer: 'A. Reviewer',
      decidedOn: extra.decidedOn ?? '2026-09-10',
      ...(extra.expiresOn ? { expiresOn: extra.expiresOn } : {}),
    },
  }
}

const titanium = { kind: 'material', material: 'titanium' } as const
const niobium = { kind: 'material', material: 'niobium' } as const

describe('the real registry', () => {
  it('loads — the module import above already ran every schema and set-level check', () => {
    expect(REAL.claims.length).toBe(CLAIM_IDS.length)
  })

  it('holds exactly one record per claim the site renders', () => {
    expect(REAL.claims.map((c) => c.id).sort()).toEqual([...CLAIM_IDS].sort())
  })

  it('enforce now: no claim is approved, because nothing in this repository is evidence', () => {
    // A ratchet in the only direction that needs a person. Approving a claim is a reviewed
    // edit to claims.json, and that edit updates this number in the same diff.
    const approvedCount = REAL.claims.filter((c) => c.decision.state === 'approved').length
    expect(approvedCount).toBe(0)
    for (const claim of REAL.claims) {
      expect(claim.decision.state, claim.id).toBe('pending')
      expect(claim.evidence, claim.id).toEqual([])
    }
  })

  it('every claim uses one of the seven categories', () => {
    for (const claim of REAL.claims) expect(CLAIM_CATEGORIES).toContain(claim.category)
  })

  it('no standard renders anywhere today — every provenance is pending', () => {
    for (const spec of REAL.materialSpecs) {
      expect(spec.provenance.state, spec.material).toBe('pending')
      expect(materialStandard(spec.material, { kind: 'material', material: spec.material })).toBeNull()
    }
  })

  it('every claim renders its fallback today, and says why', () => {
    for (const id of CLAIM_IDS) {
      const resolution = resolveClaimFor(id, { kind: 'site' })
      expect(resolution.rendered, id).toBe('fallback')
      expect(resolution.reason, id).toBe('pending')
    }
  })

  it('claimText and claimLines agree on the positioning line', () => {
    expect(claimLines('brand-positioning', { kind: 'site' })).toEqual(['Metal,', 'named', 'exactly.'])
    expect(claimText('brand-positioning', { kind: 'site' })).toBe('Metal, named exactly.')
  })

  it('a product page carries its designation and nothing it cannot document', () => {
    for (const product of getAllProducts()) {
      const notes = productMaterialNotes(product)
      expect(notes.designation).toBe(materialDesignation(product.material))
      expect(notes.standard).toBeNull()
      expect(notes.claims).toEqual([])
    }
  })
})

describe('the schema refuses an approval it cannot stand behind', () => {
  const base = REAL.claims.find((c) => c.id === 'hypoallergenic') as ClaimRecord

  it('accepts the real record', () => {
    expect(claimSchema.safeParse(base).success).toBe(true)
  })

  it('refuses an approval that cites no evidence', () => {
    const result = claimSchema.safeParse({ ...base, ...approved([]) })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toMatch(/cites no evidence/)
  })

  it('accepts an approval with one evidence item', () => {
    expect(claimSchema.safeParse({ ...base, ...approved([TITANIUM_DOC]) }).success).toBe(true)
  })

  it('refuses an expiry on or before the approval date', () => {
    const r = claimSchema.safeParse({
      ...base,
      ...approved([TITANIUM_DOC], { decidedOn: '2026-09-10', expiresOn: '2026-09-10' }),
    })
    expect(r.success).toBe(false)
  })

  it('refuses a fallback identical to the wording, which would render the claim unreviewed', () => {
    expect(claimSchema.safeParse({ ...base, fallback: base.wording }).success).toBe(false)
  })

  it('refuses an unknown id, an unknown category and an unknown key', () => {
    expect(claimSchema.safeParse({ ...base, id: 'glows-in-the-dark' }).success).toBe(false)
    expect(claimSchema.safeParse({ ...base, category: 'healing' }).success).toBe(false)
    expect(claimSchema.safeParse({ ...base, approvedBy: 'someone' }).success).toBe(false)
  })

  it('refuses a reviewer who is not a person', () => {
    expect(
      claimSchema.safeParse({
        ...base,
        ...approved([{ ...TITANIUM_DOC, reviewer: '' }]),
      }).success
    ).toBe(false)
  })

  it('refuses a rejection with no reason', () => {
    expect(
      claimSchema.safeParse({ ...base, decision: { state: 'rejected', reason: '', decidedOn: '2026-09-10' } })
        .success
    ).toBe(false)
  })
})

describe('loadClaimsRegistry checks the set, not only each record', () => {
  const known = { productHandles: PRODUCT_HANDLES }
  const clone = () => JSON.parse(JSON.stringify(rawClaims)) as ClaimsRegistry

  it('accepts the real registry', () => {
    expect(() => loadClaimsRegistry(rawClaims, known)).not.toThrow()
  })

  it('throws when a rendered claim has no record', () => {
    const raw = clone()
    raw.claims = raw.claims.filter((c) => c.id !== 'mri-safe')
    expect(() => loadClaimsRegistry(raw, known)).toThrow(/"mri-safe" is rendered by the site and has no record/)
  })

  it('throws when a claim is recorded twice', () => {
    const raw = clone()
    raw.claims.push(raw.claims[0])
    expect(() => loadClaimsRegistry(raw, known)).toThrow(/has 2 records/)
  })

  it('throws when a material has no specification', () => {
    const raw = clone()
    raw.materialSpecs = raw.materialSpecs.filter((s) => s.material !== 'niobium')
    expect(() => loadClaimsRegistry(raw, known)).toThrow(/"niobium" has 0 specifications/)
  })

  it('throws when evidence names a product the catalogue does not hold', () => {
    // Evidence covering a typo'd handle covers nothing, which reads exactly like evidence
    // nobody supplied — so it stops the build instead.
    const raw = clone()
    const claim = raw.claims.find((c) => c.id === 'hypoallergenic') as ClaimRecord
    claim.evidence = [{ ...TITANIUM_DOC, appliesTo: { kind: 'product', handles: ['arc-band-titanum'] } }]
    expect(() => loadClaimsRegistry(raw, known)).toThrow(/"arc-band-titanum", which the catalogue does not hold/)
  })

  it('throws, naming the file, on a malformed record', () => {
    const raw = clone()
    ;(raw.claims[0] as { wording: string }).wording = ''
    expect(() => loadClaimsRegistry(raw, known)).toThrow(/src\/content\/claims\//)
  })
})

describe('resolveClaim — every decision state', () => {
  it('pending renders the fallback', () => {
    const r = resolveClaim(REAL, 'hypoallergenic', titanium, NOW)
    expect(r).toMatchObject({ rendered: 'fallback', reason: 'pending' })
  })

  it('rejected renders the fallback', () => {
    const reg = withClaim('hypoallergenic', {
      decision: { state: 'rejected', reason: 'No patch-test data exists.', decidedOn: '2026-09-10' },
    })
    expect(resolveClaim(reg, 'hypoallergenic', titanium, NOW)).toMatchObject({ reason: 'rejected' })
  })

  it('a recorded expiry renders the fallback', () => {
    const reg = withClaim('hypoallergenic', {
      evidence: [TITANIUM_DOC],
      decision: { state: 'expired', reviewer: 'A. Reviewer', decidedOn: '2026-01-10', expiredOn: '2026-07-10' },
    })
    expect(resolveClaim(reg, 'hypoallergenic', titanium, NOW)).toMatchObject({ reason: 'expired' })
  })

  it('approved, evidenced and applicable renders the wording', () => {
    const reg = withClaim('hypoallergenic', approved([TITANIUM_DOC]))
    expect(resolveClaim(reg, 'hypoallergenic', titanium, NOW)).toEqual({
      rendered: 'wording',
      text: 'Hypoallergenic',
      reason: 'approved',
    })
  })

  it('an approval dated in the future is not an approval yet', () => {
    const reg = withClaim('hypoallergenic', approved([TITANIUM_DOC], { decidedOn: '2026-09-27' }))
    expect(resolveClaim(reg, 'hypoallergenic', titanium, NOW)).toMatchObject({ reason: 'decided-in-future' })
  })
})

describe('resolveClaim — applicability', () => {
  const reg = withClaim('hypoallergenic', approved([TITANIUM_DOC]))

  it('titanium evidence does not cover niobium', () => {
    expect(resolveClaim(reg, 'hypoallergenic', niobium, NOW)).toMatchObject({ reason: 'not-applicable' })
  })

  it('titanium evidence covers a titanium piece', () => {
    const ctx = { kind: 'product', handle: 'arc-band-titanium', material: 'titanium' } as const
    expect(resolveClaim(reg, 'hypoallergenic', ctx, NOW).rendered).toBe('wording')
  })

  it('titanium evidence does not cover a niobium piece', () => {
    const ctx = { kind: 'product', handle: 'flat-band-niobium', material: 'niobium' } as const
    expect(resolveClaim(reg, 'hypoallergenic', ctx, NOW).rendered).toBe('fallback')
  })

  it('one material does not cover a statement about the whole range', () => {
    expect(resolveClaim(reg, 'hypoallergenic', { kind: 'site' }, NOW)).toMatchObject({ reason: 'not-applicable' })
  })

  it('evidence spanning all three materials covers the whole range', () => {
    const all = withClaim(
      'hypoallergenic',
      approved([{ ...TITANIUM_DOC, appliesTo: { kind: 'material', materials: ['titanium', 'niobium', 'surgical-steel'] } }])
    )
    expect(resolveClaim(all, 'hypoallergenic', { kind: 'site' }, NOW).rendered).toBe('wording')
  })

  it('product evidence covers only the products it names', () => {
    const doc = { ...TITANIUM_DOC, appliesTo: { kind: 'product' as const, handles: ['arc-band-titanium'] } }
    const p = withClaim('hypoallergenic', approved([doc]))
    const named = { kind: 'product', handle: 'arc-band-titanium', material: 'titanium' } as const
    const other = { kind: 'product', handle: 'dome-ring-titanium', material: 'titanium' } as const
    expect(resolveClaim(p, 'hypoallergenic', named, NOW).rendered).toBe('wording')
    expect(resolveClaim(p, 'hypoallergenic', other, NOW).rendered).toBe('fallback')
    // And a document about one piece says nothing about the metal in general.
    expect(resolveClaim(p, 'hypoallergenic', titanium, NOW).rendered).toBe('fallback')
  })

  it('batch evidence covers nothing, because no page knows a piece’s batch', () => {
    const doc = { ...TITANIUM_DOC, appliesTo: { kind: 'batch' as const, batchIds: ['B-2026-07'] } }
    const b = withClaim('hypoallergenic', approved([doc]))
    expect(resolveClaim(b, 'hypoallergenic', titanium, NOW)).toMatchObject({ reason: 'not-applicable' })
  })
})

describe('resolveClaim — expiry changes what renders, never whether the build passes', () => {
  const reg = withClaim('hypoallergenic', approved([TITANIUM_DOC], { expiresOn: '2026-09-26' }))

  it('is valid through the whole of its expiry date, in UTC', () => {
    expect(resolveClaim(reg, 'hypoallergenic', titanium, new Date('2026-09-26T23:59:59Z')).rendered).toBe(
      'wording'
    )
  })

  it('reverts to the fallback from the next day, without throwing', () => {
    expect(resolveClaim(reg, 'hypoallergenic', titanium, new Date('2026-09-27T00:00:00Z'))).toMatchObject({
      rendered: 'fallback',
      reason: 'past-expiry',
    })
  })
})

describe('covers — the piece-level rule for standards', () => {
  const material: Evidence['appliesTo'] = { kind: 'material', materials: ['titanium'] }
  const piece = { kind: 'product', handle: 'arc-band-titanium', material: 'titanium' } as const

  it('material documentation covers a piece for a property claim', () => {
    expect(covers(material, piece)).toBe(true)
  })

  it('but not for a certification of the piece', () => {
    expect(covers(material, piece, { pieceLevel: true })).toBe(false)
  })
})

describe('documentedStandard — a standard is a certification claim', () => {
  const documented = (appliesTo: Evidence['appliesTo']): ClaimsRegistry => ({
    ...REAL,
    materialSpecs: REAL.materialSpecs.map((s) =>
      s.material === 'titanium'
        ? {
            ...s,
            provenance: {
              state: 'documented',
              documentId: 'DOC-TI-001',
              appliesTo,
              reviewer: 'A. Reviewer',
              reviewedOn: '2026-09-01',
            },
          }
        : s
    ),
  })
  const piece = { kind: 'product', handle: 'arc-band-titanium', material: 'titanium' } as const

  it('is null while provenance is pending', () => {
    expect(documentedStandard(REAL, 'titanium', titanium)).toBeNull()
  })

  it('renders on a material surface once the material is documented', () => {
    const reg = documented({ kind: 'material', materials: ['titanium'] })
    expect(documentedStandard(reg, 'titanium', titanium)).toBe('ASTM F136')
  })

  it('does not render on a product page from material-level documentation', () => {
    const reg = documented({ kind: 'material', materials: ['titanium'] })
    expect(documentedStandard(reg, 'titanium', piece)).toBeNull()
  })

  it('renders on a product page documented for that piece', () => {
    const reg = documented({ kind: 'product', handles: ['arc-band-titanium'] })
    expect(documentedStandard(reg, 'titanium', piece)).toBe('ASTM F136')
  })

  it('never renders a standard that was never named', () => {
    const reg = documented({ kind: 'material', materials: ['titanium'] })
    reg.materialSpecs = reg.materialSpecs.map((s) =>
      s.material === 'titanium' ? { ...s, standard: { state: 'none' } } : s
    )
    expect(documentedStandard(reg, 'titanium', titanium)).toBeNull()
  })
})

describe('approvedWordings — list surfaces render only what is approved', () => {
  it('drops pending claims rather than rendering a column of fallbacks', () => {
    expect(approvedWordings(REAL, ['hypoallergenic', 'mri-safe'], titanium, NOW)).toEqual([])
  })

  it('keeps an approved one, in order', () => {
    const reg = withClaim('mri-safe', approved([TITANIUM_DOC]))
    expect(approvedWordings(reg, ['hypoallergenic', 'mri-safe'], titanium, NOW)).toEqual(['MRI-safe'])
  })
})

describe('claimsNearingExpiry — the input for a scheduled probe, not a merge gate', () => {
  const reg: ClaimsRegistry = {
    ...REAL,
    claims: REAL.claims.map((c) => {
      if (c.id === 'hypoallergenic') return { ...c, ...approved([TITANIUM_DOC], { expiresOn: '2026-10-10' }) }
      if (c.id === 'mri-safe') return { ...c, ...approved([TITANIUM_DOC], { expiresOn: '2026-09-20' }) }
      if (c.id === 'biocompatible') return { ...c, ...approved([TITANIUM_DOC], { expiresOn: '2027-06-01' }) }
      if (c.id === 'nickel-free') return { ...c, ...approved([TITANIUM_DOC]) }
      return c
    }),
  }

  it('returns claims inside the window and ones already lapsed, soonest first', () => {
    expect(claimsNearingExpiry(reg, NOW, 30)).toEqual([
      { id: 'mri-safe', expiresOn: '2026-09-20', daysRemaining: -5 },
      { id: 'hypoallergenic', expiresOn: '2026-10-10', daysRemaining: 15 },
    ])
  })

  it('excludes a claim beyond the window and one with no expiry at all', () => {
    const ids = claimsNearingExpiry(reg, NOW, 30).map((e) => e.id)
    expect(ids).not.toContain('biocompatible')
    expect(ids).not.toContain('nickel-free')
  })

  it('is empty for the real registry, which approves nothing', () => {
    expect(claimsNearingExpiry(REAL, NOW, 365)).toEqual([])
  })
})

describe('line-break hints', () => {
  it('inline joins with single spaces and lines splits', () => {
    expect(inline('Metal that\nworks with\nyour body.')).toBe('Metal that works with your body.')
    expect(lines('Metal that\nworks with\nyour body.')).toEqual(['Metal that', 'works with', 'your body.'])
    expect(lines('One line')).toEqual(['One line'])
  })
})
