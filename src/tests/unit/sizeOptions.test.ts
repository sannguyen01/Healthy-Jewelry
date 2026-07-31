import { describe, it, expect } from 'vitest'
import { buildSizeOptions, shortSizeLabel } from '@/components/product/SizePicker'
import { makeSizedVariants, makeVariant } from '@/test/factories'
import type { ProductOption } from '@/lib/shopify/types'

describe('shortSizeLabel', () => {
  it('strips the parenthetical measurement', () => {
    expect(shortSizeLabel('M (175mm)')).toBe('M')
  })

  it('leaves a plain value alone', () => {
    expect(shortSizeLabel('9')).toBe('9')
  })

  it('does not strip a leading parenthesis', () => {
    expect(shortSizeLabel('(special)')).toBe('(special)')
  })
})

describe('buildSizeOptions', () => {
  it('builds one entry per Shopify option value', () => {
    const { option, variants } = makeSizedVariants(['7', '8', '9'])
    const built = buildSizeOptions([option], variants)
    expect(built?.name).toBe('Size')
    expect(built?.sizes.map((s) => s.value)).toEqual(['7', '8', '9'])
  })

  it('marks a variant that is out of stock as unavailable', () => {
    const { option, variants } = makeSizedVariants(['7', '8'], { unavailable: ['8'] })
    const built = buildSizeOptions([option], variants)
    expect(built?.sizes.find((s) => s.value === '7')?.available).toBe(true)
    expect(built?.sizes.find((s) => s.value === '8')?.available).toBe(false)
  })

  // The old hardcoded picker offered sizes 5–12 regardless of catalog. A size
  // with no variant left "Add to Bag" permanently disabled with no explanation.
  it('flags an option value that has no matching variant', () => {
    const { variants } = makeSizedVariants(['7'])
    const option: ProductOption = { id: 'o', name: 'Size', values: ['7', '12'] }
    const built = buildSizeOptions([option], variants)
    expect(built?.sizes.find((s) => s.value === '7')?.missing).toBe(false)
    expect(built?.sizes.find((s) => s.value === '12')?.missing).toBe(true)
  })

  it('returns null when the product has no options', () => {
    expect(buildSizeOptions([], [])).toBeNull()
  })

  it('returns null when there is no size-like option', () => {
    const option: ProductOption = { id: 'o', name: 'Finish', values: ['Brushed', 'Polished'] }
    expect(buildSizeOptions([option], [])).toBeNull()
  })

  // Shopify represents an unsized product as a single "Title: Default Title"
  // option; offering a one-item picker for it is noise.
  it('returns null for a single-value placeholder option', () => {
    const option: ProductOption = { id: 'o', name: 'Title', values: ['Default Title'] }
    expect(buildSizeOptions([option], [])).toBeNull()
  })

  it('returns null for an option with no values', () => {
    const option: ProductOption = { id: 'o', name: 'Size', values: [] }
    expect(buildSizeOptions([option], [])).toBeNull()
  })

  it('matches the option name case-insensitively', () => {
    const option: ProductOption = { id: 'o', name: 'SIZE', values: ['7', '8'] }
    const variants = [
      makeVariant({ selectedOptions: [{ name: 'size', value: '7' }] }),
      makeVariant({ selectedOptions: [{ name: 'Size', value: '8' }] }),
    ]
    const built = buildSizeOptions([option], variants)
    expect(built?.sizes.every((s) => !s.missing)).toBe(true)
  })

  it('recognises a Vietnamese size option name', () => {
    const option: ProductOption = { id: 'o', name: 'Kích cỡ', values: ['7', '8'] }
    expect(buildSizeOptions([option], [])?.name).toBe('Kích cỡ')
  })

  it('selects a named option over the default size heuristic', () => {
    const size: ProductOption = { id: 'o1', name: 'Size', values: ['7', '8'] }
    const finish: ProductOption = { id: 'o2', name: 'Finish', values: ['Brushed', 'Polished'] }
    expect(buildSizeOptions([size, finish], [], 'Finish')?.name).toBe('Finish')
  })

  it('treats a size as available when any matching variant is in stock', () => {
    const option: ProductOption = { id: 'o', name: 'Size', values: ['7', '8'] }
    const variants = [
      makeVariant({ availableForSale: false, selectedOptions: [{ name: 'Size', value: '7' }] }),
      makeVariant({ availableForSale: true, selectedOptions: [{ name: 'Size', value: '7' }] }),
      makeVariant({ availableForSale: false, selectedOptions: [{ name: 'Size', value: '8' }] }),
    ]
    const built = buildSizeOptions([option], variants)
    expect(built?.sizes.find((s) => s.value === '7')?.available).toBe(true)
    expect(built?.sizes.find((s) => s.value === '8')?.available).toBe(false)
  })
})
