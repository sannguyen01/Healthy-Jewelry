import { describe, expect, it } from 'vitest'
import { allVariantIdsAreReal, isPlaceholderVariantId } from '@/lib/shopify/variant-id'
import { hjProducts } from '@/lib/data/hj-data'

describe('isPlaceholderVariantId', () => {
  it('accepts a real Shopify variant GID', () => {
    expect(isPlaceholderVariantId('gid://shopify/ProductVariant/44123456789')).toBe(false)
  })

  it('accepts a real GID carrying a query string', () => {
    // Shopify sometimes appends parameters to a gid.
    expect(isPlaceholderVariantId('gid://shopify/ProductVariant/44123456789?namespace=x')).toBe(
      false
    )
  })

  it('rejects the static catalog placeholders', () => {
    expect(isPlaceholderVariantId('gid://shopify/ProductVariant/hj-001-default')).toBe(true)
  })

  it('rejects an empty or missing id', () => {
    expect(isPlaceholderVariantId('')).toBe(true)
    expect(isPlaceholderVariantId(null)).toBe(true)
    expect(isPlaceholderVariantId(undefined)).toBe(true)
  })

  it('rejects a bare handle with no gid structure', () => {
    expect(isPlaceholderVariantId('arc-band-titanium')).toBe(true)
  })

  it('rejects a gid whose id segment is non-numeric', () => {
    expect(isPlaceholderVariantId('gid://shopify/ProductVariant/not-a-number')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isPlaceholderVariantId('  gid://shopify/ProductVariant/44123456789  ')).toBe(false)
  })
})

describe('allVariantIdsAreReal', () => {
  it('is true only when every id is real', () => {
    expect(
      allVariantIdsAreReal([
        'gid://shopify/ProductVariant/1',
        'gid://shopify/ProductVariant/2',
      ])
    ).toBe(true)
  })

  it('is false when any id is a placeholder', () => {
    expect(
      allVariantIdsAreReal([
        'gid://shopify/ProductVariant/1',
        'gid://shopify/ProductVariant/hj-002-default',
      ])
    ).toBe(false)
  })

  it('is false for an empty cart rather than vacuously true', () => {
    expect(allVariantIdsAreReal([])).toBe(false)
  })
})

describe('the static fallback catalog', () => {
  it('is entirely placeholder ids, which is what makes the guard necessary', () => {
    // Documents the actual situation this guard exists for: every product in
    // the bundled fallback catalog is unusable for checkout. If real Shopify
    // ids ever get committed here, this fails and the guard needs rethinking.
    const realIds = hjProducts.filter((p) => !isPlaceholderVariantId(p.defaultVariantId))
    expect(realIds.map((p) => p.handle)).toEqual([])
  })
})
