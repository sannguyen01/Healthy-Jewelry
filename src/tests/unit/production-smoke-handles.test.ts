import { describe, it, expect } from 'vitest'
import { getAllProducts } from '@/lib/data/hj-data'

const { FALLBACK_ONLY_HANDLES, SHOPIFY_ONLY_HANDLES, unreadTags } = await import(
  '../../../scripts/verify-production.mjs'
)

/**
 * `scripts/verify-production.mjs` tells the static fallback apart from the live
 * Shopify catalogue using two handle lists. That discrimination is the whole
 * check — if the lists stop being disjoint, the script keeps passing while
 * testing nothing, which is worse than not having it.
 *
 * The static side is verifiable here, against `hj-data.ts` itself. The Shopify
 * side is verified by the live run; what this file guards is the invariant that
 * makes the comparison meaningful in the first place.
 */
describe('production smoke handle discriminators', () => {
  const staticHandles = getAllProducts().map((p) => p.handle)

  describe('FALLBACK_ONLY_HANDLES', () => {
    it('is non-empty', () => {
      // An empty list would make the "is this the fallback?" check vacuously
      // pass on every run.
      expect(FALLBACK_ONLY_HANDLES.length).toBeGreaterThan(0)
    })

    it('every handle really is in the static catalogue', () => {
      // If one of these is renamed in hj-data.ts and not here, the live site
      // could serve the fallback and the smoke test would not notice.
      for (const handle of FALLBACK_ONLY_HANDLES) {
        expect(staticHandles).toContain(handle)
      }
    })
  })

  describe('SHOPIFY_ONLY_HANDLES', () => {
    it('is non-empty', () => {
      expect(SHOPIFY_ONLY_HANDLES.length).toBeGreaterThan(0)
    })

    it('no handle appears in the static catalogue', () => {
      // This is the load-bearing assertion. The moment one of these is added to
      // hj-data.ts, finding it on the live page stops proving the Shopify fetch
      // worked — the fallback would render it too.
      for (const handle of SHOPIFY_ONLY_HANDLES) {
        expect(staticHandles).not.toContain(handle)
      }
    })
  })

  it('the two lists never overlap', () => {
    const overlap = FALLBACK_ONLY_HANDLES.filter((h: string) => SHOPIFY_ONLY_HANDLES.includes(h))
    expect(overlap).toEqual([])
  })
})

/**
 * Tags are the only channel Shopify gives this project for "which metal is this",
 * and the store's vocabulary once disagreed with the code's in silence:
 * `material:steel` matched nothing, so all 22 products reported Grade 23 Titanium
 * on a brand whose entire promise is knowing which metal touches your skin.
 *
 * That failure is invisible from the store side — a merchant writes a tag, Shopify
 * accepts it, and nothing says the site ignores it. `unreadTags` is what makes it
 * visible, so it is tested against the tag arrays the live catalogue actually
 * carries rather than ones written to agree with it.
 */
describe('unreadTags', () => {
  it('reads every tag the live catalogue currently uses, except one', () => {
    // Verbatim from the connected store, 2026-08-12.
    const live = [
      { tags: ['bestseller', 'material:titanium', 'svg:ring-arc'] },
      { tags: ['material:niobium', 'svg:necklace-disc'] },
      { tags: ['material:steel', 'svg:earring-stud'] },
      { tags: ['material:titanium', 'sale', 'svg:ring-split'] },
      { tags: ['collection:spectrum', 'material:titanium', 'new', 'svg:bracelet-cuff'] },
      { tags: ['collection:spectrum', 'material:niobium', 'new', 'svg:ring-facet'] },
    ]

    // `collection:spectrum` is the real finding: five products carry it and
    // nothing reads it, because collections come from Shopify collection
    // membership, not from tags.
    expect([...unreadTags(live).keys()]).toEqual(['collection:spectrum'])
  })

  it('counts how many products carry each unread tag', () => {
    const products = [{ tags: ['collection:spectrum'] }, { tags: ['collection:spectrum'] }]
    expect(unreadTags(products).get('collection:spectrum')).toBe(2)
  })

  it('accepts every namespace the parsers actually handle', () => {
    const products = [{ tags: ['material:steel', 'svg:charm-star', 'bestseller', 'new', 'sale'] }]
    expect(unreadTags(products).size).toBe(0)
  })

  /**
   * A bare tag is not a namespace. `titanium` on its own is exactly the spelling
   * the code used to look for and the store never wrote — reporting it keeps that
   * mismatch visible rather than letting it pass as "close enough".
   */
  it('reports a bare material name, which no parser reads', () => {
    expect([...unreadTags([{ tags: ['titanium'] }]).keys()]).toEqual(['titanium'])
  })

  it('normalises case and whitespace before judging', () => {
    expect(unreadTags([{ tags: ['  Material:Titanium  ', ' BESTSELLER '] }]).size).toBe(0)
  })

  it('ignores empty tags rather than reporting a blank finding', () => {
    expect(unreadTags([{ tags: ['', '   '] }]).size).toBe(0)
  })

  it('handles a product with no tags at all', () => {
    expect(unreadTags([{}, { tags: [] }]).size).toBe(0)
  })
})
