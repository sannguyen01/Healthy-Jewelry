'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Stones', href: '/stones' },
  { label: 'Collections', href: '/collections' },
  { label: 'Traditions', href: '/traditions' },
  { label: 'Journal', href: '/journal' },
]

// Minimal titanium ring mark — two concentric circles echoing the jewelry motif
function BrandMark() {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ width: 22, height: 22, flexShrink: 0 }}
    >
      <circle cx="14" cy="14" r="11" stroke="var(--titanium)" strokeWidth="3" fill="none" />
      <circle cx="14" cy="14" r="6" stroke="var(--ash)" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      role="banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-gutter)',
        backgroundColor: scrolled ? 'rgba(247, 245, 241, 0.94)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        transition: `background-color var(--duration-base) var(--ease)`,
        borderBottom: scrolled ? '1px solid var(--ash)' : '1px solid transparent',
      }}
    >
      {/* Logo mark + brand name — same font as footer brand column */}
      <Link
        href="/"
        aria-label="Healthy Jewelry — home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <BrandMark />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
            lineHeight: 1,
          }}
        >
          Healthy Jewelry
        </span>
      </Link>

      {/* Desktop nav — hj-desk-nav handles show/hide at 768px breakpoint */}
      <nav
        aria-label="Primary navigation"
        style={{ gap: '32px', marginLeft: 'auto', marginRight: '32px' }}
        className="hj-desk-nav"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              transition: `color var(--duration-fast) var(--ease)`,
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Atelier CTA — desktop only; hj-desk-nav (utilities layer) overrides btn-ghost display */}
      <Link
        href="/atelier"
        className="btn-ghost hj-desk-nav"
        aria-label="Book a consultation"
      >
        Atelier
      </Link>

      {/* Mobile menu toggle — hj-mob-menu: hidden on desktop, flex on ≤768px */}
      <button
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          marginLeft: 'auto',
          color: 'var(--ink)',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
        className="hj-mob-menu"
      >
        {menuOpen ? 'Close' : 'Menu'}
      </button>

      {/* Mobile overlay */}
      {menuOpen && (
        <nav
          aria-label="Mobile navigation"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            zIndex: 99,
          }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--ink)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/atelier"
            onClick={() => setMenuOpen(false)}
            className="btn-ghost"
          >
            Book Atelier
          </Link>
        </nav>
      )}
    </header>
  )
}

export default Header
