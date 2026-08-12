// Healthy Jewelry — the events this storefront can emit
//
// ## Why a closed union and not a string
//
// A typo'd event name is a metric that silently does not exist. Nothing errors,
// nothing logs, and the dashboard is simply missing a line nobody thinks to look
// for — which is this project's signature failure shape, the same one behind
// `material:steel`, the orphaned cache tag, and the retired API version. So the
// names are a union, the payloads are typed per event, and adding one is a
// deliberate edit here rather than a string invented at a call site.
//
// ## Why these seven
//
// They are the funnel, end to end. Headless is the reason that matters: Shopify's
// own analytics observes the **hosted checkout only**, so browsing, add-to-bag and
// every source of traffic are invisible to it. Conversion rate is currently
// uncomputable — the numerator lives in Shopify and the denominator lives nowhere.

import type { CheckoutError } from '@/store/cart'
import type { CurrencyCode } from '@/lib/utils/formatPrice'

/** Money as an event carries it: the amount and what it is denominated in. */
interface Priced {
  /** Minor-unit-free decimal string, as `HJProduct.price` holds it. */
  value: string
  currency: CurrencyCode
}

interface ProductRef {
  handle: string
  collection: string
  material: string
}

/**
 * Every event, with the payload it must carry.
 *
 * Discriminated on `name`, so a handler that switches on it is exhaustively
 * checked and adding an event without handling it is a compile error rather than
 * a silently dropped case.
 */
export type AnalyticsEvent =
  | ({ name: 'product_viewed' } & ProductRef & Priced)
  | { name: 'collection_viewed'; collection: string; productCount: number }
  | { name: 'search_performed'; query: string; resultCount: number }
  | ({ name: 'add_to_bag'; quantity: number } & ProductRef & Priced)
  | ({ name: 'remove_from_bag' } & ProductRef)
  | ({ name: 'checkout_started'; itemCount: number } & Priced)
  /**
   * The event that turns this project's most recurring symptom into a number.
   *
   * A customer hitting "Online checkout is temporarily unavailable" is currently
   * only knowable if they email. `reason` is the typed `CheckoutError`
   * discriminant, so `not-configured` (a deployment that cannot sell) and
   * `lines-unavailable` (something sold out) are countable separately — they are
   * completely different problems that render identical copy.
   */
  | { name: 'checkout_failed'; reason: CheckoutError; itemCount: number }

export type AnalyticsEventName = AnalyticsEvent['name']

/**
 * Every name, as a runtime array.
 *
 * Same reason `HJ_SVG_TYPES` and `HJ_COLLECTION_HANDLES` are arrays: a union
 * cannot be enumerated, so nothing could check that the sink accepts exactly the
 * events the storefront emits.
 */
export const ANALYTICS_EVENT_NAMES = [
  'product_viewed',
  'collection_viewed',
  'search_performed',
  'add_to_bag',
  'remove_from_bag',
  'checkout_started',
  'checkout_failed',
] as const

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
}

/**
 * Search queries are free text a customer typed, so they are the one field here
 * that could carry something personal — people paste email addresses and order
 * numbers into search boxes.
 *
 * Truncated and lower-cased rather than dropped: "what are people searching for"
 * is the single most actionable question a small store can ask of its own
 * analytics, and 64 characters is far more than any real jewellery query.
 */
export const MAX_QUERY_LENGTH = 64

export function sanitiseQuery(query: string): string {
  return query.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH)
}
