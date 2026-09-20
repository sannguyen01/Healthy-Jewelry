'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useScrolled } from '@/lib/hooks/useScrolled'
import { primaryNavLinks } from '@/config/navigation'

export function Nav() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolled(60)

  return (
    <>
      {/* ── Main nav bar ─────────────────────────────────────────────── */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '64px',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          padding: '0 clamp(20px,4vw,48px)',
          backgroundColor: scrolled ? 'rgba(247,245,241,0.94)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(26,23,20,0.08)' : 'none',
          transition:
            'background-color 0.4s cubic-bezier(0.00,0.00,0.30,1.00), border-color 0.4s cubic-bezier(0.00,0.00,0.30,1.00)',
        }}
      >
        {/* Logo + wordmark — left */}
        <Link
          href="/"
          aria-label="Healthy Jewelry — home"
          // `flex: 0 1 auto` + `minWidth: 0`, not `flexShrink: 0`. The header is a
          // fixed-height row that must fit a 320px phone, and something has to give
          // when it cannot. This makes the brand the thing that gives: the wordmark
          // ellipsises, which costs a few letters, rather than the controls being
          // pushed past the viewport edge, which costs the visitor the only route to
          // navigation they have. See docs/adr/016.
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 auto', minWidth: 0 }}
        >
          <Image
            src="/logo.png"
            alt="Healthy Jewelry"
            width={120}
            height={32}
            style={{ objectFit: 'contain', height: '28px', width: 'auto' }}
            priority
          />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'clamp(1rem, 1.4vw, 1.25rem)',
              letterSpacing: '0.10em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: menuOpen ? 'var(--on-dark)' : 'var(--ink)',
              transition: 'color 400ms cubic-bezier(0.00, 0.00, 0.30, 1.00)',
            }}
          >
            HEALTHY JEWELLERY
          </span>
        </Link>

        {/* Desktop center nav */}
        <nav
          aria-label="Primary navigation"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '36px',
          }}
          className="hj-desktop-nav"
        >
          {primaryNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.68rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
                textDecoration: 'none',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--graphite)'
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right controls */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            // The counterpart to the brand link's `0 1 auto`: controls hold their
            // size and the brand absorbs the difference.
            flexShrink: 0,
          }}
        >
          {/* Search icon — /search owns the input and the query string, so this
              control only has to get the visitor there. */}
          <button
            aria-label="Search"
            className="hj-desktop-only"
            onClick={() => {
              setMenuOpen(false)
              router.push('/search')
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <line
                x1="12"
                y1="12"
                x2="17"
                y2="17"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Mobile menu toggle */}
          <button
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.68rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
            }}
            className="hj-mobile-menu-btn"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {/* ── Mobile full-screen overlay ──────────────────────────────── */}
      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 89,
            backgroundColor: 'var(--ink)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
          }}
        >
          {primaryNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.4rem,8vw,4.5rem)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--bg)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </Link>
          ))}
          {/* Search is hidden from the header below 769px, so it lives here.
              Account used to sit beside it. Both controls came into this overlay
              because on a phone Account was reachable only through a 10.88px word
              crammed against the edge of the viewport — see ADR 016 — and that
              reasoning still holds for Search, which is why Search stays.
              `e2e/header-fit.spec.ts` asserts Search is present here, so a control
              removed from the header cannot quietly cease to exist. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '8px' }}>
            <button
              aria-label="Search"
              onClick={() => {
                setMenuOpen(false)
                router.push('/search')
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.85rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--titanium)',
                padding: '10px 4px',
              }}
            >
              Search
            </button>
          </div>

          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.65rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--titanium)',
              marginTop: '12px',
            }}
          >
            Titanium · Niobium · Surgical Steel
          </p>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .hj-desktop-nav { display: none !important; }
          /* Search moves into the full-screen overlay below this width (Account
             did too, until it was removed). Without this the header needed 435px
             of content to lay out and every phone is narrower than that — see
             e2e/header-fit.spec.ts, which re-measures rather than assuming. */
          .hj-desktop-only { display: none !important; }
        }
        @media (min-width: 769px) {
          .hj-mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </>
  )
}

export default Nav
