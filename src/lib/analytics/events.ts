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

/*
 * `Priced` was here — `{ value, currency }`, the money an event carried.
 *
 * It existed so a VND store could not report dollar amounts, which was a real defect.
 * There are no prices to report now. `product_viewed` keeps `ProductRef` (handle,
 * collection, material), because *which* piece someone looked at is still a fact worth
 * counting; what it cost is not a fact this site has.
 */

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
  | ({ name: 'product_viewed' } & ProductRef)
  | { name: 'collection_viewed'; collection: string; productCount: number }
  | { name: 'search_performed'; query: string; resultCount: number }
/*
 * `add_to_bag`, `remove_from_bag`, `checkout_started` and `checkout_failed` were here.
 *
 * All four are gone with the commerce UI that emitted them. `checkout_failed` is the one
 * worth a sentence, because it was the most useful event in this file: it turned "online
 * checkout is temporarily unavailable" from something only knowable when a customer
 * emailed into a number, split by the typed `CheckoutError` discriminant.
 *
 * Deleted rather than kept as a name nothing sends. An event vocabulary that outlives its
 * producers is a sink waiting for traffic that will never arrive, and the next reader
 * cannot tell "nobody bought anything today" from "nothing can emit this any more".
 */

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
