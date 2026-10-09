'use client'

import { Fragment, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MetalDot } from '@/components/ui/MetalDot'

interface HeroProps {
  /**
   * The headline, one entry per line, resolved by the server component that renders this.
   *
   * It is the positioning line — "Metal that works with your body" — and that line is a
   * biocompatibility claim, pending in the claims registry. Resolving it here would mean
   * importing the registry into a client component and shipping Zod with it, so the page
   * resolves it and passes the result down. The lines come from the registry's own
   * line-break hints, which keeps the three-line setting the card's width was designed
   * around (ADR 013) without this component knowing which wording it received.
   */
  headlineLines: readonly string[]
}

export function Hero({ headlineLines }: HeroProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const children = Array.from(el.children) as HTMLElement[]
    children.forEach((child, i) => {
      child.style.opacity = '0'
      child.style.transform = 'translateY(32px)'
      child.style.transition = `opacity var(--duration-slow) var(--ease), transform var(--duration-slow) var(--ease)`
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
          text column) cannot recur here.

          But wrapping its own content is also why it needs a ceiling. The card
          is a flex item sized by its widest child, so its width is a function
          of headline glyph advance: edit three words of the h1, raise
          --text-hero, or load a wider face, and the card grows with it. Every
          guardrail on this section asks "is the text protected?", and a bigger
          card is always a better answer to that — so nothing here pushes back.
          --hj-hero-card-max-ratio is that counter-pressure, and it is a
          fraction of the photograph rather than a pixel count because the same
          absolute number cannot mean the same thing at 901px and 2560px. See
          docs/adr/013-a-protection-that-can-only-grow.md. */}
      <div
        className="hj-hero-scrim"
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '0 var(--hj-hero-pad-x)',
          maxWidth: 'calc(var(--hj-hero-card-max-ratio) * 100%)',
          padding: 'clamp(28px, 3.5vw, 48px)',
          backgroundColor: 'var(--bg)',
          // A frame, like every card on the site (ADR 051): the hairline and the 6px radius. The
          // hairline is why the card reads as an object on the photograph and not as a hole in it.
          border: '1px solid var(--ash)',
          borderRadius: 'var(--radius-frame)',
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
          {/* "Implant-Grade Titanium" until 2026-09-26: a regulatory claim in the first words
              a visitor reads. The eyebrow now names the three metals by specification, behind the
              titanium dot the board puts at the head of the line. */}
          <span
            className="label-eyebrow"
            style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '28px' }}
          >
            <span style={{ paddingTop: '4px' }}>
              <MetalDot metal="titanium" />
            </span>
            {/* The words in an element of their own, so the box that is measured for legibility is the
                words' and not the dot's: a pixel of --titanium is not what the text sits on. */}
            <span>Grade 23 Titanium · Niobium · 316L Steel</span>
          </span>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              fontSize: 'var(--text-hero)',
              fontWeight: 500,
              color: 'var(--ink)',
              // 0.9 until the hero moved from 136px to 60px: a didone's ascenders and descenders
              // clear each other at 1.1, and at this size the leading is what the eye reads.
              lineHeight: 'var(--leading-display)',
              letterSpacing: 'var(--tracking-display)',
              margin: '0 0 24px',
            }}
          >
            {/* Fragments, not spans: the DOM is the one the legibility spec has always
                measured — text nodes separated by <br> — whichever wording arrives. */}
            {headlineLines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 'var(--text-base)',
              color: 'var(--graphite)',
              margin: '0 0 40px',
              lineHeight: 'var(--leading-text)',
              maxWidth: '400px',
            }}
          >
            No stones. No fillers. Pure material integrity.
          </p>

          <div className="hj-hero-actions">
            <Link href="/shop" className="btn-primary">
              Shop Collection
            </Link>
            <Link href="/about" className="btn-ghost">
              Our Story
            </Link>
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

          900px is the breakpoint the homepage's bands collapse at too (.hj-grid and
          .hj-coll-grid in globals.css), and it clears the ~866px failure point with margin.
          Enforced by e2e/hero-legibility.spec.ts across six widths. */}
      {/* `!important` on the rules that override an inline declaration: this component
          styles the card and the section with inline `style` props, and an inline
          declaration outranks any stylesheet rule that is not marked important. Without
          it those rules parse fine and do nothing. */}
      <style>{`
        /* The card sits at the foot of the photograph, as the board has it, with the page's own
           inset below it. Set here and not inline so the stacked layout can drop both. */
        .hj-hero {
          align-items: flex-end;
          padding-bottom: var(--hj-hero-pad-x);
        }

        @media (max-width: 900px) {
          .hj-hero {
            padding-bottom: 0 !important;
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
            /* Only the horizontal inset is shared with the split layout — it
               was the same clamp() written out twice. The verticals stay
               literals and stay separate on purpose: 104px is clearance for the
               64px fixed header and 56px is separation from the photo band
               below, neither of which is the desktop card's padding. Unifying
               three different quantities behind one token would be the drift
               this file already has scars from, pointing the other way. */
            padding: 104px var(--hj-hero-pad-x) 56px !important;
            /* Nothing overlaps the photograph down here — it is a band in
               normal flow below the copy, not a backdrop behind it — so the
               card has nothing left to protect against and disappears. */
            background-color: transparent !important;
            border-color: transparent !important;
            border-radius: 0 !important;
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
