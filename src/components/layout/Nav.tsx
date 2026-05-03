'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { useCartStore } from '@/store/cart'
import { useScrolled } from '@/lib/hooks/useScrolled'
import { primaryNavLinks } from '@/config/navigation'

interface NavProps {
  cartCount?: number
}

export function Nav({ cartCount }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolled(60)
  const storeCount = useCartStore((s) => s.totalItems())
  const openCart = useCartStore((s) => s.openCart)

  const count = cartCount ?? storeCount

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
        {/* Logo — left */}
        <Link
          href="/"
          aria-label="Healthy Jewelry — home"
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <Image
            src="/logo.png"
            alt="Healthy Jewelry"
            width={120}
            height={32}
            style={{ objectFit: 'contain', height: '28px', width: 'auto' }}
            priority
          />
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
          }}
        >
          {/* Search icon */}
          <button
            aria-label="Search"
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

          {/* BAG button */}
          <button
            aria-label={`Open bag — ${count} item${count !== 1 ? 's' : ''}`}
            onClick={openCart}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.68rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            Bag
            {count > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ink)',
                  color: 'var(--bg)',
                  fontSize: '9px',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {count}
              </span>
            )}
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
        }
        @media (min-width: 769px) {
          .hj-mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </>
  )
}

export default Nav
