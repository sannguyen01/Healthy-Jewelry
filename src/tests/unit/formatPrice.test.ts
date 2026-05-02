import { describe, it, expect } from 'vitest'
import { formatPrice, formatPriceVND, formatCompareAtPrice } from '@/lib/utils/formatPrice'

describe('formatPrice', () => {
  it('formats a string amount in USD', () => {
    expect(formatPrice('89.00', 'USD')).toBe('$89.00')
  })

  it('formats a numeric amount in USD', () => {
    expect(formatPrice(89, 'USD')).toBe('$89.00')
  })

  it('formats zero correctly', () => {
    expect(formatPrice('0', 'USD')).toBe('$0.00')
  })

  it('formats a large amount with thousands separator', () => {
    expect(formatPrice('1234567.89', 'USD')).toBe('$1,234,567.89')
  })

  it('defaults to USD when no currency is provided', () => {
    expect(formatPrice('50.00')).toBe('$50.00')
  })

  it('formats EUR amounts', () => {
    expect(formatPrice('100.00', 'EUR')).toContain('100')
  })
})

describe('formatPriceVND', () => {
  it('returns a non-empty string for VND amounts', () => {
    const result = formatPriceVND(1000000)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains the numeric digits of the amount', () => {
    const result = formatPriceVND(1000000)
    // Locale formatting may vary (1.000.000 or 1,000,000) but digits must appear
    expect(result).toMatch(/1[.,\s]?0{3}[.,\s]?0{3}|1000000/)
  })

  it('formats zero correctly', () => {
    const result = formatPriceVND(0)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('formatCompareAtPrice', () => {
  it('returns isOnSale false when compareAt is null', () => {
    const result = formatCompareAtPrice('89', null)
    expect(result.isOnSale).toBe(false)
    expect(result.compareAt).toBeNull()
    expect(result.discount).toBe(0)
    expect(result.discountPercent).toBe(0)
  })

  it('returns correct sale data when compareAt is higher', () => {
    // 130 - 98 = 32; 32/130 = 24.6% → rounds to 25
    const result = formatCompareAtPrice('98', '130')
    expect(result.isOnSale).toBe(true)
    expect(result.discountPercent).toBe(25)
    expect(result.discount).toBeCloseTo(32, 5)
  })

  it('returns isOnSale false when price equals compareAt', () => {
    const result = formatCompareAtPrice('89', '89')
    expect(result.isOnSale).toBe(false)
    expect(result.compareAt).toBeNull()
    expect(result.discountPercent).toBe(0)
  })

  it('returns isOnSale false when both price and compareAt are 0', () => {
    const result = formatCompareAtPrice('0', '0')
    expect(result.isOnSale).toBe(false)
    expect(result.discountPercent).toBe(0)
  })

  it('returns formatted price string in result', () => {
    const result = formatCompareAtPrice('89', null)
    expect(result.price).toBe('$89.00')
  })

  it('includes formatted compareAt string when on sale', () => {
    const result = formatCompareAtPrice('98', '130')
    expect(result.compareAt).toBe('$130.00')
    expect(result.price).toBe('$98.00')
  })

  it('returns isOnSale false when price is higher than compareAt', () => {
    const result = formatCompareAtPrice('150', '100')
    expect(result.isOnSale).toBe(false)
    expect(result.discount).toBe(0)
    expect(result.discountPercent).toBe(0)
  })

  it('accepts numeric price argument', () => {
    const result = formatCompareAtPrice(89, null)
    expect(result.price).toBe('$89.00')
    expect(result.isOnSale).toBe(false)
  })
})
