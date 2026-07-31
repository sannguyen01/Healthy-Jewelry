// Healthy Jewelry — Price formatting utilities
//
// Every price the customer sees must be rendered in the currency Shopify
// actually charges in. Shopify returns a `Money { amount, currencyCode }` on
// every price field; that currencyCode is carried through `HJProduct` and the
// cart so nothing here ever has to guess. `CurrencyCode` is therefore a plain
// ISO-4217 string rather than a closed union — the store's presentment
// currency is a merchant setting, not a compile-time constant.

export type CurrencyCode = string

// ISO-4217 currencies with no minor unit. Rendering "₫450,000.00" instead of
// "450.000 ₫" reads as broken to a Vietnamese customer, and Intl alone won't
// save us — its per-currency defaults are correct, but we override the
// fraction digits below and so have to special-case these ourselves.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

// Currencies whose conventional formatting (separators, symbol placement)
// differs enough from en-US to be worth a dedicated locale.
const CURRENCY_LOCALES: Record<string, string> = {
  VND: 'vi-VN',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  KRW: 'ko-KR',
}

/**
 * Number of minor-unit digits a currency is conventionally written with.
 * VND/JPY/KRW → 0, everything else → 2.
 */
export function currencyFractionDigits(currencyCode: CurrencyCode): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 0 : 2
}

/**
 * The locale a given currency should be rendered in. Falls back to en-US,
 * which is what the site used before multi-currency support existed.
 */
export function currencyLocale(currencyCode: CurrencyCode): string {
  return CURRENCY_LOCALES[currencyCode.toUpperCase()] ?? 'en-US'
}

/**
 * Format a price amount into a localised currency string.
 * Accepts both string and numeric amounts.
 *
 * Invalid or missing amounts format as zero rather than "NaN" — a price is
 * customer-facing, and a plausible "$0.00" next to a disabled buy button
 * beats "$NaN" in the middle of a product grid.
 */
export function formatPrice(amount: string | number, currencyCode: CurrencyCode = 'USD'): string {
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount
  const numeric = Number.isFinite(parsed) ? parsed : 0
  const code = (currencyCode || 'USD').toUpperCase()
  const digits = currencyFractionDigits(code)

  try {
    return new Intl.NumberFormat(currencyLocale(code), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(numeric)
  } catch {
    // Intl throws RangeError on a currency code it doesn't recognise (a typo
    // in Shopify config, say). Degrade to "<CODE> <amount>" rather than
    // taking down the render of an entire product grid.
    return `${code} ${numeric.toFixed(digits)}`
  }
}

/**
 * Format a price in VND.
 */
export function formatPriceVND(amount: number): string {
  return formatPrice(amount, 'VND')
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
  const parsedPrice = typeof price === 'string' ? parseFloat(price) : price
  const numericPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0

  if (compareAt === null || compareAt === undefined) {
    return {
      price: formatPrice(numericPrice, currencyCode),
      compareAt: null,
      isOnSale: false,
      discount: 0,
      discountPercent: 0,
    }
  }

  const parsedCompareAt = parseFloat(compareAt)
  const numericCompareAt = Number.isFinite(parsedCompareAt) ? parsedCompareAt : 0
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
