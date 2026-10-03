// Healthy Jewelry — whether this visitor has agreed to be measured
//
// The store ships to 29 countries, and the list includes Germany, France, Ireland,
// Italy, Spain, the Netherlands, Poland, Portugal, Sweden, Denmark, Finland,
// Austria, Belgium and the Czech Republic. Analytics without a consent gate is not
// a preference question for a storefront serving those markets.
//
// So the default is **off**. Nothing is recorded until someone says yes, and the
// gate is a pure function over stored state so both answers are testable — the
// "granted" branch is the one that never runs in CI, and per ADR 002 that is the
// one most likely to be wrong.

export type ConsentState = 'granted' | 'denied' | 'unset'

/**
 * `localStorage`, not a cookie.
 *
 * A cookie would be sent on every request to every route, including the ones that
 * set `Cache-Control` — and a request that varies by cookie is a request Vercel's
 * edge cache treats differently. The choice is only ever read in the browser, so
 * it has no business travelling with requests.
 */
export const CONSENT_STORAGE_KEY = 'hj-analytics-consent'

/**
 * Read the stored choice.
 *
 * Returns `unset` for anything unrecognised rather than guessing. A corrupted or
 * hand-edited value must not resolve to `granted`: the failure direction matters,
 * and "we could not tell" has to mean "do not track".
 */
export function readConsent(storage: Pick<Storage, 'getItem'> | undefined): ConsentState {
  if (!storage) return 'unset'
  try {
    const value = storage.getItem(CONSENT_STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : 'unset'
  } catch {
    // Safari in private mode throws on storage access. An exception here must
    // never break a page render, and must never be read as consent.
    return 'unset'
  }
}

export function writeConsent(
  storage: Pick<Storage, 'setItem'> | undefined,
  state: Exclude<ConsentState, 'unset'>
): void {
  try {
    storage?.setItem(CONSENT_STORAGE_KEY, state)
  } catch {
    // Storage unavailable. The visitor's choice is respected for this page only,
    // and they will be asked again — which is the safe direction to fail.
  }
}

/**
 * The gate every `track()` call passes through.
 *
 * Only an explicit `granted` opens it. `unset` is not "not yet decided, so
 * probably fine" — it is a no.
 */
export function analyticsAllowed(state: ConsentState): boolean {
  return state === 'granted'
}

/** Whether to show the banner at all. Answering either way ends it. */
export function shouldAskForConsent(state: ConsentState): boolean {
  return state === 'unset'
}

/**
 * The window event that reopens the consent prompt.
 *
 * Until 2026-09-27 the only way to change an answer was to clear this site's data in the
 * browser — technically possible, and nothing like as easy as giving consent was, which is the
 * standard withdrawal has to meet. "Measurement preferences" (the Footer, and `/privacy`)
 * dispatches this and `ConsentBanner` listens for it, so the one prompt that asks is also the
 * one that changes the answer: one component, one storage write, one set of tests.
 *
 * A DOM event rather than shared state because the site holds no client state across
 * components on purpose (CLAUDE.md, "State: none"), and the two halves live in different
 * trees — the banner in the root layout, the buttons in a Server Component footer.
 */
export const CONSENT_OPEN_EVENT = 'hj:consent-open'

/** Ask the banner to reopen. A no-op outside a browser; never throws into a click handler. */
export function openConsentPreferences(target: Pick<EventTarget, 'dispatchEvent'> | undefined = globalThis.window): void {
  try {
    target?.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
  } catch {
    // An environment without Event, or a target that refuses it. The banner simply does not
    // open, which is the same as the button doing nothing — never a broken page.
  }
}
