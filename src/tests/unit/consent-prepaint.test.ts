import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_PREPAINT_SCRIPT,
  CONSENT_ROOM_PROPERTY,
  CONSENT_STORAGE_KEY,
  readConsent,
  shouldAskForConsent,
} from '@/lib/analytics/consent'

/**
 * The page reserves the consent notice's room before its first paint (ADR 054).
 *
 * Whether anyone is asked is read from `localStorage`, so the server cannot know, and a hero that reserved the room only
 * once the notice had measured itself moved its copy by the notice's whole height a few hundred milliseconds after the
 * page first appeared: 0.39 of layout shift at 320x568 on a first visit, none for a returning visitor. A script in the
 * body, ahead of the hero, reads the same key and reserves an estimate when nobody has answered; the notice then
 * replaces the estimate with its real height. A script is one more place that decides "is this visitor asked?", so the
 * decision is held equal to the function the notice itself uses, over every stored value and a storage that throws.
 */

const ROOT = resolve(__dirname, '../../..')
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')
const root = () => document.documentElement
const reserved = () => root().style.getPropertyValue(CONSENT_ROOM_PROPERTY)

function run(script: string): void {
  // A fresh function scope, as the browser gives an inline script: it sees `window` and `document` and nothing of ours.
  new Function(script)()
}

describe('the pre-paint reservation', () => {
  beforeEach(() => {
    localStorage.clear()
    root().style.removeProperty(CONSENT_ROOM_PROPERTY)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.pushState({}, '', '/')
    localStorage.clear()
    root().style.removeProperty(CONSENT_ROOM_PROPERTY)
  })

  it('is a script and names the property the notice publishes', () => {
    expect(typeof CONSENT_PREPAINT_SCRIPT).toBe('string')
    expect(CONSENT_ROOM_PROPERTY).toBe('--hj-consent-h')
    expect(CONSENT_PREPAINT_SCRIPT).toContain(CONSENT_ROOM_PROPERTY)
    expect(CONSENT_PREPAINT_SCRIPT).toContain(CONSENT_STORAGE_KEY)
  })

  it('reserves the estimate for a visitor who has not answered, as a reference to the token and not a number', () => {
    run(CONSENT_PREPAINT_SCRIPT)
    expect(reserved()).toBe('var(--hj-consent-reserve)')
  })

  it('reserves nothing for a visitor who has answered, either way', () => {
    for (const answer of ['granted', 'denied']) {
      localStorage.setItem(CONSENT_STORAGE_KEY, answer)
      root().style.removeProperty(CONSENT_ROOM_PROPERTY)
      run(CONSENT_PREPAINT_SCRIPT)
      expect(reserved(), `an answer of ${answer}`).toBe('')
    }
  })

  it('agrees with the notice about whether anyone is asked, for every value a store can hold', () => {
    // Anything that is not exactly an answer is no answer (readConsent: "we could not tell" means ask).
    const stored: Array<string | null> = [null, 'granted', 'denied', 'GRANTED', 'true', '', ' denied', 'undefined', '{"v":"granted"}']
    for (const value of stored) {
      localStorage.clear()
      root().style.removeProperty(CONSENT_ROOM_PROPERTY)
      if (value !== null) localStorage.setItem(CONSENT_STORAGE_KEY, value)
      run(CONSENT_PREPAINT_SCRIPT)
      const noticeAsks = shouldAskForConsent(readConsent(window.localStorage))
      expect(reserved() !== '', `stored ${JSON.stringify(value)}: the script reserves ${reserved() !== ''}, the notice asks ${noticeAsks}`).toBe(noticeAsks)
    }
  })

  it('agrees with the notice where storage throws, which is a visitor who will be asked again', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is not available')
    })
    expect(() => run(CONSENT_PREPAINT_SCRIPT)).not.toThrow()
    expect(shouldAskForConsent(readConsent(window.localStorage))).toBe(true)
    expect(reserved()).toBe('var(--hj-consent-reserve)')
  })

  it('does nothing off the home page, where no hero rides above the notice and the read would only delay the first paint', () => {
    // `/` is the one page whose first screen is laid out above the notice; every other route gets the real figure from the
    // notice after hydration, exactly as before the reservation existed. The read is not made at all, not made and ignored.
    const read = vi.spyOn(Storage.prototype, 'getItem')
    for (const path of ['/shop', '/shop/rings', '/products/arc-hoops-titanium', '/about', '/this-page-does-not-exist']) {
      window.history.pushState({}, '', path)
      root().style.removeProperty(CONSENT_ROOM_PROPERTY)
      run(CONSENT_PREPAINT_SCRIPT)
      expect(reserved(), `on ${path}`).toBe('')
    }
    expect(read, 'no storage read off the home page').not.toHaveBeenCalled()
    window.history.pushState({}, '', '/?utm_source=mail')
    run(CONSENT_PREPAINT_SCRIPT)
    expect(reserved(), 'the home page with a query string is still the home page').toBe('var(--hj-consent-reserve)')
    window.history.pushState({}, '', '/')
  })

  it('does not throw where there is no storage object at all', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => run(CONSENT_PREPAINT_SCRIPT)).not.toThrow()
  })
})

describe('where it is wired', () => {
  const layout = read('src/app/layout.tsx')
  const css = read('src/app/globals.css')

  it('runs in the body ahead of everything the hero is part of, so it has run before the first paint of it', () => {
    const at = layout.indexOf('__html: CONSENT_PREPAINT_SCRIPT')
    expect(at, 'layout.tsx renders the script').toBeGreaterThan(-1)
    expect(layout.indexOf('{children}'), 'the page content comes after it').toBeGreaterThan(at)
    expect(layout.indexOf('<body>'), 'it is inside the body').toBeLessThan(at)
  })

  it('tells React the root element is touched by a script, so hydration does not warn about its style', () => {
    expect(layout).toMatch(/<html[\s\S]*?suppressHydrationWarning/)
    expect(layout.indexOf('suppressHydrationWarning'), 'on the <html> element, before <head>').toBeLessThan(layout.indexOf('<head>'))
  })

  describe('the estimate', () => {
    // The estimate is the notice's own arithmetic, not a table of measured heights. It used to be nine pixel values, one per
    // band and again for the compact notice, each fitted by hand; the compact ones went stale the moment the compact notice
    // changed its padding (a 37px shift on a first visit at 375x667) because nothing tied them to it. Written as a formula
    // over the notice's tokens it follows them, and only the number of lines its sentence wraps to is chosen per band.
    const reserve = /--hj-consent-reserve:\s*calc\(([^;]*)\);/.exec(css)?.[1] ?? ''
    const lines = [...css.matchAll(/--hj-consent-lines:\s*(\d+(?:\.\d+)?);/g)].map((m) => Number(m[1]))

    it('is a formula over the notice\'s own padding, gap, distance from the bottom and text, not a pixel value', () => {
      expect(reserve, '--hj-consent-reserve is a calc()').not.toBe('')
      for (const token of ['--hj-consent-pad', '--hj-consent-gap', '--hj-consent-bottom', '--hj-consent-lines', '--text-sm', '--leading-text']) {
        expect(reserve, `the estimate reads ${token}`).toContain(`var(${token})`)
      }
      expect(css, 'no band keeps a fitted pixel value').not.toMatch(/--hj-consent-reserve:\s*\d+px;/)
    })

    it('chooses how many lines the sentence wraps to per band: more on a narrower screen, within what the notice can wrap to', () => {
      // The base value and one per band the sentence wraps differently in (the registered 600 and 359 breakpoints).
      expect(lines.length).toBeGreaterThanOrEqual(3)
      expect(lines, 'a narrower band never has fewer lines').toEqual([...lines].sort((a, b) => a - b))
      for (const n of lines) {
        expect(n).toBeGreaterThanOrEqual(4)
        expect(n).toBeLessThanOrEqual(8)
      }
    })

    it('does not restate the compact notice: the compact tokens change and the formula follows them', () => {
      const compact = /@media \(max-width: 900px\) and \(max-height: 700px\) \{([\s\S]*?)\n  \}/.exec(css)?.[1] ?? ''
      expect(compact, 'the compact block exists').toContain('--hj-consent-pad')
      expect(compact, 'and carries no estimate of its own').not.toContain('--hj-consent-reserve')
    })
  })
})
