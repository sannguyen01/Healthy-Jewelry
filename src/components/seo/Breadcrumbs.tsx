// Healthy Jewelry — Breadcrumbs with JSON-LD BreadcrumbList
// dangerouslySetInnerHTML is safe here: data is server-generated structured data, never user input.

import { SITE_URL } from '@/config/site'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* CSS-only hover — no event handlers needed (Server Component safe) */}
      <style>{`.hj-breadcrumb-link{color:var(--graphite);text-decoration:none;transition:color 0.2s ease}.hj-breadcrumb-link:hover{color:var(--ink)}`}</style>

      <nav
        aria-label="Breadcrumb"
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--graphite)',
          }}
        >
          {items.map((item, index) => {
            const isLast = index === items.length - 1

            return (
              <li key={`${item.label}-${index}`} style={{ display: 'flex', alignItems: 'center' }}>
                {isLast || !item.href ? (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    style={{ color: isLast ? 'var(--ink)' : 'var(--graphite)' }}
                  >
                    {item.label}
                  </span>
                ) : (
                  <a href={item.href} className="hj-breadcrumb-link">
                    {item.label}
                  </a>
                )}

                {!isLast && (
                  <span
                    aria-hidden="true"
                    style={{ margin: '0 8px', color: 'var(--ash)', userSelect: 'none' }}
                  >
                    /
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}

export default Breadcrumbs
