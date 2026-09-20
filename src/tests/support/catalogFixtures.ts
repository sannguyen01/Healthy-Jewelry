import type { CatalogCollection, CatalogProduct } from '@/lib/catalog/schema'

/**
 * **One `CatalogProduct` factory, shared by every test that needs a product.**
 *
 * ## Why this exists at all
 *
 * Before WS-4b each component spec declared its own product literal — twenty-odd lines
 * of `id`, `defaultVariantId`, `tags`, `price`, `compareAtPrice`, `currencyCode`,
 * `featuredImage`, `images`, `variants`. Seven files carried a copy. When the catalogue
 * record changed shape, all seven broke at once and each had to be re-derived by hand,
 * which is exactly the cost this decommission is trying not to pay twice.
 *
 * More importantly: a hand-written literal drifts from the schema silently. A test
 * asserting behaviour on a product whose `specification` is `''` when the schema says
 * `.min(1)` is asserting behaviour on a product the catalogue cannot hold. `makeProduct`
 * starts from a record that would validate and lets a spec override exactly the field it
 * is about, so what a test varies is visible in its own diff.
 *
 * ## Why it is not parsed through `productSchema`
 *
 * It could be, and deliberately is not. `catalog-schema.test.ts` owns the question of
 * whether the schema accepts and rejects the right things; this module owns the question
 * of what a component does with a record. Running every fixture through Zod would couple
 * the second to the first, so a schema tightening would fail two hundred component
 * assertions instead of the handful of schema assertions that are actually about it.
 *
 * `BASE` is held against the real schema once, in `catalog-fixture-contract.test.ts`, so
 * the fixture cannot drift away from what the catalogue can store while every individual
 * spec stays uncoupled from it.
 */
const BASE: CatalogProduct = {
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  materialLabel: 'Grade 23 Titanium',
  description: 'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
  specification: '2 mm · 1.8 g',
  sizes: ['5', '6', '7', '8', '9', '10', '11', '12'],
  availability: 'ask-an-ambassador',
  badge: null,
  media: { kind: 'illustration', svgType: 'ring-arc' },
  careInstructions: { state: 'pending' },
  sku: { state: 'pending' },
  lastReviewed: { state: 'pending' },
  legacyRedirects: [],
}

/**
 * A catalogue product, with whatever a spec needs changed.
 *
 * Shallow by design: `media`, `sku`, `careInstructions` and `lastReviewed` are
 * discriminated unions, and a deep merge across a union arm produces objects with two
 * discriminants — the one thing a union exists to make impossible.
 */
export function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { ...BASE, ...overrides }
}

/** The unmodified base record, for the contract test that validates it. */
export const BASE_PRODUCT: CatalogProduct = BASE

/** A product whose media is a real photograph. */
export function makePhotoProduct(
  overrides: Partial<CatalogProduct> = {}
): CatalogProduct {
  return makeProduct({
    media: {
      kind: 'photo',
      src: '/images/products/arc-band-titanium.jpg',
      alt: 'Arc Band in brushed titanium',
    },
    ...overrides,
  })
}

/** A product whose illustration has not been chosen yet. */
export function makePendingMediaProduct(
  overrides: Partial<CatalogProduct> = {}
): CatalogProduct {
  return makeProduct({ media: { kind: 'illustration-pending' }, ...overrides })
}

const BASE_COLLECTION: CatalogCollection = {
  handle: 'rings',
  title: 'Rings',
  description: 'Bands and stacking rings in implant-grade metal.',
}

export function makeCollection(
  overrides: Partial<CatalogCollection> = {}
): CatalogCollection {
  return { ...BASE_COLLECTION, ...overrides }
}
