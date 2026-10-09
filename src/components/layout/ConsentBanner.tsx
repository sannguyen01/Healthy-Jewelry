'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CONSENT_OPEN_EVENT,
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
  // How many times "Measurement preferences" has asked for the prompt since it last closed:
  // 0 = not reopened. A counter rather than a flag so a second request while the prompt is
  // already open still moves focus to it. Withdrawal has to be as easy as consent was, so the
  // prompt that asked is the prompt that changes it.
  const [openRequests, setOpenRequests] = useState(0)
  const reopened = openRequests > 0
  const dialog = useRef<HTMLDivElement>(null)
  // Where focus was when the prompt was asked for, so a keyboard user is returned there after
  // choosing instead of being dropped at the top of the document.
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setConsent(readConsent(window.localStorage))
    const reopen = () => {
      if (document.activeElement instanceof HTMLElement && !dialog.current?.contains(document.activeElement)) {
        returnFocus.current = document.activeElement
      }
      setConsent(readConsent(window.localStorage))
      setOpenRequests((n) => n + 1)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  // Focus follows the visitor's request: the button they pressed is in the footer, and the
  // dialog it opened is pinned to the viewport corner — a keyboard user must not have to hunt.
  useEffect(() => {
    if (openRequests > 0) dialog.current?.querySelector('button')?.focus()
  }, [openRequests])

  if (consent === null || (!shouldAskForConsent(consent) && !reopened)) return null

  const choose = (next: 'granted' | 'denied') => {
    writeConsent(window.localStorage, next)
    setConsent(next)
    setOpenRequests(0)
    if (reopened) {
      returnFocus.current?.focus()
      returnFocus.current = null
    }
  }

  return (
    <div
      ref={dialog}
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
          it is the failure `analytics.spec.ts` now guards across four widths.
          Guarding one control and not the others is how a class of bug survives
          being fixed.

          Right-hand side because the hero is a split at ≥901px: copy and CTAs
          left, photograph right. Overlapping part of a photograph is a cost worth
          paying; overlapping the buttons is not.
        */
        position: 'fixed',
        right: 'var(--space-gutter)',
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
        {/*
          Says what is counted, because it is three specific things: which piece
          page opens, which collection, and what is typed into search (shortened).
          It said "page views and add-to-bag events" until 2026-09-25 — the second
          no longer exists, and the first was never true: other pages send nothing.
          It said "what is searched for here" until 2026-09-27; a search now reports
          only how many results it found and which collections or metals it named
          (`searchFacets`), never the words. The list is `ANALYTICS_EVENT_NAMES` in
          `src/lib/analytics/events.ts`; a new event is a change to this sentence in
          the same commit.
        */}
        If you allow it, we count which pieces and collections are viewed and how many
        results a search finds — never what you type, and never you. No cookies, no
        identifiers, no tracking across sites; your answer is kept in this browser.{' '}
        <Link
          href="/privacy"
          style={{ color: 'var(--titanium-text)', textDecoration: 'underline' }}
        >
          Privacy
        </Link>
      </p>

      {reopened && consent !== 'unset' && (
        <p
          data-testid="consent-current"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'var(--text-xs, 0.75rem)',
            color: 'var(--graphite)',
            margin: 0,
          }}
        >
          {consent === 'granted'
            ? 'Currently allowed. Decline stops measurement from the next page you open.'
            : 'Currently declined. Nothing is measured unless you choose Allow.'}
        </p>
      )}

      {/* Equal weight. A reject hidden behind a link is a dark pattern. */}
      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => choose('denied')}
          className="btn-ghost"
          aria-pressed={consent === 'denied'}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose('granted')}
          className="btn-ghost"
          aria-pressed={consent === 'granted'}
        >
          Allow
        </button>
      </div>
    </div>
  )
}

export default ConsentBanner
