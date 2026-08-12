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
        /*
          Anchored bottom-**right**, and narrow.

          It was a centred 620px bar, and `hero-legibility.spec.ts` caught it
          sitting directly on top of both hero CTAs at 1024px — reporting 1.00:1
          contrast, because the pixels behind "Shop Collection" were the banner's
          own `--bg`. A consent notice covering the two primary calls to action on
          the landing page is a conversion bug caused by a compliance control, and
          it is the exact failure `analytics.spec.ts` already guards for the
          Checkout button. Guarding one and not the other is how a class of bug
          survives being fixed.

          Right-hand side because the hero is a split at ≥901px: copy and CTAs
          left, photograph right. Overlapping part of a photograph is a cost worth
          paying; overlapping the buttons is not.
        */
        position: 'fixed',
        right: 'var(--space-gutter, clamp(20px,4vw,64px))',
        // `left` only below the split, where the hero stacks and full width reads
        // better than a floating card.
        left: 'auto',
        bottom: 'clamp(16px, 3vw, 32px)',
        zIndex: 94,
        width: 'min(380px, calc(100vw - 2 * var(--space-gutter, 24px)))',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--ash)',
        padding: 'clamp(18px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '14px',
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
