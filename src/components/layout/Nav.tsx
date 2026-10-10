'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useHeroOverlay } from '@/lib/hooks/useHeroOverlay'
import { BrandLockup } from '@/components/layout/BrandLockup'
import { MenuArchive } from '@/components/layout/MenuArchive'

interface NavProps {
  /**
   * The page begins with a hero the header lies over, and this is which side of the photograph's top edge the header's
   * type is set against: `light` is light type on a darkened band, `dark` is ink on a light one. Only the home page has
   * a hero, and it says so: the header's state is a fact about the page, rendered by the server, not something it
   * infers from a scroll distance. Every other page leaves it out and is `solid` from its first byte (it was
   * transparent for its first 60px). The hero's record carries the tone and a rendered-pixel test proves it.
   */
  heroTone?: 'light' | 'dark'
}

export function Nav({ heroTone }: NavProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const overlay = useHeroOverlay(heroTone !== undefined)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  // Closing by activating a drawer control would otherwise leave focus on an element that has
  // just become inert, which drops it to <body>. Hand it to the menu button first.
  const closeMenu = () => {
    setMenuOpen(false)
    menuBtnRef.current?.focus()
  }

  const state = menuOpen ? 'menu-open' : overlay ? 'hero-overlay' : 'solid'

  // Focus management. While the drawer is open the Tab cycle is every control in the header
  // (the menu button is the visible close control and lives outside the drawer element) followed
  // by the drawer's own controls, in DOM order.
  useEffect(() => {
    if (!menuOpen) return
    const drawer = drawerRef.current
    const menuBtn = menuBtnRef.current
    const header = headerRef.current
    if (!drawer || !menuBtn || !header) return

    // The archive carries a search field as well as links and a button, and a Tab cycle that skipped
    // it would walk past the one control that takes text.
    const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea'
    const cycle = (): HTMLElement[] => [
      ...Array.from(header.querySelectorAll<HTMLElement>(FOCUSABLE)),
      ...Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)),
    ]

    // Focus the first link once the drawer is actually focusable. The archive mounts with the open
    // state, and for a moment its links compute `visibility: hidden` (the drawer's own transition
    // has not reached them yet), so one `focus()` at a fixed delay is silently ignored. Measured: the
    // first attempt at 60ms found the link hidden. So try again until focus has landed.
    let attempts = 0
    let focusTimer = 0
    const focusFirstLink = () => {
      const target = drawer.querySelector<HTMLElement>('a[href]')
      target?.focus()
      if (target && document.activeElement !== target && attempts < 12) {
        attempts += 1
        focusTimer = window.setTimeout(focusFirstLink, 50)
      }
    }
    focusTimer = window.setTimeout(focusFirstLink, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuBtn.focus()
        return
      }
      if (e.key !== 'Tab') return
      const items = cycle()
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    // A dialog is modal to a screen reader only if what is behind it cannot be reached. `aria-modal` is a hint
    // some assistive technology ignores and the Tab trap above holds only the keyboard, so the page itself goes
    // inert while the menu is open. Only what this effect set is restored: a page that was already inert stays so.
    const inerted = [document.getElementById('main'), document.querySelector('footer')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('inert')
    )
    inerted.forEach((el) => el.setAttribute('inert', ''))

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      inerted.forEach((el) => el.removeAttribute('inert'))
    }
  }, [menuOpen])

  return (
    <>
      <header
        ref={headerRef}
        className="hj-header"
        data-state={state}
        data-bar-tone={heroTone}
      >
        {/* Left: Menu control */}
        <div className="hj-header-left">
          <button
            ref={menuBtnRef}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="hj-menu-btn"
          >
            {menuOpen ? (
              <svg className="hj-menu-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="hj-menu-icon" width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden="true">
                <path d="M1 2h16M1 10h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            <span>{menuOpen ? 'CLOSE' : 'MENU'}</span>
          </button>
        </div>

        {/* Center: the knot mark and the name, genuinely centred */}
        <div className="hj-header-center">
          <BrandLockup variant="inline" className="hj-wordmark" onClick={closeMenu} eager />
        </div>

        {/* Right: Search and Contact */}
        <div className="hj-header-right">
          <button
            aria-label="Search"
            onClick={() => {
              closeMenu()
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
            onClick={closeMenu}
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
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        {/* Mounted only while open: a closed menu is a hidden page of links, a form and a paragraph on
            every route, and the specs that look for "the first form on the page" found it. */}
        {menuOpen && <MenuArchive onNavigate={closeMenu} />}
      </div>
    </>
  )
}

export default Nav
