import { describe, it, expect } from 'vitest'
import { productSchema, collectionSchema } from '@/lib/catalog/schema'
import {
  BASE_PRODUCT,
  makeCollection,
  makePendingMediaProduct,
  makePhotoProduct,
  makeProduct,
} from '@/tests/support/catalogFixtures'

/**
 * **The fixture is held against the schema here, once, so no spec has to be.**
 *
 * `src/tests/support/catalogFixtures.ts` deliberately does *not* run its records through
 * Zod — that would couple every component assertion to the schema's own tests. The cost
 * of that decision is the risk this file removes: a fixture that has quietly stopped
 * being a shape the catalogue could hold, used by two hundred assertions that all still
 * pass.
 *
 * That is not hypothetical in this repository. Before WS-4b, `ProductImage.test.tsx`
 * built products with `spec: ''` while the catalogue's own records all carried a real
 * specification line — so the component was proven against a record no page would ever
 * receive, and the empty-spec branch it exercised was one the site did not have.
 *
 * Every exported factory is checked, not only the base: `makePhotoProduct` and
 * `makePendingMediaProduct` each replace a discriminated-union arm, which is exactly
 * where a shallow spread can produce something well-typed and invalid.
 */
describe('the shared catalogue fixture is a record the catalogue could hold', () => {
  it('the base product validates', () => {
    const result = productSchema.safeParse(BASE_PRODUCT)
    expect(
      result.success,
      `The fixture in src/tests/support/catalogFixtures.ts no longer satisfies ` +
        `productSchema. Every component spec builds on it, so they are all now asserting ` +
        `behaviour against a record no page can receive.\n\n` +
        JSON.stringify(result.error, null, 2)
    ).toBe(true)
  })

  it('the photograph variant validates', () => {
    expect(productSchema.safeParse(makePhotoProduct()).success).toBe(true)
  })

  it('the pending-illustration variant validates', () => {
    expect(productSchema.safeParse(makePendingMediaProduct()).success).toBe(true)
  })

  it('the collection fixture validates', () => {
    expect(collectionSchema.safeParse(makeCollection()).success).toBe(true)
  })

  it('an override still produces a valid record', () => {
    const overridden = makeProduct({ collection: 'charms', badge: 'new', sizes: [] })
    expect(productSchema.safeParse(overridden).success).toBe(true)
  })

  it('an override that breaks the schema is caught here rather than in a component spec', () => {
    // The guarantee stated in the other direction: this file can actually fail. A spec
    // overriding `specification` with an empty string is building something the schema
    // rejects, and nothing in a render assertion would say so.
    expect(productSchema.safeParse(makeProduct({ specification: '' })).success).toBe(false)
  })
})
