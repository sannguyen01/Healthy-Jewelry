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

import type { SearchFacet } from '@/lib/catalog'
import type { CollectionHandle, MaterialHandle } from '@/lib/catalog/schema'

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
  collection: CollectionHandle
  material: MaterialHandle
}

/**
 * What a search was *about*, never what was typed: each collection or material the query
 * named, as the catalogue spells it (`searchFacets()` in `src/lib/catalog`).
 *
 * Until 2026-09-27 `search_performed` carried the query itself, lower-cased and cut to 64
 * characters, on the reasoning that "what are people searching for" is the most actionable
 * question a small catalogue can ask. It is — and an email address, a phone number and an
 * order reference all fit in 64 characters, and people paste all three into search boxes.
 * Truncation bounded the length of what could leak, not whether it could. Facets keep the
 * useful half (which shelves people look for, and which searches find nothing) and cannot
 * hold a word the catalogue did not already contain.
 */
export type { SearchFacet }

/**
 * Every event, with the payload it must carry.
 *
 * Discriminated on `name`, so a handler that switches on it is exhaustively
 * checked and adding an event without handling it is a compile error rather than
 * a silently dropped case.
 */
export type AnalyticsEvent =
  | ({ name: 'product_viewed' } & ProductRef)
  | { name: 'collection_viewed'; collection: CollectionHandle; productCount: number }
  | { name: 'search_performed'; resultCount: number; facets: SearchFacet[] }
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
