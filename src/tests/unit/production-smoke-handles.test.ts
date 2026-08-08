import { describe, it, expect } from 'vitest'
import { getAllProducts } from '@/lib/data/hj-data'

const { FALLBACK_ONLY_HANDLES, SHOPIFY_ONLY_HANDLES } = await import(
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
