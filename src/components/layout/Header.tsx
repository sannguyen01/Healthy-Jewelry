'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Stones', href: '/stones' },
  { label: 'Collections', href: '/collections' },
  { label: 'Traditions', href: '/traditions' },
  { label: 'Journal', href: '/journal' },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
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
        backgroundColor: scrolled ? 'var(--color-dark)' : 'transparent',
        transition: 'background-color var(--duration-base) var(--ease-bio)',
        borderBottom: scrolled ? '1px solid rgba(248, 245, 240, 0.06)' : 'none',
      }}
    >
      {/* Wordmark */}
      <Link
        href="/"
        aria-label="Healthy Jewelry — home"
        style={{
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.20em',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Healthy Jewelry
      </Link>

      {/* Desktop Nav */}
      <nav
        aria-label="Primary navigation"
        style={{
          display: 'flex',
          gap: '32px',
          marginLeft: 'auto',
          marginRight: '32px',
        }}
        className="desktop-nav"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              transition: `color var(--duration-fast) var(--ease-bio)`,
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Atelier CTA */}
      <Link
        href="/atelier"
        className="btn-ghost"
        style={{ display: 'none' }}
        aria-label="Book a consultation"
      >
        Atelier
      </Link>

      {/* Mobile menu toggle */}
      <button
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          marginLeft: 'auto',
          color: 'var(--color-text)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
        className="mobile-menu-toggle"
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
            backgroundColor: 'var(--color-dark)',
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
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
                letterSpacing: '0.05em',
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
