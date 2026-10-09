'use client'

import Link from 'next/link'
import { archiveCategories, mainNav } from '@/config/navigation'
import { hjMaterials } from '@/lib/data/hj-data'
import { LEGAL_ENTITY_NAME } from '@/config/site'
import { MetalDot } from '@/components/ui/MetalDot'

/**
 * The open menu: an archive on the ground, in three columns (ADR 051). The categories, the
 * metallurgy (each metal with its dot and its specification, never a claim) and the places to go
 * with a note on the foundation; then a search with a label that stays above its field, and the
 * footer strip. One column below 961px.
 *
 * The search is a real GET form to `/search`, so it works with no script and a submit is a request
 * from anywhere (ADR 045); the field is named `q`, which is what the results page reads.
 *
 * Everything here is a link to a route that exists (`navigation-destinations.test.ts` checks the
 * lists this reads), and a chosen link calls `onNavigate`, which closes the menu and hands focus
 * back to the button that opened it.
 */
export interface MenuArchiveProps {
  onNavigate: () => void
}

function Arrow() {
  return (
    <svg className="hj-archive-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7h11M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MenuArchive({ onNavigate }: MenuArchiveProps) {
  return (
    <div className="hj-archive">
      <div className="hj-archive-grid">
        <nav aria-label="Categories" className="hj-archive-categories">
          <div className="hj-label hj-archive-head">Categories</div>
          <ul className="hj-archive-list">
            {archiveCategories.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={onNavigate} className="hj-menu-link hj-archive-row">
                  {item.label}
                  <Arrow />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="The metallurgy" className="hj-archive-metals">
          <div className="hj-label hj-archive-head">The metallurgy</div>
          <ul className="hj-archive-list">
            {hjMaterials.map((metal, index) => (
              <li key={metal.handle}>
                <Link href="/materials" onClick={onNavigate} className="hj-archive-metal">
                  <span className="hj-label hj-archive-ordinal">
                    <MetalDot metal={metal.handle} />
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="hj-archive-metal-name">{metal.title}</span>
                    <span className="hj-spec hj-archive-metal-spec">{metal.designation}</span>
                  </span>
                  <Arrow />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Explore" className="hj-archive-explore">
          <div className="hj-label hj-archive-head">Explore</div>
          <ul className="hj-archive-list">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={onNavigate} className="hj-archive-explore-row hj-archive-row">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hj-archive-note">
            <span className="hj-spec">Foundation note</span>
            <p>No stones. No fillers. Each metal is named by its specification.</p>
          </div>
        </nav>
      </div>

      <form action="/search" method="get" role="search" className="hj-archive-search">
        <label htmlFor="menu-search" className="hj-label">
          Search the pieces
        </label>
        <div className="hj-archive-search-row">
          <input
            id="menu-search"
            name="q"
            type="search"
            className="hj-field"
            placeholder="Titanium, studs, bangle"
            autoComplete="off"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" className="btn-primary" style={{ minWidth: 112 }}>
            Search
          </button>
        </div>
      </form>

      <div className="hj-archive-foot">
        {/* The registered company, as the footer's copyright line is: see LEGAL_ENTITY_NAME. */}
        <span>© 2026 {LEGAL_ENTITY_NAME}</span>
        <span className="hj-spec">Grade 23 Titanium · Niobium · 316L Steel</span>
      </div>
    </div>
  )
}

export default MenuArchive
