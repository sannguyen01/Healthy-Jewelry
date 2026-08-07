// Healthy Jewelry — Price formatting utilities

export type CurrencyCode = 'USD' | 'VND' | 'EUR' | 'GBP'

/**
 * The locale each currency is conventionally written in.
 *
 * Formatting every currency as `en-US` puts the symbol in front of the amount,
 * which is right for dollars and wrong for dong: Vietnamese convention is
 * `1.450.000 ₫`, and the connected store's own money format is
 * `{{amount_no_decimals_with_comma_separator}}₫`. Rendering `₫1,450,000` on the
 * product page and handing the customer to a checkout that says `1.450.000₫`
 * makes two correct prices look like two different prices, at the moment they
 * are deciding to pay.
 */
const CURRENCY_LOCALE: Readonly<Record<CurrencyCode, string>> = {
  USD: 'en-US',
  VND: 'vi-VN',
  EUR: 'de-DE',
  GBP: 'en-GB',
}

/**
 * Currencies with no minor unit. Rendering two decimal places on a dong amount
 * reads as a hundredfold error — "₫89.00" is not a price anyone in Vietnam
 * would recognise.
 */
const ZERO_DECIMAL: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['VND'])

/**
 * Format a price amount into a localised currency string.
 * Accepts both string and numeric amounts.
 */
export function formatPrice(amount: string | number, currencyCode: CurrencyCode = 'USD'): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount
  const fractionDigits = ZERO_DECIMAL.has(currencyCode) ? 0 : 2

  return new Intl.NumberFormat(CURRENCY_LOCALE[currencyCode] ?? 'en-US', {
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
 *
 * Now a thin alias for `formatPrice(amount, 'VND')` rather than a second
 * implementation. It was the only function that already knew dong is written
 * `vi-VN` with no decimals, while `formatPrice` — the one every component
 * actually calls — did not. Two functions disagreeing about how to write the
 * same currency is how a site ends up quoting two different prices for one
 * product.
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
