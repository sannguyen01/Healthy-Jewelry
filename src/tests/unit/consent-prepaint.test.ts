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

  it('has an estimate for every width the notice changes size at, and none below an even pixel', () => {
    expect(css).toMatch(/--hj-consent-reserve:\s*\d+px;/)
    const declarations = [...css.matchAll(/--hj-consent-reserve:\s*(\d+)px;/g)].map((m) => Number(m[1]))
    // The base value and one per band, so the estimate follows the notice's own wrapping and padding.
    expect(declarations.length).toBeGreaterThanOrEqual(5)
    for (const px of declarations) {
      expect(px % 2, `${px}px`).toBe(0)
      expect(px).toBeGreaterThan(180)
      expect(px).toBeLessThan(320)
    }
  })
})
