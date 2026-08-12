'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  readConsent,
  writeConsent,
  shouldAskForConsent,
  type ConsentState,
} from '@/lib/analytics/consent'

/**
 * Asks once whether this visitor is willing to be measured.
 *
 * The store ships to 29 countries, fourteen of them in the EU, so analytics
 * without a gate is not a preference question. Nothing is recorded until someone
 * chooses, and choosing either way ends the banner permanently.
 *
 * ## Deliberately not a "cookie banner"
 *
 * It sets no cookie, and says so. The site's only measurement is first-party and
 * anonymous — no identifiers, no session, no third-party script — so the honest
 * copy is short and specific rather than the usual wall of legalese with a
 * pre-ticked box. Both buttons are equally prominent, because a "reject" hidden
 * behind a link is a dark pattern whatever the copy says.
 *
 * ## Why it renders nothing on the server
 *
 * The answer lives in `localStorage`, which does not exist during SSR. Rendering
 * the banner and then hiding it would flash it at every returning visitor who
 * already answered — so it stays null until the stored choice has been read.
 */
export function ConsentBanner() {
  const [consent, setConsent] = useState<ConsentState | null>(null)

  useEffect(() => {
    setConsent(readConsent(window.localStorage))
  }, [])

  if (consent === null || !shouldAskForConsent(consent)) return null

  const choose = (next: 'granted' | 'denied') => {
    writeConsent(window.localStorage, next)
    setConsent(next)
  }

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      style={{
        position: 'fixed',
        left: 'var(--space-gutter, clamp(20px,4vw,64px))',
        right: 'var(--space-gutter, clamp(20px,4vw,64px))',
        bottom: 'clamp(16px, 3vw, 32px)',
        zIndex: 94,
        maxWidth: '620px',
        marginInline: 'auto',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--ash)',
        padding: 'clamp(18px, 3vw, 24px)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        animation: 'hjSlideUp 0.5s var(--ease) both',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-sm)',
          lineHeight: 1.65,
          color: 'var(--ink)',
          margin: 0,
          flex: '1 1 260px',
        }}
      >
        We count anonymous page views and add-to-bag events to understand what people
        look for. No cookies, no tracking across sites, nothing that identifies you.{' '}
        <Link
          href="/privacy"
          style={{ color: 'var(--titanium-text)', textDecoration: 'underline' }}
        >
          Privacy
        </Link>
      </p>

      {/* Equal weight. A reject hidden behind a link is a dark pattern. */}
      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
        <button type="button" onClick={() => choose('denied')} className="btn-ghost">
          Decline
        </button>
        <button type="button" onClick={() => choose('granted')} className="btn-ghost">
          Allow
        </button>
      </div>
    </div>
  )
}

export default ConsentBanner
