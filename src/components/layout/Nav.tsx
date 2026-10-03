'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useScrolled } from '@/lib/hooks/useScrolled'

export function Nav() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolled(60)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  const state = menuOpen ? 'menu-open' : scrolled ? 'solid' : 'hero-overlay'

  // Focus management
  useEffect(() => {
    if (menuOpen) {
      const drawer = drawerRef.current
      if (!drawer) return

      const focusableElements = drawer.querySelectorAll<HTMLElement>(
        'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (firstElement) {
        setTimeout(() => firstElement.focus(), 50)
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setMenuOpen(false)
          menuBtnRef.current?.focus()
        }
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault()
              lastElement?.focus()
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault()
              firstElement?.focus()
            }
          }
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = ''
      }
    }
  }, [menuOpen])

  const menuItems = [
    { label: 'Pieces', href: '/shop' },
    { label: 'Our metals', href: '/materials' },
    { label: 'Our story', href: '/about' },
    { label: 'Find us', href: '/stores' },
    { label: 'Contact', href: '/contact' },
  ]

  return (
    <>
      <header className="hj-header" data-state={state}>
        {/* Left: Menu control */}
        <div className="hj-header-left">
          <button
            ref={menuBtnRef}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="hj-menu-btn"
          >
            {menuOpen ? 'CLOSE' : 'MENU'}
          </button>
        </div>

        {/* Center: Genuinely centered wordmark */}
        <div className="hj-header-center">
          <Link href="/" aria-label="Healthy Jewelry — home" className="hj-wordmark" onClick={() => setMenuOpen(false)}>
            HEALTHY JEWELLERY
          </Link>
        </div>

        {/* Right: Search and Contact */}
        <div className="hj-header-right">
          <button
            aria-label="Search"
            onClick={() => {
              setMenuOpen(false)
              router.push('/search')
            }}
            className="hj-icon-btn"
          >
            <span className="hj-desktop-text">SEARCH</span>
            <svg className="hj-mobile-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <line x1="12" y1="12" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <Link
            href="/contact"
            onClick={() => setMenuOpen(false)}
            className="hj-icon-btn hj-desktop-text"
          >
            CONTACT
          </Link>
        </div>
      </header>

      {/* Menu Drawer */}
      <div
        ref={drawerRef}
        className="hj-menu-drawer"
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <div className="hj-menu-drawer-inner">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="hj-menu-link"
              tabIndex={menuOpen ? 0 : -1}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

export default Nav
