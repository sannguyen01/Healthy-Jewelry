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

/*
 * `cartCurrencyCode`, `formatPriceVND`, `formatCompareAtPrice` and `CompareAtPriceResult`
 * were here, and all four are gone with the commerce UI.
 *
 * `cartCurrencyCode` answered "what currency is this bag denominated in" for a bag that no
 * longer exists. `formatCompareAtPrice` and its result type computed sale status from a
 * compare-at price, which is also what the `Sale` badge was derived from — both went when
 * there were no prices to be below. `formatPriceVND` had no caller at all.
 *
 * Deleted rather than left for WS-5b, because unreachable code does not sit still: it drags
 * the per-file coverage floor down until somebody either writes tests for behaviour nothing
 * uses or quietly lowers the threshold. This file failed `thresholds.perFile` at 79.36%
 * lines the moment the cart went, which is how the four were found.
 *
 * `formatPrice` itself stays: prices are still rendered on cards and the detail page. It
 * goes in WS-5b with them.
 */
