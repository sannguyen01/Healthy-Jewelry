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

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <>
      <style>{`
        .hj-bc-link { color: var(--graphite); text-decoration: none; transition: color 0.2s ease; }
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
          fontSize: 'var(--text-xs)',
          color: 'var(--graphite)',
          letterSpacing: '0.1em',
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
                  style={{
                    color: isLast ? 'var(--ink)' : 'var(--graphite)',
                    textTransform: 'capitalize',
                  }}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hj-bc-link"
                  style={{ textTransform: 'capitalize' }}
                >
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
