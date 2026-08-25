import { describe, it, expect } from 'vitest'
import { stripByMaterial, duplicateAcrossStrips, dedupeInOrder } from '@/lib/utils/homepageStrips'
import type { HJMaterialHandle, HJProduct } from '@/lib/shopify/types'
import { hjProducts } from '@/lib/data/hj-data'

/**
 * Both defects these functions exist to remove were live on the static catalogue, so the
 * regression cases below are the real handles rather than invented ones — a fixture that
 * cannot reproduce the original bug is not evidence the bug is fixed.
 */

function product(
  handle: string,
  material: HJMaterialHandle,
  overrides: Partial<HJProduct> = {}
): HJProduct {
  return {
    id: `gid://shopify/Product/${handle}`,
    defaultVariantId: `gid://shopify/ProductVariant/${handle}`,
    handle,
    title: handle,
    collection: 'necklaces',
    material,
    tags: [],
    price: '100.00',
    compareAtPrice: null,
    currencyCode: 'USD',
    badge: null,
    description: '',
    spec: '',
    svgType: 'necklace-pendant',
    featuredImage: null,
    images: [],
    ...overrides,
  } as HJProduct
}

describe('stripByMaterial', () => {
  it('returns only products of the requested material', () => {
    const catalogue = [
      product('a-ti', 'titanium'),
      product('b-steel', 'surgical-steel'),
      product('c-nb', 'niobium'),
      product('d-ti', 'titanium'),
    ]

    expect(stripByMaterial(catalogue, 'titanium', []).map((p) => p.handle)).toEqual([
      'a-ti',
      'd-ti',
    ])
  })

  it('excludes products already shown in an earlier strip', () => {
    const catalogue = [product('a-ti', 'titanium'), product('b-ti', 'titanium')]

    const strip = stripByMaterial(catalogue, 'titanium', [product('a-ti', 'titanium')])

    expect(strip.map((p) => p.handle)).toEqual(['b-ti'])
  })

  it('preserves catalogue order and caps at the limit', () => {
    const catalogue = Array.from({ length: 12 }, (_, i) => product(`p${i}`, 'titanium'))

    const strip = stripByMaterial(catalogue, 'titanium', [], 8)

    expect(strip).toHaveLength(8)
    expect(strip[0].handle).toBe('p0')
    expect(strip[7].handle).toBe('p7')
  })

  it('returns an empty strip rather than throwing when nothing matches', () => {
    // A material with no stock must render an empty strip, not crash the homepage.
    expect(stripByMaterial([product('a-nb', 'niobium')], 'titanium', [])).toEqual([])
  })

  it('fixes the real TITANIUM strip: no steel or niobium under a titanium label', () => {
    // The regression, exactly: the strip was getProductsByCollection('necklaces'), which
    // returned drop-pendant-surgical-steel and link-chain-niobium — each rendering its own
    // material line, "316L Surgical Steel" and "Niobium", directly under the word TITANIUM.
    const necklaces = hjProducts.filter((p) => p.collection === 'necklaces')
    expect(necklaces.filter((p) => p.material !== 'titanium').map((p) => p.handle)).toEqual([
      'drop-pendant-surgical-steel',
      'link-chain-niobium',
    ])

    const strip = stripByMaterial(hjProducts, 'titanium', [])

    expect(strip.every((p) => p.material === 'titanium')).toBe(true)
    expect(strip.map((p) => p.handle)).not.toContain('drop-pendant-surgical-steel')
    expect(strip.map((p) => p.handle)).not.toContain('link-chain-niobium')
  })

  it('fixes the real repetition: nothing the first two strips already showed', () => {
    // 2 of the old strip's 4 cards were repeats — orbit-pendant-titanium carried its
    // "Bestseller" badge in both places.
    const bestsellers = hjProducts.filter((p) => p.badge === 'Bestseller')
    const newArrivals = hjProducts.filter((p) => p.badge === 'New')

    const strip = stripByMaterial(hjProducts, 'titanium', [...bestsellers, ...newArrivals])

    expect(strip.map((p) => p.handle)).not.toContain('orbit-pendant-titanium')
    expect(
      duplicateAcrossStrips([
        { label: 'BESTSELLING', products: bestsellers },
        { label: 'NEW ARRIVALS', products: newArrivals },
        { label: 'TITANIUM', products: strip },
      ])
    ).toEqual([])
  })
})

describe('dedupeInOrder', () => {
  it('keeps a shared product in the earlier strip only', () => {
    // The page's order is its priority order: BESTSELLING outranks NEW ARRIVALS.
    const shared = product('both', 'titanium')
    const [first, second] = dedupeInOrder([
      [shared, product('a', 'titanium')],
      [shared, product('b', 'titanium')],
    ])

    expect(first.map((p) => p.handle)).toEqual(['both', 'a'])
    expect(second.map((p) => p.handle)).toEqual(['b'])
  })

  it('reproduces the live-store case the E2E suite structurally cannot', () => {
    // BESTSELLING and NEW ARRIVALS are two independent Shopify queries, `tag:bestseller`
    // and `tag:new`. A product carrying both tags is returned by both — and `badge`
    // collapses to a single value with bestseller winning, so it renders the same
    // "Bestseller" pill in both strips.
    //
    // The static fallback cannot produce this: `badge` is one scalar field, so
    // `badge === 'Bestseller'` and `badge === 'New'` are disjoint by construction. That is
    // exactly why this case lives here — e2e/homepage-composition.spec.ts runs against
    // mock.myshopify.com and could never observe it, however carefully it asks.
    const doubleTagged = product('meridian-cuff', 'titanium', { badge: 'Bestseller' })
    const fromBestsellerQuery = [doubleTagged, product('tectonic-ring', 'titanium')]
    const fromNewQuery = [doubleTagged, product('nova-pendant', 'titanium')]

    expect(
      duplicateAcrossStrips([
        { label: 'BESTSELLING', products: fromBestsellerQuery },
        { label: 'NEW ARRIVALS', products: fromNewQuery },
      ])
    ).toEqual([{ handle: 'meridian-cuff', labels: ['BESTSELLING', 'NEW ARRIVALS'] }])

    const [bestsellers, newArrivals] = dedupeInOrder([fromBestsellerQuery, fromNewQuery])

    expect(
      duplicateAcrossStrips([
        { label: 'BESTSELLING', products: bestsellers },
        { label: 'NEW ARRIVALS', products: newArrivals },
      ])
    ).toEqual([])
    expect(newArrivals.map((p) => p.handle)).toEqual(['nova-pendant'])
  })

  it('collapses a product repeated within one strip', () => {
    // A hand-curated or paginated Shopify collection can return the same product twice.
    const twice = product('a', 'titanium')

    expect(dedupeInOrder([[twice, twice]])[0]).toHaveLength(1)
  })

  it('preserves order and leaves disjoint strips untouched', () => {
    const strips = [
      [product('a', 'titanium'), product('b', 'titanium')],
      [product('c', 'titanium')],
    ]

    expect(dedupeInOrder(strips).map((s) => s.map((p) => p.handle))).toEqual([['a', 'b'], ['c']])
  })

  it('handles empty input without inventing a strip', () => {
    expect(dedupeInOrder([])).toEqual([])
    expect(dedupeInOrder([[]])).toEqual([[]])
  })
})

describe('duplicateAcrossStrips', () => {
  it('reports a handle shared by two strips, naming both', () => {
    const shared = product('orbit-pendant-titanium', 'titanium')

    expect(
      duplicateAcrossStrips([
        { label: 'BESTSELLING', products: [shared, product('a', 'titanium')] },
        { label: 'TITANIUM', products: [shared] },
      ])
    ).toEqual([{ handle: 'orbit-pendant-titanium', labels: ['BESTSELLING', 'TITANIUM'] }])
  })

  it('reports nothing when the strips are disjoint', () => {
    // The passing branch has to be exercised too — a detector only ever seen firing is as
    // unproven as one only ever seen silent.
    expect(
      duplicateAcrossStrips([
        { label: 'BESTSELLING', products: [product('a', 'titanium')] },
        { label: 'TITANIUM', products: [product('b', 'titanium')] },
      ])
    ).toEqual([])
  })

  it('does not report a product repeated within a single strip', () => {
    // A different defect with a different fix. Counting it here would make the cross-strip
    // signal ambiguous, so each strip contributes its label at most once.
    const twice = product('a', 'titanium')

    expect(duplicateAcrossStrips([{ label: 'BESTSELLING', products: [twice, twice] }])).toEqual([])
  })

  it('handles the empty case without inventing a finding', () => {
    expect(duplicateAcrossStrips([])).toEqual([])
    expect(duplicateAcrossStrips([{ label: 'BESTSELLING', products: [] }])).toEqual([])
  })
})
