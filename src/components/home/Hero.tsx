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
      {/* Hero photo — right half of the split at >=901px, a full-width band
          beneath the copy below that. */}
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
        <div
          className="hj-hero-scrim"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            // Sized to the actual content column (720px + its clamp() padding)
            // plus a fixed 180px fade strip — NOT inset:0 across the full section.
            // The strip's offset is a calc() length, not a percentage stop, so the
            // solid zone always reaches the text column's real right edge at any
            // viewport width. Within that fixed strip, an eased 5-stop falloff
            // (quadratic-ish: 100/56/25/6/0% alpha) blends into the photo instead
            // of a flat linear ramp — a linear cut over a photo this detailed reads
            // as an abrupt seam; easing it out gives a soft, photographic vignette
            // instead. Still far narrower than the ~400px haze an earlier version
            // of this gradient stretched across.
            // Published as a custom property, not just baked into the gradient,
            // so e2e/hero-legibility.spec.ts can derive where the opaque zone
            // actually ends instead of hardcoding a number that would silently
            // go stale the next time this gradient is retuned.
            ['--hj-hero-fade' as string]: '180px',
            width: 'calc(720px + clamp(20px, 4vw, 64px) + var(--hj-hero-fade))',
            maxWidth: '100%',
            background:
              'linear-gradient(90deg, var(--bg) 0, var(--bg) calc(100% - 180px), rgba(247,245,241,0.56) calc(100% - 135px), rgba(247,245,241,0.25) calc(100% - 90px), rgba(247,245,241,0.06) calc(100% - 45px), rgba(247,245,241,0) 100%)',
          }}
        />
      </div>

      {/* Left-aligned content */}
      <div
        ref={contentRef}
        className="hj-hero-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '0 clamp(20px, 4vw, 64px)',
          maxWidth: '720px',
          zIndex: 1,
          position: 'relative',
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
      </div>

      {/* Scroll indicator — left-aligned to the content column's own padding
          (not centered on the viewport) so it always sits over the solid
          backdrop; centering on the full viewport put it over the photo,
          barely legible, on any viewport wider than the content column. */}
      <div
        className="hj-hero-scroll"
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '32px',
          left: 'clamp(20px, 4vw, 64px)',
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

      {/* ── Below 900px: stack instead of splitting ──────────────────────────
          The split above works because the copy column ends well left of where
          the scrim stops being opaque. That stops being true as the viewport
          narrows: the scrim is `maxWidth: 100%`, but its fade is measured from
          its own right edge, so once the viewport is under ~866px the opaque
          zone slides left underneath the text. At 390px it ended at 210px on a
          390px screen, leaving the body copy and the ghost CTA lying on bare
          photograph.

          Narrowing the copy column instead would leave ~200px for a
          `--text-hero` headline, so the layout changes rather than compresses:
          copy on void-white, photograph as a full-width band beneath it.
          Legibility becomes structural — there is no text over image to protect
          — instead of a gradient that has to be re-tuned per breakpoint.

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

          .hj-hero-content {
            order: 1;
            max-width: 100% !important;
            /* Clears the 64px fixed header, which no longer overlaps a
               full-bleed image but does overlap the copy. */
            padding-top: 104px !important;
            padding-bottom: 56px !important;
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

          /* Nothing overlaps the photograph now, so there is nothing to scrim. */
          .hj-hero-scrim {
            display: none !important;
          }

          /* Positioned for the split layout; the scroll cue lands on the
             photograph once the section stacks. */
          .hj-hero-scroll {
            display: none !important;
          }
        }
      `}</style>
    </section>
  )
}

export default Hero
