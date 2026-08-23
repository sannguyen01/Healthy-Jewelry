'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export function Hero() {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const children = Array.from(el.children) as HTMLElement[]
    children.forEach((child, i) => {
      child.style.opacity = '0'
      child.style.transform = 'translateY(32px)'
      child.style.transition = `opacity 0.7s var(--ease), transform 0.7s var(--ease)`
      setTimeout(
        () => {
          child.style.opacity = '1'
          child.style.transform = 'translateY(0)'
        },
        i * 120 + 80
      )
    })
  }, [])

  return (
    <section
      className="hj-hero"
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Hero photo — full-bleed at every width, >=901px included. Nothing
          dims it section-wide any more; the only thing sitting on top of it
          is the copy's own card (hj-hero-scrim below), sized to the words it
          protects rather than to a fraction of the viewport. */}
      <div
        className="hj-hero-media"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
        }}
      >
        <Image
          src="/images/lifestyle/hero-banner.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'right center' }}
        />
      </div>

      {/* Copy card — opaque `--bg`, sized to its own content plus padding,
          not a section-spanning rectangle. Solid rather than translucent on
          purpose: every text/backdrop pairing in this file has only ever been
          proven against a flat `--bg`, and e2e/hero-legibility.spec.ts checks
          the worst pixel behind each word — a blurred, semi-transparent card
          would reopen exactly the "pale text over a pale patch of photo"
          failure mode that file exists to catch. Because the card wraps its
          own content instead of being measured/positioned independently,
          there is no width to keep in sync by hand — the class of bug behind
          commits a4cfb9c/b1e5178/c55962a (scrim geometry drifting from the
          text column) cannot recur here. */}
      <div
        className="hj-hero-scrim"
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '0 clamp(20px, 4vw, 64px)',
          maxWidth: 'calc(720px + clamp(20px, 4vw, 64px) * 2)',
          padding: 'clamp(28px, 3.5vw, 48px)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <div
          ref={contentRef}
          className="hj-hero-content"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <span className="label-eyebrow" style={{ marginBottom: '24px' }}>
            Implant-Grade Titanium · Niobium · 316L Steel
          </span>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-hero)',
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 0.9,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              margin: '0 0 28px',
            }}
          >
            Metal that
            <br />
            works with
            <br />
            your body.
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              margin: '0 0 44px',
              lineHeight: 1.6,
              maxWidth: '400px',
            }}
          >
            No stones. No fillers. Pure material integrity.
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <Link
              href="/shop"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 32px',
                backgroundColor: 'var(--ink)',
                color: 'var(--bg)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                transition: 'background-color 0.25s var(--ease)',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--mid)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--ink)'
              }}
            >
              Shop Collection
            </Link>
            <Link href="/about" className="btn-ghost">
              Our Story
            </Link>
          </div>

          {/* Scroll indicator — now a normal child of the card instead of an
            independently absolutely-positioned corner element. It used to be
            pinned to the viewport's bottom-left assuming the old full-height
            scrim always covered that corner; once the scrim shrank to wrap
            just the text, that assumption stopped holding and the cue would
            have landed on bare photograph. Living inside the card removes the
            gap between "where the backdrop is" and "where this sits" instead
            of re-deriving a second protected zone. */}
          <div
            className="hj-hero-scroll"
            aria-hidden="true"
            style={{
              marginTop: '40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.58rem',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
              }}
            >
              Scroll
            </span>
            <div style={{ width: '1px', height: '32px', backgroundColor: 'var(--ash)' }} />
          </div>
        </div>
      </div>

      {/* ── Below 900px: stack instead of splitting ──────────────────────────
          The split above only works with room either side of the copy for the
          photo to show through; that room disappears as the viewport narrows,
          and object-position: right center starts cropping the subject out
          entirely — at 390px only 25% of the frame survived, none of it the
          subject. Below 900px the layout changes instead of compressing: copy
          on void-white, photograph as a full-width band beneath it (still the
          near-complete frame — 16/9 vs. the source's 1.79 trims ~0.8%).
          Legibility becomes structural — there is no text over image to
          protect — instead of a card that has to be repositioned per
          breakpoint.

          900px is the existing breakpoint from globals.css (.hj-coll-tile,
          .hj-mat-grid), and it clears the ~866px failure point with margin.
          Enforced by e2e/hero-legibility.spec.ts across six widths. */}
      {/* `!important` throughout, matching MaterialsSection and the
          .hj-coll-tile rules in globals.css: this component styles itself with
          inline `style` props, and an inline declaration outranks any
          stylesheet rule that is not marked important. Without it these rules
          parse fine and do nothing. */}
      <style>{`
        @media (max-width: 900px) {
          .hj-hero {
            flex-direction: column !important;
            align-items: stretch !important;
            /* A stacked hero already fills most of a phone screen; forcing
               100dvh only adds dead space under the photo. */
            min-height: auto !important;
          }

          .hj-hero-scrim {
            order: 1;
            margin: 0 !important;
            max-width: 100% !important;
            /* Clears the 64px fixed header, which no longer overlaps a
               full-bleed image but does overlap the copy. */
            padding: 104px clamp(20px, 4vw, 64px) 56px !important;
            /* Nothing overlaps the photograph down here — it is a band in
               normal flow below the copy, not a backdrop behind it — so the
               card has nothing left to protect against and disappears. */
            background-color: transparent !important;
          }

          .hj-hero-media {
            order: 2;
            position: relative !important;
            inset: auto !important;
            width: 100% !important;
            /* The source is 1376x768 (1.79). 16/9 is 1.778, so ~0.8% is
               trimmed — effectively the whole frame. Deliberately not
               1376/768: pinning today's file dimensions would start silently
               cropping the day the photograph is replaced. */
            aspect-ratio: 16 / 9 !important;
          }

          .hj-hero-media img {
            /* 'right center' keeps the subject clear of the copy column in the
               split layout. In a wide, short band it crops to bare background
               rock — at 390px only 25% of the frame survived, none of it the
               subject. */
            object-position: center !important;
          }
        }
      `}</style>
    </section>
  )
}

export default Hero
