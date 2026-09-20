import { describe, it, expect } from 'vitest'
import {
  productSchema,
  collectionSchema,
  mediaSchema,
  pendingFieldCount,
  COLLECTION_HANDLES,
  MATERIAL_HANDLES,
  BADGES,
  AVAILABILITY_STATES,
  type CatalogProduct,
} from '@/lib/catalog/schema'
import { loadCatalog } from '@/lib/catalog'

/**
 * **The schema, exercised on the shapes it exists to reject.**
 *
 * A schema test that only feeds it valid records proves the happy path and nothing else.
 * Every block below is a *malformed* record that would otherwise render a page with a hole
 * in it, plus the vocabularies that must not silently widen.
 */

/** A record that passes, so each rejection test can change exactly one thing. */
const VALID: CatalogProduct = {
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  materialLabel: 'Grade 23 Titanium',
  description: 'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
  specification: '2 mm · 1.8 g',
  sizes: ['5', '6', '7'],
  availability: 'ask-an-ambassador',
  badge: 'bestseller',
  media: { kind: 'illustration', svgType: 'ring-arc' },
  careInstructions: { state: 'pending' },
  sku: { state: 'pending' },
  lastReviewed: { state: 'pending' },
  legacyRedirects: [],
}

describe('the baseline record is actually valid', () => {
  it('parses', () => {
    // Without this, every "changing X makes it fail" test below could be failing for a
    // reason that has nothing to do with X.
    expect(productSchema.safeParse(VALID).success).toBe(true)
  })
})

describe('the schema refuses what would render a hole', () => {
  const reject = (patch: Record<string, unknown>) =>
    productSchema.safeParse({ ...VALID, ...patch }).success

  it('rejects an empty title', () => {
    expect(reject({ title: '' })).toBe(false)
  })

  it('rejects an empty description', () => {
    expect(reject({ description: '' })).toBe(false)
  })

  it('rejects an empty specification', () => {
    expect(reject({ specification: '' })).toBe(false)
  })

  it('rejects a handle that is not a kebab-case slug', () => {
    // A handle is a URL. `Arc Band` would produce /products/Arc%20Band.
    expect(reject({ handle: 'Arc Band' })).toBe(false)
    expect(reject({ handle: 'arc_band' })).toBe(false)
    expect(reject({ handle: 'arc--band' })).toBe(false)
    expect(reject({ handle: '-arc-band' })).toBe(false)
    expect(reject({ handle: 'arc-band-' })).toBe(false)
  })

  it('accepts the slug shapes the catalogue actually uses', () => {
    expect(reject({ handle: 'a' })).toBe(true)
    expect(reject({ handle: 'disc-charm-surgical-steel' })).toBe(true)
    expect(reject({ handle: 'ring-316l' })).toBe(true)
  })

  it('rejects a collection outside the five', () => {
    expect(reject({ collection: 'frontpage' })).toBe(false)
  })

  it('rejects a material outside the three', () => {
    expect(reject({ collection: 'rings', material: 'gold' })).toBe(false)
  })

  it('rejects an availability the site cannot honestly claim', () => {
    // `in-stock` is not in the vocabulary because nothing can check it any more.
    expect(reject({ availability: 'in-stock' })).toBe(false)
    expect(reject({ availability: true })).toBe(false)
  })

  it('rejects a legacy redirect that is not a path', () => {
    expect(reject({ legacyRedirects: ['products/old'] })).toBe(false)
    expect(reject({ legacyRedirects: ['https://example.com/old'] })).toBe(false)
    expect(reject({ legacyRedirects: ['/products/old'] })).toBe(true)
  })

  it('rejects an unknown key rather than ignoring it', () => {
    // `.strict()` is the whole reason a typo is a build failure. `materialLabl` would
    // otherwise validate, render blank, and be invisible to every other check.
    expect(reject({ materialLabl: 'Grade 23 Titanium' })).toBe(false)
  })

  it('rejects a price, however it is spelled', () => {
    // The field this decommission exists to remove cannot come back through a JSON file.
    expect(reject({ price: '89.00' })).toBe(false)
    expect(reject({ compareAtPrice: null })).toBe(false)
    expect(reject({ currencyCode: 'VND' })).toBe(false)
  })

  it('rejects a missing field rather than defaulting it', () => {
    const withoutAvailability: Record<string, unknown> = { ...VALID }
    delete withoutAvailability.availability
    expect(productSchema.safeParse(withoutAvailability).success).toBe(false)
  })
})

describe('media is a three-state union, not a nullable image', () => {
  it('accepts a photograph with alt text', () => {
    expect(mediaSchema.safeParse({ kind: 'photo', src: '/p/a.jpg', alt: 'Arc Band' }).success).toBe(
      true
    )
  })

  it('refuses a photograph with empty alt text', () => {
    // An empty alt tells a screen reader the product is decorative.
    expect(mediaSchema.safeParse({ kind: 'photo', src: '/p/a.jpg', alt: '' }).success).toBe(false)
  })

  it('refuses a photograph with no alt text at all', () => {
    expect(mediaSchema.safeParse({ kind: 'photo', src: '/p/a.jpg' }).success).toBe(false)
  })

  it('keeps a chosen illustration and a pending one apart', () => {
    expect(mediaSchema.safeParse({ kind: 'illustration', svgType: 'ring-arc' }).success).toBe(true)
    expect(mediaSchema.safeParse({ kind: 'illustration-pending' }).success).toBe(true)
    // An illustration with no type is neither: it is the `featuredImage: null` conflation
    // this union exists to break.
    expect(mediaSchema.safeParse({ kind: 'illustration' }).success).toBe(false)
  })

  it('refuses null, which is the shape being replaced', () => {
    expect(mediaSchema.safeParse(null).success).toBe(false)
  })
})

describe('an unsourced field is pending, never blank', () => {
  const parse = (patch: Record<string, unknown>) =>
    productSchema.safeParse({ ...VALID, ...patch }).success

  it('accepts authored care instructions', () => {
    expect(parse({ careInstructions: { state: 'authored', value: ['Rinse in fresh water.'] } })).toBe(
      true
    )
  })

  it('refuses authored-but-empty, which is a blank wearing a state', () => {
    expect(parse({ careInstructions: { state: 'authored', value: [] } })).toBe(false)
    expect(parse({ sku: { state: 'authored', value: '' } })).toBe(false)
  })

  it('refuses a bare value with no state', () => {
    expect(parse({ sku: 'HJ-001' })).toBe(false)
    expect(parse({ careInstructions: ['Rinse in fresh water.'] })).toBe(false)
  })

  it('refuses undefined — absence must be declared', () => {
    expect(parse({ sku: undefined })).toBe(false)
  })

  it('requires lastReviewed to be a real calendar date', () => {
    expect(parse({ lastReviewed: { state: 'authored', value: '2026-09-20' } })).toBe(true)
    expect(parse({ lastReviewed: { state: 'authored', value: '20-09-2026' } })).toBe(false)
    expect(parse({ lastReviewed: { state: 'authored', value: '2026-13-01' } })).toBe(false)
  })
})

describe('pendingFieldCount makes content debt countable', () => {
  it('counts every pending field on the baseline record', () => {
    // care + sku + lastReviewed = 3; media is a chosen illustration, so it does not count.
    expect(pendingFieldCount(VALID)).toBe(3)
  })

  it('counts a pending illustration too', () => {
    expect(pendingFieldCount({ ...VALID, media: { kind: 'illustration-pending' } })).toBe(4)
  })

  it('reaches zero when everything is authored', () => {
    expect(
      pendingFieldCount({
        ...VALID,
        careInstructions: { state: 'authored', value: ['Rinse.'] },
        sku: { state: 'authored', value: 'HJ-001' },
        lastReviewed: { state: 'authored', value: '2026-09-20' },
        media: { kind: 'photo', src: '/p/a.jpg', alt: 'Arc Band' },
      })
    ).toBe(0)
  })

  it('does not count a chosen illustration as debt', () => {
    // CLAUDE.md: the hand-drawn SVGs are "the site's whole visual language today", not an
    // apology. Counting them as debt would make the ratchet measure the wrong thing.
    expect(
      pendingFieldCount({
        ...VALID,
        careInstructions: { state: 'authored', value: ['Rinse.'] },
        sku: { state: 'authored', value: 'HJ-001' },
        lastReviewed: { state: 'authored', value: '2026-09-20' },
      })
    ).toBe(0)
  })
})

describe('the vocabularies', () => {
  it('collection handles are the five the site serves', () => {
    // This compared `COLLECTION_HANDLES` against `HJ_COLLECTION_HANDLES` in
    // `src/lib/catalog/types.ts` — the Shopify wire format — because the schema restated
    // the vocabulary rather than importing it, and the restatement needed a join while
    // both existed. WS-4c deleted that file, so the schema is now the only declaration
    // and there is nothing left to reconcile it against here.
    //
    // The comparison that still matters moved to `collection-handle-contract.test.ts`,
    // where it belongs: this union against the router's own `VALID_COLLECTIONS`, which is
    // what decides whether a handle 404s.
    expect([...COLLECTION_HANDLES].sort()).toEqual(
      ['bracelets', 'charms', 'earrings', 'necklaces', 'rings']
    )
  })

  it('materials are the three the brand actually makes', () => {
    expect(MATERIAL_HANDLES).toEqual(['titanium', 'niobium', 'surgical-steel'])
  })

  it('badges no longer include Sale', () => {
    // Sale was derived from an active compare-at price. There are no prices, so there is
    // nothing for a Sale badge to mean. See schema.ts.
    expect(BADGES).not.toContain('sale')
    expect(BADGES).not.toContain('Sale')
    expect([...BADGES].sort()).toEqual(['bestseller', 'new'])
  })

  it('availability offers no state that asserts purchasable stock', () => {
    for (const state of AVAILABILITY_STATES) {
      expect(state).not.toMatch(/in-stock|available|buy|purchas/i)
    }
    expect(AVAILABILITY_STATES).toContain('ask-an-ambassador')
  })
})

describe('collections', () => {
  it('accepts a real one', () => {
    expect(
      collectionSchema.safeParse({
        handle: 'rings',
        title: 'Rings',
        description: 'Architectural forms for everyday wear',
      }).success
    ).toBe(true)
  })

  it('rejects a handle outside the five', () => {
    expect(
      collectionSchema.safeParse({ handle: 'frontpage', title: 'Front', description: 'x' }).success
    ).toBe(false)
  })

  it('rejects an unknown key', () => {
    expect(
      collectionSchema.safeParse({ handle: 'rings', title: 'Rings', description: 'x', image: null })
        .success
    ).toBe(false)
  })
})

describe('loadCatalog refuses a broken catalogue, and says what is broken', () => {
  /**
   * The failure branches of the function that decides whether a build proceeds.
   *
   * They used to be unreachable without shipping a broken record, which made them the
   * least-tested code in the module — ADR 024's finding, in the place it does most harm.
   * `loadCatalog` is pure and exported so a fixture can drive it.
   */
  const good = { ...VALID }
  const goodCollection = { handle: 'rings', title: 'Rings', description: 'Architectural forms' }

  it('accepts a valid pair of lists', () => {
    const loaded = loadCatalog([good], [goodCollection])
    expect(loaded.products).toHaveLength(1)
    expect(loaded.collections).toHaveLength(1)
  })

  it('accepts an empty catalogue here — emptiness is next.config.ts’s question, not this one', () => {
    // Kept separate deliberately. "Is this record well-formed?" and "is there anything to
    // serve?" are different failures with different remedies, and merging them would make
    // a fixture-driven schema test unable to use an empty list.
    expect(loadCatalog([], []).products).toEqual([])
  })

  it('throws on a malformed product, naming it by handle', () => {
    expect(() => loadCatalog([{ ...good, title: '' }], [goodCollection])).toThrow(
      /1 invalid product record/
    )
    expect(() => loadCatalog([{ ...good, title: '' }], [goodCollection])).toThrow(
      /arc-band-titanium/
    )
  })

  it('reports every bad record, not just the first', () => {
    // One cycle per defect is the cost of failing fast here.
    const error = (() => {
      try {
        loadCatalog(
          [
            { ...good, handle: 'one', title: '' },
            { ...good, handle: 'two', description: '' },
            { ...good, handle: 'three', specification: '' },
          ],
          [goodCollection]
        )
      } catch (e) {
        return e as Error
      }
      throw new Error('loadCatalog did not throw')
    })()

    expect(error.message).toMatch(/3 invalid product record/)
    for (const handle of ['one', 'two', 'three']) {
      expect(error.message).toContain(handle)
    }
  })

  it('falls back to the index when a record has no handle to name it by', () => {
    // A record so malformed it is not even an object still has to be locatable.
    expect(() => loadCatalog([42], [goodCollection])).toThrow(/index 0/)
    expect(() => loadCatalog([null], [goodCollection])).toThrow(/index 0/)
  })

  it('throws on a malformed collection too', () => {
    expect(() => loadCatalog([good], [{ handle: 'rings', title: '' }])).toThrow(
      /1 invalid collection record/
    )
  })

  it('throws on two records claiming one handle', () => {
    // Not a schema error on either record — a property of the set, so it is checked where
    // the set exists. Silently, this makes a URL resolve to whichever file came first.
    // `[\s\S]*` rather than `.*` with the `s` flag: tsconfig targets ES2017 and TS1501
    // rejects dotAll. `next build` caught that; `pnpm type-check` would have too.
    expect(() => loadCatalog([good, { ...good, title: 'Impostor' }], [goodCollection])).toThrow(
      /Duplicate product handle\(s\)[\s\S]*arc-band-titanium/
    )
  })

  it('names each duplicated handle once, however many times it repeats', () => {
    const error = (() => {
      try {
        loadCatalog([good, { ...good }, { ...good }], [goodCollection])
      } catch (e) {
        return e as Error
      }
      throw new Error('loadCatalog did not throw')
    })()
    expect(error.message.match(/arc-band-titanium/g)).toHaveLength(1)
  })

  it('the message says where to look and what the rule is', () => {
    // A throw that stops a build has to be actionable from the log alone — the reader may
    // be looking at CI output with no repository in front of them.
    try {
      loadCatalog([{ ...good, title: '' }], [goodCollection])
    } catch (e) {
      const message = (e as Error).message
      expect(message).toContain('src/content/catalog/')
      expect(message).toContain('src/lib/catalog/schema.ts')
      expect(message).toMatch(/stops the build/)
    }
  })
})
