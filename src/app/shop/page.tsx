import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductGrid } from '@/components/product/ProductGrid'
import { getProducts } from '@/lib/shopify'

export const metadata: Metadata = {
  title: 'Shop All',
  description:
    'Browse the full Healthy Jewelry collection. Implant-grade titanium, niobium, and 316L surgical steel rings, necklaces, earrings, bracelets, and charms.',
}

export default async function ShopPage() {
  const products = await getProducts()

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px' }}>
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
              fontSize: 'var(--text-display)',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              lineHeight: 1.05,
            }}
          >
            The Collection
          </h1>
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
      <CartDrawer />
    </>
  )
}
