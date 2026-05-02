'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
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
      child.style.transition = `opacity 0.7s var(--ease, cubic-bezier(0.00,0.00,0.30,1.00)), transform 0.7s var(--ease, cubic-bezier(0.00,0.00,0.30,1.00))`
      child.style.animationDelay = `${i * 0.12}s`
      const delay = i * 120
      setTimeout(() => {
        child.style.opacity = '1'
        child.style.transform = 'translateY(0)'
      }, delay + 80)
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
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Background ring SVG — decorative, top-right */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-60px',
          right: '-60px',
          width: '420px',
          height: '420px',
          opacity: 0.1,
          pointerEvents: 'none',
        }}
      >
        <JewelrySVG type="ring-arc" className="w-full h-full" />
      </div>

      {/* Center content */}
      <div
        ref={contentRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 clamp(20px, 4vw, 64px)',
          maxWidth: '760px',
          gap: '0',
          zIndex: 1,
        }}
      >
        {/* Eyebrow */}
        <span
          className="label-eyebrow"
          style={{ marginBottom: '28px' }}
        >
          Implant-Grade Titanium · Niobium · 316L Steel
        </span>

        {/* Headline */}
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--text-hero, clamp(3.2rem, 8vw, 6.5rem))',
            color: 'var(--ink)',
            lineHeight: 0.95,
            letterSpacing: '-0.01em',
            margin: '0 0 28px',
            whiteSpace: 'pre-line',
          }}
        >
          {`Metal that works\nwith your body.`}
        </h1>

        {/* Subline */}
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'var(--text-lg, 1.15rem)',
            color: 'var(--graphite)',
            margin: '0 0 44px',
            lineHeight: 1.6,
          }}
        >
          No stones. No fillers. Pure material integrity.
        </p>

        {/* CTA buttons */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Link
            href="/shop"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 32px',
              backgroundColor: 'var(--ink)',
              color: 'var(--bg)',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              transition: 'background-color 0.25s var(--ease, cubic-bezier(0.00,0.00,0.30,1.00))',
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
          <Link
            href="/about"
            className="btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 32px',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
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
        <div
          style={{
            width: '1px',
            height: '32px',
            backgroundColor: 'var(--ash)',
          }}
        />
      </div>
    </section>
  )
}

export default Hero
