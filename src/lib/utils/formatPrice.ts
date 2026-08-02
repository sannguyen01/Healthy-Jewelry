// Healthy Jewelry — Price formatting utilities

export type CurrencyCode = 'USD' | 'VND' | 'EUR' | 'GBP'

/**
 * Format a price amount into a localised currency string.
 * Accepts both string and numeric amounts.
 */
export function formatPrice(amount: string | number, currencyCode: CurrencyCode = 'USD'): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount

  // VND has no minor unit — "₫89.00" is wrong, and rendering two decimal
  // places on a dong amount reads as a hundredfold error.
  const fractionDigits = currencyCode === 'VND' ? 0 : 2

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric)
}

/**
 * The currency a bag should be totalled in.
 *
 * A single Shopify store sells in one currency, so in practice every line
 * agrees. This exists so the answer is defined rather than assumed: an empty
 * bag falls back to USD, and a genuinely mixed bag takes the first line and
 * warns instead of silently totalling two currencies into one number.
 */
export function cartCurrencyCode(
  items: readonly { product: { currencyCode?: CurrencyCode } }[]
): CurrencyCode {
  const codes = new Set(
    items.map((item) => item.product.currencyCode).filter((code): code is CurrencyCode => !!code)
  )
  if (codes.size === 0) return 'USD'
  if (codes.size > 1) {
    console.warn(
      `[HJ] bag contains mixed currencies (${[...codes].join(', ')}) — totalling in ${[...codes][0]}`
    )
  }
  return [...codes][0]
}

/**
 * Format a price in VND.
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
