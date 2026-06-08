'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { mainNav } from '@/config/navigation'

const EASE_SHARP = 'cubic-bezier(0.00, 0.00, 0.30, 1.00)'
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 56)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // When mobile overlay is open the header goes dark — text/logo must invert
  const onDark = menuOpen
  const textColor = onDark ? '#F0EDE8' : '#1A1714'
  const bg = menuOpen
    ? '#0A0A0A'
    : scrolled
      ? 'rgba(247,245,241,0.96)'
      : 'transparent'
  const blur = scrolled && !menuOpen ? 'blur(14px)' : 'none'
  const border =
    scrolled && !menuOpen
      ? '1px solid rgba(26,23,20,0.08)'
      : '1px solid transparent'

  return (
    <header
      role="banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 clamp(20px, 4vw, 64px)',
        background: bg,
        backdropFilter: blur,
        WebkitBackdropFilter: blur,
        borderBottom: border,
        transition: `background 480ms ${EASE_SHARP}, border-color 480ms ${EASE_SHARP}`,
      }}
    >
      {/* ── Logo + brand name ─────────────────────────────── */}
      <Link
        href="/"
        aria-label="Healthy Jewelry — home"
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
      >
        <Image
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={36}
          height={36}
          priority
          style={{
            objectFit: 'contain',
            filter: onDark ? 'invert(1) brightness(1.8)' : 'none',
            transition: `filter 400ms ${EASE_SHARP}`,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 'clamp(1rem, 1.4vw, 1.25rem)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: textColor,
            lineHeight: 1,
            transition: `color 400ms ${EASE_SHARP}`,
          }}
        >
          Healthy Jewelry
        </span>
      </Link>

      {/* ── Desktop nav — hj-desk-nav controls visibility ─── */}
      <nav
        aria-label="Primary navigation"
        className="hj-desk-nav"
        style={{ gap: 40, alignItems: 'center' }}
      >
        {mainNav.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.70rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 400,
              color: '#6B6762',
              transition: 'color 240ms',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* ── Actions ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {/* Search icon */}
        <button
          aria-label="Search"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: textColor,
            display: 'flex',
            padding: 4,
            transition: `color 400ms ${EASE_SHARP}`,
          }}
        >
          <svg
            width={17}
            height={17}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <circle cx={11} cy={11} r={7} />
            <line x1={17} y1={17} x2={22} y2={22} />
          </svg>
        </button>

        {/* Basket — desktop only */}
        <Link
          href="/cart"
          aria-label="View basket"
          className="hj-desk-nav"
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 400,
            color: textColor,
            border: `1px solid ${
              onDark ? 'rgba(240,237,232,0.28)' : 'rgba(26,23,20,0.20)'
            }`,
            padding: '6px 14px',
            alignItems: 'center',
            transition: `color 400ms ${EASE_SHARP}, border-color 400ms ${EASE_SHARP}`,
          }}
        >
          BASKET
        </Link>

        {/* Mobile menu toggle — hj-mob-menu shows only on ≤768px */}
        <button
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="hj-mob-menu"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.65rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 400,
            color: textColor,
            transition: `color 400ms ${EASE_SHARP}`,
          }}
        >
          {menuOpen ? 'CLOSE' : 'MENU'}
        </button>
      </div>

      {/* ── Mobile overlay — drops from under header ──────── */}
      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          style={{
            position: 'absolute',
            top: 64,
            left: 0,
            right: 0,
            background: '#0A0A0A',
            padding:
              'clamp(40px,6vh,64px) clamp(20px,4vw,64px) clamp(48px,6vh,72px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            animation: `hjFadeDown 320ms ${EASE} both`,
            zIndex: 89,
          }}
        >
          {mainNav.map(({ label, href }) => (
            <div
              key={href}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                padding: '12px 0',
              }}
            >
              <Link
                href={href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  fontSize: 'clamp(2.4rem, 7vw, 4.5rem)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#F0EDE8',
                }}
              >
                {label}
              </Link>
            </div>
          ))}
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.60rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#6B6762',
              marginTop: 32,
            }}
          >
            Titanium · Niobium · Surgical Steel
          </p>
        </div>
      )}
    </header>
  )
}

export default Header
