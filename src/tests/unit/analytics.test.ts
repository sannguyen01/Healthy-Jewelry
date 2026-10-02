import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'
import { ConsentBanner } from '@/components/layout/ConsentBanner'
import {
  track,
  setAnalyticsSink,
  ANALYTICS_EVENT_NAMES,
  isAnalyticsEventName,
  readConsent,
  writeConsent,
  analyticsAllowed,
  shouldAskForConsent,
  CONSENT_STORAGE_KEY,
  CONSENT_OPEN_EVENT,
  openConsentPreferences,
  type AnalyticsEvent,
} from '@/lib/analytics'
import { COLLECTION_HANDLES, MATERIAL_HANDLES } from '@/lib/catalog/schema'
import { searchFacets } from '@/lib/catalog'

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

/**
 * `value` and `currency` are gone from this event, and their absence is the point.
 *
 * `product_viewed` used to carry the product's price so an analytics backend could
 * attribute revenue to a view. There is no price to attribute and no transaction to
 * attribute it to, so the fields were removed from `AnalyticsEvent` rather than sent as
 * `'0'` — a zero-value conversion event is a number a dashboard will happily average.
 */
const productEvent: AnalyticsEvent = {
  name: 'product_viewed',
  handle: 'arc-band-titanium',
  collection: 'rings',
  material: 'titanium',
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

  it('is exactly the three attention signals docs/analytics.md documents', () => {
    // Was "covers the whole funnel, so conversion is computable". There is no funnel: the
    // site sells nothing, and COMMERCE-ELIMINATION-CONTRACT.md §2 forbids conversion
    // analytics. What is left is which pieces, collections and searches draw attention —
    // one row of the relationship-quality table in docs/analytics.md. Equality, so an
    // added event fails here until the document, the banner and the privacy page say so.
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual([
      'collection_viewed',
      'product_viewed',
      'search_performed',
    ])
  })

  it('carries no event a browse-only site cannot emit', () => {
    // The vocabulary used to include add_to_bag, remove_from_bag, checkout_started and
    // checkout_failed. All four went with the commerce UI. Asserted as an absence, not
    // just removed from the list above: a name nothing can send is a sink waiting for
    // traffic that will never arrive, and the next reader cannot tell "nobody bought
    // anything today" from "nothing can emit this any more".
    for (const gone of ['add_to_bag', 'remove_from_bag', 'checkout_started', 'checkout_failed']) {
      expect(ANALYTICS_EVENT_NAMES as readonly string[]).not.toContain(gone)
    }
  })
})

/**
 * **A search is reported by what it named, never by what was typed.**
 *
 * `search_performed` carried the query — lower-cased and cut to 64 characters — until
 * 2026-09-27, and these tests pinned the cutting. Truncation bounded how much of a pasted email
 * address or order number reached the log, not whether it did. The event now carries the
 * collections and materials the query named, as handles the catalogue already publishes, so
 * the property worth pinning is the output's range: whatever goes in, only handles come out.
 */
describe('a search is reported by what it named', () => {
  const HANDLES: readonly string[] = [...COLLECTION_HANDLES, ...MATERIAL_HANDLES]

  it('names the collections and metals a query mentions, singular or plural, sorted', () => {
    expect(searchFacets('Titanium Ring')).toEqual(['rings', 'titanium'])
    expect(searchFacets('316L earring')).toEqual(['earrings', 'surgical-steel'])
    expect(searchFacets('niobium   NECKLACES')).toEqual(['necklaces', 'niobium'])
    expect(searchFacets('grade 23')).toEqual(['titanium'])
  })

  it('reports nothing of a query that names nothing — an email address is not a facet', () => {
    expect(searchFacets('customer@example.com')).toEqual([])
    expect(searchFacets('+84 90 123 4567')).toEqual([])
    expect(searchFacets('order #1001')).toEqual([])
    expect(searchFacets('')).toEqual([])
  })

  it('keeps the shelf and drops the person when a query carries both', () => {
    expect(searchFacets('jane.doe@example.com ring order 10001')).toEqual(['rings'])
  })

  it('can only ever return catalogue handles, once each, whatever it is given', () => {
    // Generative: every pair of words from a mixed vocabulary of real terms and personal-data
    // shapes. The range of the function is the privacy boundary, so the range is what is asserted.
    const WORDS = ['ring', 'rings', 'steel', 'TITANIUM', 'me@x.io', '0901234567', '#99', 'charm', 'https://a.b', 'ço']
    for (const a of WORDS) {
      for (const b of WORDS) {
        const facets = searchFacets(`${a} ${b}`)
        expect(new Set(facets).size, `${a} ${b}`).toBe(facets.length)
        for (const f of facets) expect(HANDLES, `${a} ${b} → ${f}`).toContain(f)
      }
    }
  })

  it('hands a search event to the sink exactly as given — there is no text to clean any more', () => {
    const event: AnalyticsEvent = { name: 'search_performed', resultCount: 3, facets: ['rings'] }
    track(event, 'granted')
    expect(sent[0]).toEqual(event)
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
    // Was driven with `checkout_failed`, which no longer exists. `collection_viewed` is
    // the same shape of assertion — an event with fields that must survive the boundary
    // unmodified. (`search_performed` was the exception, sanitised here, until it stopped
    // carrying text on 2026-09-27; it now passes through untouched too.)
    const event: AnalyticsEvent = {
      name: 'collection_viewed',
      collection: 'rings',
      productCount: 4,
    }
    track(event, 'granted')
    expect(sent[0]).toEqual(event)
  })
})

/**
 * **What a visitor is told, held against what is measured.**
 *
 * The banner promised "anonymous page views and add-to-bag events" for a week after
 * add-to-bag was deleted — and page views were never counted at all. The privacy page
 * described a session cookie holding the consent answer; the answer is a localStorage entry
 * that outlives the session. Both were prose nothing compared against the code, which is
 * the gap ADR 036 names. These tests are the comparison.
 */
describe('the consent copy matches the measurement', () => {
  const ROOT = process.cwd()
  const PRIVACY = 'src/app/privacy/page.tsx'

  it('the banner names what is counted, and nothing that is not', () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
    render(createElement(ConsentBanner))
    const text = screen.getByRole('dialog', { name: /analytics consent/i }).textContent ?? ''
    cleanup()

    // One phrase per event in ANALYTICS_EVENT_NAMES.
    expect(text).toMatch(/pieces/i) // product_viewed
    expect(text).toMatch(/collections/i) // collection_viewed
    expect(text).toMatch(/search/i) // search_performed
    // …and says the words themselves are not kept, because they are not.
    expect(text).toMatch(/never what you type/i)
    // And none of the vocabulary of events or mechanisms that do not exist.
    for (const absent of [/bag/i, /cart/i, /checkout/i, /page views/i, /set(s)? (a )?cookie/i]) {
      expect(text, `the banner claims ${absent}`).not.toMatch(absent)
    }
  })

  it('the privacy page reads the storage key from the code that uses it, and offers the control', () => {
    // Imported, not typed: a renamed key changes the sentence with it. The query length it also
    // imported went with the query (2026-09-27); the withdrawal control arrived in its place.
    const sf = parseSource(PRIVACY, readFileSync(join(ROOT, PRIVACY), 'utf8'))
    expect(importsFrom(sf, '@/lib/analytics/consent').map((b) => b.imported)).toContain(
      'CONSENT_STORAGE_KEY'
    )
    expect(
      importsFrom(sf, '@/components/analytics/MeasurementPreferences').map((b) => b.imported)
    ).toContain('MeasurementPreferences')
  })

  it('the privacy page says search text is never recorded, and that withdrawal is not deletion', () => {
    const prose = readFileSync(join(ROOT, PRIVACY), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(prose).toMatch(/What you type into search is\s+never recorded/)
    expect(prose).not.toMatch(/what is typed into site search/i)
    // The honest limit of withdrawal: it stops future records; it does not reach back.
    expect(prose).toMatch(/does not delete records\s+already made/i)
    expect(prose).not.toMatch(/clear this site&apos;s data in your\s+browser settings, which is also how to change/i)
  })

  it('the privacy page does not describe cookies the site does not set', () => {
    // Comments are stripped first: the page records the wrong sentences it replaced, and
    // quoting a removed claim is the record of the fix, not the claim.
    const prose = readFileSync(join(ROOT, PRIVACY), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const claim of [/session cookies/i, /analytics cookies/i, /two types of cookies/i, /hashed and\s+short-lived/i]) {
      expect(prose, `the privacy page still says ${claim}`).not.toMatch(claim)
    }
    expect(prose).toMatch(/sets no cookies/i)
  })
})

/**
 * **Withdrawing consent is as easy as giving it.**
 *
 * Until 2026-09-27 the banner appeared once and the only way back was clearing this site's data
 * in the browser. "Measurement preferences" — in the footer of every page and on `/privacy` —
 * now reopens the same prompt, showing the current answer, and Decline stops the very next
 * event because `track()` reads the stored answer on every call.
 */
describe('consent can be withdrawn from the site', () => {
  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
    cleanup()
  })

  it('reopens the answered prompt on request, showing the current answer', () => {
    writeConsent(localStorage, 'granted')
    render(createElement(ConsentBanner))
    expect(screen.queryByRole('dialog', { name: /analytics consent/i })).toBeNull()

    act(() => openConsentPreferences())

    const dialog = screen.getByRole('dialog', { name: /analytics consent/i })
    expect(dialog.textContent).toMatch(/currently allowed/i)
    expect(screen.getByRole('button', { name: 'Allow' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Decline' }).getAttribute('aria-pressed')).toBe('false')
    // Focus goes to the dialog the visitor asked for, not left on a footer far away.
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('Decline after Allow stops the next event, and closes the prompt', () => {
    writeConsent(localStorage, 'granted')
    render(createElement(ConsentBanner))
    expect(track(productEvent)).toBe(true)

    act(() => openConsentPreferences())
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    expect(readConsent(localStorage)).toBe('denied')
    expect(screen.queryByRole('dialog', { name: /analytics consent/i })).toBeNull()
    const before = sent.length
    expect(track(productEvent)).toBe(false)
    expect(sent.length).toBe(before)
  })

  it('returns focus to the control that opened it, and refocuses on every request', () => {
    writeConsent(localStorage, 'granted')
    const trigger = document.createElement('button')
    trigger.textContent = 'Measurement preferences'
    document.body.appendChild(trigger)
    render(createElement(ConsentBanner))

    trigger.focus()
    act(() => openConsentPreferences())
    const dialog = screen.getByRole('dialog', { name: /analytics consent/i })
    expect(dialog.contains(document.activeElement)).toBe(true)

    // Tab away while it is open and ask again: focus must come back to the dialog.
    trigger.focus()
    act(() => openConsentPreferences())
    expect(dialog.contains(document.activeElement), 'a second request did not refocus').toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(document.activeElement, 'focus was dropped instead of returned').toBe(trigger)
    trigger.remove()
  })

  it('dispatches the one event the banner listens for, and never throws without a window', () => {
    const target = new EventTarget()
    let heard = 0
    target.addEventListener(CONSENT_OPEN_EVENT, () => (heard += 1))
    openConsentPreferences(target)
    expect(heard).toBe(1)
    expect(() => openConsentPreferences(undefined)).not.toThrow()
    expect(() =>
      openConsentPreferences({
        dispatchEvent: () => {
          throw new Error('refused')
        },
      })
    ).not.toThrow()
  })
})
