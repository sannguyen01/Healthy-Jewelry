import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  track,
  setAnalyticsSink,
  ANALYTICS_EVENT_NAMES,
  isAnalyticsEventName,
  sanitiseQuery,
  readConsent,
  writeConsent,
  analyticsAllowed,
  shouldAskForConsent,
  CONSENT_STORAGE_KEY,
  type AnalyticsEvent,
} from '@/lib/analytics'
import { MAX_QUERY_LENGTH } from '@/lib/analytics/events'

/**
 * **The default is off, and that is the assertion that matters most.**
 *
 * The store ships to 29 countries, fourteen of them in the EU. A consent gate
 * that fails open is worse than no analytics at all — it is a compliance problem
 * wearing the costume of a feature. So every ambiguous state resolves to "do not
 * track", and each of those states is pinned here rather than left to the
 * implementation's good intentions.
 *
 * The `granted` branch is the one that never runs in CI, which per ADR 002 makes
 * it the one most likely to be wrong; the sink is injectable so it runs here.
 */

const sent: AnalyticsEvent[] = []

beforeEach(() => {
  sent.length = 0
  setAnalyticsSink({ send: (event) => void sent.push(event) })
})

const productEvent: AnalyticsEvent = {
  name: 'product_viewed',
  handle: 'arc-band-titanium',
  collection: 'rings',
  material: 'titanium',
  value: '1450000',
  currency: 'VND',
}

describe('consent gate', () => {
  it('sends nothing when consent has not been given', () => {
    expect(track(productEvent, 'unset')).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('sends nothing when consent was declined', () => {
    expect(track(productEvent, 'denied')).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('sends when consent was granted', () => {
    expect(track(productEvent, 'granted')).toBe(true)
    expect(sent).toEqual([productEvent])
  })

  /**
   * `unset` is not "undecided, so probably fine". Treating it as permission is
   * the single most likely way this becomes a compliance problem, and it would
   * look identical to correct behaviour in every test that only checks the
   * granted path.
   */
  it('treats "not yet asked" as a no, not a maybe', () => {
    expect(analyticsAllowed('unset')).toBe(false)
    expect(analyticsAllowed('denied')).toBe(false)
    expect(analyticsAllowed('granted')).toBe(true)
  })

  it('asks only while the choice is unmade', () => {
    expect(shouldAskForConsent('unset')).toBe(true)
    expect(shouldAskForConsent('granted')).toBe(false)
    expect(shouldAskForConsent('denied')).toBe(false)
  })
})

describe('readConsent', () => {
  const storage = (value: string | null) => ({ getItem: () => value })

  it('reads a stored choice back', () => {
    expect(readConsent(storage('granted'))).toBe('granted')
    expect(readConsent(storage('denied'))).toBe('denied')
  })

  it('is unset when nothing is stored', () => {
    expect(readConsent(storage(null))).toBe('unset')
  })

  /**
   * A corrupted or hand-edited value must never resolve to `granted`. "We could
   * not tell" has to mean "do not track" — the same failure-direction rule that
   * makes an absent `X-Shopify-API-Version` header count as drift (ADR 009).
   */
  it.each(['yes', 'true', '1', 'GRANTED', '', 'null'])(
    'treats the unrecognised value %p as unset, never granted',
    (value) => {
      expect(readConsent(storage(value))).toBe('unset')
    }
  )

  it('is unset when storage is unavailable entirely', () => {
    expect(readConsent(undefined)).toBe('unset')
  })

  /** Safari in private mode throws on storage access. It must not break a render. */
  it('is unset when storage throws, rather than propagating', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(readConsent(throwing)).toBe('unset')
  })
})

describe('writeConsent', () => {
  it('stores the choice under the documented key', () => {
    const setItem = vi.fn()
    writeConsent({ setItem }, 'granted')
    expect(setItem).toHaveBeenCalledWith(CONSENT_STORAGE_KEY, 'granted')
  })

  it('swallows a storage failure rather than breaking the click', () => {
    const throwing = {
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => writeConsent(throwing, 'denied')).not.toThrow()
  })
})

describe('event names', () => {
  it('accepts every declared name', () => {
    for (const name of ANALYTICS_EVENT_NAMES) expect(isAnalyticsEventName(name)).toBe(true)
  })

  /**
   * The whole reason the names are a closed union: a typo is a metric that
   * silently does not exist, and nothing anywhere reports its absence.
   */
  it('rejects a near-miss rather than accepting it', () => {
    for (const name of ['add_to_cart', 'productViewed', 'page_view', '']) {
      expect(isAnalyticsEventName(name)).toBe(false)
    }
  })

  it('covers the whole funnel, so conversion is computable', () => {
    // Headless is why this matters: Shopify's own analytics sees the hosted
    // checkout only, so without a view event there is no denominator.
    expect(ANALYTICS_EVENT_NAMES).toContain('product_viewed')
    expect(ANALYTICS_EVENT_NAMES).toContain('add_to_bag')
    expect(ANALYTICS_EVENT_NAMES).toContain('checkout_started')
    expect(ANALYTICS_EVENT_NAMES).toContain('checkout_failed')
  })
})

describe('search queries are the one free-text field', () => {
  it('lower-cases and trims, so the same search counts once', () => {
    expect(sanitiseQuery('  Titanium Ring  ')).toBe('titanium ring')
  })

  /** People paste order numbers and email addresses into search boxes. */
  it('truncates a long query rather than storing it whole', () => {
    expect(sanitiseQuery('x'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH)
  })

  it('sanitises at the boundary, not at each call site', () => {
    track({ name: 'search_performed', query: '  TITANIUM  ', resultCount: 3 }, 'granted')
    expect(sent[0]).toMatchObject({ query: 'titanium' })
  })
})

describe('track never becomes load-bearing', () => {
  it('returns false instead of throwing when the sink throws', () => {
    setAnalyticsSink({
      send: () => {
        throw new Error('beacon blocked')
      },
    })
    // Analytics is the least important thing a storefront does. A measurement
    // that can throw inside a click handler is worse than no measurement.
    expect(() => track(productEvent, 'granted')).not.toThrow()
    expect(track(productEvent, 'granted')).toBe(false)
  })

  it('passes non-search events through untouched', () => {
    const event: AnalyticsEvent = { name: 'checkout_failed', reason: 'not-configured', itemCount: 2 }
    track(event, 'granted')
    expect(sent[0]).toEqual(event)
  })

  /**
   * The event that turns this project's most recurring symptom into a number.
   * `not-configured` and `lines-unavailable` render identical copy to a customer
   * and are completely different problems.
   */
  it('carries the typed checkout reason so the causes stay distinguishable', () => {
    for (const reason of ['not-configured', 'placeholder-catalog', 'lines-unavailable'] as const) {
      track({ name: 'checkout_failed', reason, itemCount: 1 }, 'granted')
    }
    expect(sent.map((e) => (e as { reason: string }).reason)).toEqual([
      'not-configured',
      'placeholder-catalog',
      'lines-unavailable',
    ])
  })
})
