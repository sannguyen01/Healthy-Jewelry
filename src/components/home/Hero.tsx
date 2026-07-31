'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { JewelrySVG } from '@/components/svg/JewelrySVG'

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
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Hero photo — right side, behind content on mobile via overlay gradient */}
      <div
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
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            // Sized to the actual content column (720px + its clamp() padding)
            // plus a fixed 48px fade strip — NOT inset:0 across the full section.
            // The gradient below is solid for this entire width minus that 48px
            // strip (a calc() offset, not a percentage stop), so the opaque zone
            // always reaches the text column's real right edge regardless of the
            // clamp()'d padding at a given viewport width — a percentage split
            // (e.g. 55%/100%) drifts with this div's own width and was cutting
            // the solid backing short of the text at 1280-1440px viewports while
            // also stretching the haze/fade zone across ~400px before the photo
            // ever became fully visible.
            width: 'calc(720px + clamp(20px, 4vw, 64px) + 48px)',
            maxWidth: '100%',
            background:
              'linear-gradient(90deg, var(--bg) 0, var(--bg) calc(100% - 48px), rgba(247,245,241,0) 100%)',
          }}
        />
      </div>

      {/* Background ring — large, right side, very faint */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '-120px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 'min(60vw, 640px)',
          height: 'min(60vw, 640px)',
          opacity: 0.06,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <JewelrySVG type="ring-arc" className="w-full h-full" />
      </div>

      {/* Left-aligned content */}
      <div
        ref={contentRef}
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
    </section>
  )
}

export default Hero
