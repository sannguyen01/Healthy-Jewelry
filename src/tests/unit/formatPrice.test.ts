import { describe, it, expect } from 'vitest'
import { formatPrice } from '@/lib/utils/formatPrice'

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
