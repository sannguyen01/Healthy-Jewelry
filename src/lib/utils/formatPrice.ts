// Healthy Jewelry — Price formatting utilities

export type CurrencyCode = 'USD' | 'VND' | 'EUR' | 'GBP'

/**
 * Format a price amount into a localised currency string.
 * Accepts both string and numeric amounts.
 */
export function formatPrice(
  amount: string | number,
  currencyCode: CurrencyCode = 'USD'
): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)
}

/**
 * Format a price in Vietnamese Dong (VND).
 */
export function formatPriceVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export interface CompareAtPriceResult {
  price: string
  compareAt: string | null
  isOnSale: boolean
  discount: number
  discountPercent: number
}

/**
 * Compare a price against a compareAt price to determine sale status.
 * Returns formatted strings plus sale flags.
 */
export function formatCompareAtPrice(
  price: string | number,
  compareAt: string | null,
  currencyCode: CurrencyCode = 'USD'
): CompareAtPriceResult {
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price

  if (compareAt === null || compareAt === undefined) {
    return {
      price: formatPrice(numericPrice, currencyCode),
      compareAt: null,
      isOnSale: false,
      discount: 0,
      discountPercent: 0,
    }
  }

  const numericCompareAt = parseFloat(compareAt)
  const isOnSale = numericCompareAt > numericPrice
  const discount = isOnSale ? numericCompareAt - numericPrice : 0
  const discountPercent = isOnSale
    ? Math.round(((numericCompareAt - numericPrice) / numericCompareAt) * 100)
    : 0

  return {
    price: formatPrice(numericPrice, currencyCode),
    compareAt: isOnSale ? formatPrice(numericCompareAt, currencyCode) : null,
    isOnSale,
    discount,
    discountPercent,
  }
}
