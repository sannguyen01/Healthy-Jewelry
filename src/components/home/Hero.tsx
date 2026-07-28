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
            inset: 0,
            // Pixel-based stops (not %) so the fully-opaque zone always covers the
            // 720px content column + padding regardless of viewport width — a
            // percentage-based gradient shrinks its opaque zone on wider screens
            // and can leave the tail of the copy sitting over the raw photo.
            background:
              'linear-gradient(90deg, var(--bg) 0px, var(--bg) 820px, rgba(247,245,241,0.55) 1040px, rgba(247,245,241,0) 1320px)',
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

      {/* Scroll indicator */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
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
