'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CONSENT_OPEN_EVENT,
  CONSENT_ROOM_PROPERTY,
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

  const showing = consent !== null && (shouldAskForConsent(consent) || reopened)

  // While the notice is up, tell the page how much of the screen it takes (ADR 054). It is anchored to the
  // bottom, and the hero's copy sits in the lower part of its first screen, so the hero rides above it by this
  // much (`--hj-consent-h`) and the document's `scroll-padding-bottom` keeps a focused control clear of it
  // (WCAG 2.4.11). The room is the notice's own height plus the gap beneath it (its `bottom`), rounded up, so the
  // room is never under-reserved. Taken back the moment the notice goes.
  //
  // Before this runs the page has already reserved an estimate when nobody had answered
  // (`CONSENT_PREPAINT_SCRIPT`, so the hero does not move when the notice arrives), and this replaces it with the
  // real figure. Once the stored answer has been read and nobody is being asked, any estimate is given back.
  useEffect(() => {
    const root = document.documentElement
    const el = dialog.current
    if (!showing || !el) {
      if (consent !== null) root.style.removeProperty(CONSENT_ROOM_PROPERTY)
      return
    }
    let published = -1
    const publish = () => {
      // Height and gap, not a position: `offsetHeight` and the computed `bottom` are layout facts, so neither moves
      // while the notice's entrance `translateY` plays (reading the painted top published a room 23px short, and the
      // hero's action sat 21px under the notice at 375×667), and neither depends on how far the page has scrolled or on
      // what an engine says `offsetTop` of a fixed box is relative to (the CSSOM names the initial containing block, and
      // only Chromium's answer has been checked). A `bottom` that does not resolve to a length counts as no gap.
      const gap = Number.parseFloat(window.getComputedStyle(el).bottom)
      const room = Math.max(0, Math.ceil(el.offsetHeight + (Number.isFinite(gap) ? gap : 0)))
      // An unchanged figure is not written: the property is inherited by the whole document, so a write restyles it,
      // and the observer's first callback and a phone's toolbar resizing both arrive with the number already right.
      if (room === published) return
      published = room
      root.style.setProperty(CONSENT_ROOM_PROPERTY, `${room}px`)
    }
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
      root.style.removeProperty(CONSENT_ROOM_PROPERTY)
    }
  }, [showing, consent])

  if (consent === null || !showing) return null

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
          contrast, because the pixels behind the primary action were the banner's
          own `--bg`. A consent notice covering the two primary calls to action on
          the landing page is a conversion bug caused by a compliance control, and
          it is the failure `analytics.spec.ts` now guards across four widths.
          Guarding one control and not the others is how a class of bug survives
          being fixed.

          Right-hand side because the hero's copy sits at the start edge of the
          photograph (ADR 054): overlapping part of a photograph is a cost worth
          paying; overlapping the buttons is not. And the hero rides above the
          notice by the room it publishes (`--hj-consent-h`), so on a phone, where
          the notice is nearly full width, the copy still clears it.
        */
        position: 'fixed',
        right: 'var(--space-gutter)',
        bottom: 'var(--hj-consent-bottom)',
        zIndex: 'var(--z-consent)',
        width: 'min(380px, calc(100vw - 2 * var(--space-gutter, 24px)))',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--ash)',
        padding: 'var(--hj-consent-pad)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 'var(--hj-consent-gap)',
        boxShadow: 'var(--shadow-float)',
        animation: 'hjSlideUp var(--duration-base) var(--ease) both',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-text)',
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
            fontSize: 'var(--text-xs)',
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
