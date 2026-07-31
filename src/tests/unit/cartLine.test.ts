import { describe, it, expect } from 'vitest'
import { describeVariant, cartLineLabel } from '@/lib/utils/cartLine'

describe('describeVariant', () => {
  it('describes a single selected option', () => {
    expect(describeVariant({ selectedOptions: [{ name: 'Size', value: '9' }] })).toBe('Size 9')
  })

  it('joins multiple options', () => {
    expect(
      describeVariant({
        selectedOptions: [
          { name: 'Size', value: '9' },
          { name: 'Finish', value: 'Brushed' },
        ],
      })
    ).toBe('Size 9 · Finish Brushed')
  })

  it('keeps the full option value, including the measurement', () => {
    expect(describeVariant({ selectedOptions: [{ name: 'Size', value: 'M (175mm)' }] })).toBe(
      'Size M (175mm)'
    )
  })

  // Shopify gives every unsized product a "Default Title" variant. Rendering
  // "Default Title" under a necklace would look like a data bug to a customer.
  it('returns null for Shopify\'s Default Title placeholder', () => {
    expect(describeVariant({ variantTitle: 'Default Title', selectedOptions: [] })).toBeNull()
  })

  it('ignores a Default Title option value', () => {
    expect(
      describeVariant({ selectedOptions: [{ name: 'Title', value: 'Default Title' }] })
    ).toBeNull()
  })

  it('returns null when there is nothing to describe', () => {
    expect(describeVariant({})).toBeNull()
    expect(describeVariant({ variantTitle: '', selectedOptions: [] })).toBeNull()
  })

  it('falls back to the variant title when options are absent', () => {
    expect(describeVariant({ variantTitle: '9' })).toBe('9')
  })

  it('prefers selected options over the variant title', () => {
    expect(
      describeVariant({ variantTitle: '9', selectedOptions: [{ name: 'Size', value: '9' }] })
    ).toBe('Size 9')
  })

  it('drops option entries with an empty value', () => {
    expect(
      describeVariant({
        selectedOptions: [
          { name: 'Size', value: '' },
          { name: 'Finish', value: 'Brushed' },
        ],
      })
    ).toBe('Finish Brushed')
  })
})

describe('cartLineLabel', () => {
  // "Remove Arc Band" is ambiguous when the bag holds two sizes of it.
  it('disambiguates two sizes of the same product', () => {
    const seven = cartLineLabel('Arc Band', { selectedOptions: [{ name: 'Size', value: '7' }] })
    const nine = cartLineLabel('Arc Band', { selectedOptions: [{ name: 'Size', value: '9' }] })
    expect(seven).toBe('Arc Band, Size 7')
    expect(nine).toBe('Arc Band, Size 9')
    expect(seven).not.toBe(nine)
  })

  it('uses the bare product title when there is no variant to name', () => {
    expect(cartLineLabel('Disc Studs', { variantTitle: 'Default Title' })).toBe('Disc Studs')
  })
})
