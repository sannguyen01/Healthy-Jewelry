import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { ProductGrid } from '@/components/product/ProductGrid'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd'
import Link from 'next/link'
import { collectionsNav } from '@/config/navigation'
import { getAllProducts } from '@/lib/catalog'
import { SITE_NAME } from '@/config/site'

const BREADCRUMB_ITEMS = [{ label: 'Home', href: '/' }, { label: 'Shop' }]

export const metadata: Metadata = {
  title: 'Shop All',
  description:
    `Browse the full ${SITE_NAME} collection: rings, necklaces, earrings, bracelets and charms in Grade 23 titanium, niobium and 316L surgical steel.`,
}

export default async function ShopPage() {
  const products = getAllProducts()

  return (
    <>
      <JsonLd type="BreadcrumbList" data={breadcrumbJsonLd(BREADCRUMB_ITEMS)} />
      <Nav />
      <main style={{ paddingTop: '64px' }}>
        <Breadcrumbs items={BREADCRUMB_ITEMS} />

        {/* Section header */}
        <section
          style={{
            padding: 'var(--space-section) var(--space-gutter) calc(var(--space-section) / 2)',
          }}
        >
          <span className="label-eyebrow" style={{ marginBottom: '12px' }}>
            All Products
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: 'var(--text-display)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--ink)',
              lineHeight: 1.05,
            }}
          >
            The Collection
          </h1>
          <nav
            aria-label="Collections"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginTop: '28px' }}
          >
            {collectionsNav.map((collection) => (
              <Link
                key={collection.handle}
                href={collection.href}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--ash)',
                }}
              >
                {collection.title}
              </Link>
            ))}
          </nav>
        </section>

        {/* Product grid with filters */}
        <section
          style={{
            padding: '0 var(--space-gutter) var(--space-section)',
          }}
        >
          <ProductGrid products={products} showFilters={true} />
        </section>
      </main>
      <Footer />
    </>
  )
}
