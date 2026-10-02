'use client'

import { openConsentPreferences } from '@/lib/analytics/consent'

/**
 * Reopens the consent prompt, so a visitor can withdraw (or give) consent as easily as they
 * answered it the first time.
 *
 * Rendered in the Footer — every page — and inline on `/privacy`. It is a button, not a link:
 * it changes nothing about where the visitor is, it opens the same `ConsentBanner` that asked,
 * showing the current answer (see `CONSENT_OPEN_EVENT` in `src/lib/analytics/consent.ts`).
 *
 * Unstyled beyond what it inherits, on purpose: it sits inside a Footer column of links and
 * inside a sentence on `/privacy`, and each context supplies its own look through `style`.
 */
export function MeasurementPreferences({ style }: { style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => openConsentPreferences()}
      data-testid="measurement-preferences"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
        ...style,
      }}
    >
      Measurement preferences
    </button>
  )
}

export default MeasurementPreferences
