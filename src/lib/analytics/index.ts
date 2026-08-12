// Healthy Jewelry — the one way the storefront reports what happened
//
// ## What this is for
//
// The site had no analytics of any kind. That matters more for a headless
// storefront than for a themed one: Shopify's built-in analytics observes the
// **hosted checkout only**, so every product view, every add-to-bag and every
// source of traffic is invisible to it. Conversion rate is not a number anyone can
// currently compute, because the numerator lives in Shopify and the denominator
// lives nowhere.
//
// ## Why a façade rather than a vendor call at each site
//
// One place to gate on consent, one place to drop events when unconfigured, one
// place to change if the sink ever changes. Sprinkling a vendor's global across
// twelve components is how a consent gate ends up covering eleven of them.
//
// ## Why it fails silently, and only silently
//
// Every failure path here is a no-op. Analytics is the least important thing a
// storefront does; a measurement that can break a page, block an interaction, or
// throw inside a click handler is strictly worse than no measurement. `track()`
// never throws, never awaits anything the caller depends on, and returns whether
// it sent — for tests, not for control flow.

import type { AnalyticsEvent } from './events'
import { sanitiseQuery } from './events'
import { analyticsAllowed, readConsent, type ConsentState } from './consent'

export type { AnalyticsEvent, AnalyticsEventName } from './events'
export { ANALYTICS_EVENT_NAMES, isAnalyticsEventName, sanitiseQuery } from './events'
export * from './consent'

/** Where events go. Swappable so tests never touch the network. */
export interface AnalyticsSink {
  send(event: AnalyticsEvent): void
}

/**
 * First-party, same-origin, fire-and-forget.
 *
 * `sendBeacon` rather than `fetch`: a click that navigates away — which describes
 * `add_to_bag` and `checkout_started`, the two events that matter most — cancels
 * an in-flight `fetch` and delivers nothing. Beacons are queued by the browser and
 * survive the unload. `fetch` with `keepalive` is the fallback for the rare
 * browser without it.
 *
 * Same-origin on purpose: no third-party script, nothing to load, nothing that can
 * block rendering or be blamed for a Lighthouse score. `/api/analytics` decides
 * what to do with the event server-side, so changing that never touches the client.
 */
class BeaconSink implements AnalyticsSink {
  send(event: AnalyticsEvent): void {
    const body = JSON.stringify(event)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))
        return
      }
      void fetch('/api/analytics', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    } catch {
      // A blocked beacon, an extension, a quota — none of it is worth a broken page.
    }
  }
}

let sink: AnalyticsSink = new BeaconSink()

/** Test seam. Nothing in the app calls this. */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next
}

/** Reads the real consent state in a browser; `unset` on the server. */
function currentConsent(): ConsentState {
  if (typeof window === 'undefined') return 'unset'
  return readConsent(window.localStorage)
}

/**
 * Record that something happened, if the visitor has agreed to be recorded.
 *
 * Returns `true` when the event was handed to the sink. That is a signal for
 * tests, not a result to branch on — a caller that behaves differently depending
 * on whether analytics fired has made analytics load-bearing, which is exactly
 * what the silent-failure rule above exists to prevent.
 */
export function track(event: AnalyticsEvent, consent: ConsentState = currentConsent()): boolean {
  if (!analyticsAllowed(consent)) return false

  try {
    // Free text is the one field that could carry something personal — people
    // paste order numbers and email addresses into search boxes. Sanitised here,
    // at the boundary, rather than trusted to every call site.
    const safe: AnalyticsEvent =
      event.name === 'search_performed'
        ? { ...event, query: sanitiseQuery(event.query) }
        : event

    sink.send(safe)
    return true
  } catch {
    return false
  }
}
