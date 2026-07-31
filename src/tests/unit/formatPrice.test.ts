import { describe, it, expect } from 'vitest'
import {
  formatPrice,
  formatPriceVND,
  formatCompareAtPrice,
  currencyFractionDigits,
  currencyLocale,
} from '@/lib/utils/formatPrice'

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

// ── Multi-currency ─────────────────────────────────────────────────────────
//
// The storefront hardcoded 'USD' at every call site while the store charges in
// its own presentment currency. For a Vietnam-based store that misstated every
// price by roughly 25,000x.

describe('formatPrice — zero-decimal currencies', () => {
  it('renders VND with no decimal places', () => {
    const result = formatPrice('2450000', 'VND')
    expect(result).not.toMatch(/[.,]00\b/)
    expect(result).toMatch(/2[.,\s]?450[.,\s]?000/)
  })

  it('renders JPY with no decimal places', () => {
    expect(formatPrice('1200', 'JPY')).not.toMatch(/\.00/)
  })

  it('renders KRW with no decimal places', () => {
    expect(formatPrice('15000', 'KRW')).not.toMatch(/\.00/)
  })

  it('keeps two decimals for a minor-unit currency', () => {
    expect(formatPrice('89', 'USD')).toBe('$89.00')
  })

  it('rounds rather than truncating a fractional VND amount', () => {
    expect(formatPrice('2450000.6', 'VND')).toMatch(/2[.,\s]?450[.,\s]?001/)
  })
})

describe('currencyFractionDigits', () => {
  it('reports 0 for VND', () => {
    expect(currencyFractionDigits('VND')).toBe(0)
  })

  it('reports 2 for USD', () => {
    expect(currencyFractionDigits('USD')).toBe(2)
  })

  it('is case-insensitive', () => {
    expect(currencyFractionDigits('vnd')).toBe(0)
  })

  it('defaults to 2 for an unknown code', () => {
    expect(currencyFractionDigits('XYZ')).toBe(2)
  })
})

describe('currencyLocale', () => {
  it('uses vi-VN for VND', () => {
    expect(currencyLocale('VND')).toBe('vi-VN')
  })

  it('falls back to en-US for an unmapped currency', () => {
    expect(currencyLocale('AUD')).toBe('en-US')
  })
})

describe('formatPrice — resilience', () => {
  // A price is customer-facing; "$NaN" in a product grid is worse than a
  // plausible zero next to a disabled buy button.
  it('formats a non-numeric amount as zero rather than NaN', () => {
    expect(formatPrice('not-a-number', 'USD')).toBe('$0.00')
  })

  it('formats undefined-ish empty input as zero', () => {
    expect(formatPrice('', 'USD')).toBe('$0.00')
  })

  it('does not throw on an unrecognised currency code', () => {
    const result = formatPrice('89', 'ZZZ')
    expect(result).toContain('89')
    expect(result).toContain('ZZZ')
  })

  it('accepts a lowercase currency code', () => {
    expect(formatPrice('89', 'usd')).toBe('$89.00')
  })

  it('treats an empty currency code as USD', () => {
    expect(formatPrice('89', '')).toBe('$89.00')
  })
})

describe('formatCompareAtPrice — currency awareness', () => {
  it('formats both figures in the given currency', () => {
    const result = formatCompareAtPrice('2450000', '2900000', 'VND')
    expect(result.isOnSale).toBe(true)
    expect(result.price).not.toMatch(/\$/)
    expect(result.compareAt).not.toMatch(/\$/)
  })

  it('computes the discount percentage independent of currency', () => {
    expect(formatCompareAtPrice('98', '130', 'VND').discountPercent).toBe(25)
  })

  it('treats a non-numeric compareAt as no sale', () => {
    const result = formatCompareAtPrice('98', 'oops')
    expect(result.isOnSale).toBe(false)
    expect(result.discountPercent).toBe(0)
  })
})
