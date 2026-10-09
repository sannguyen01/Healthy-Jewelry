// Healthy Jewelry — Breadcrumb navigation. Visual only; JSON-LD is generated
// separately via breadcrumbJsonLd() in JsonLd.tsx.

import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

/**
 * The trail is the label voice: DM Sans 500 in tracked capitals, like every other small datum on
 * a page (a specification, a tag). It was `capitalize` on the links and the current page inside a
 * nav that said `uppercase` — mixed case at 500, which no voice of this site is — and a trail of
 * piece names in Title Case sat above a heading and a card name set in capitals (ADR 052).
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <>
      <style>{`
        .hj-bc-link { color: var(--graphite); text-decoration: none; transition: color var(--duration-fast) var(--ease); display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 24px; }
        .hj-bc-link:hover { color: var(--ink); }
      `}</style>
      <nav
        aria-label="Breadcrumb"
        style={{
          padding: '20px var(--space-gutter) 0',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          fontSize: 'var(--text-xs)',
          color: 'var(--graphite)',
          letterSpacing: 'var(--tracking-meta)',
          textTransform: 'uppercase',
        }}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <span
              key={`${item.label}-${index}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  style={{ color: isLast ? 'var(--ink)' : 'var(--graphite)' }}
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="hj-bc-link">
                  {item.label}
                </Link>
              )}
              {!isLast && <span aria-hidden="true">›</span>}
            </span>
          )
        })}
      </nav>
    </>
  )
}

export default Breadcrumbs
