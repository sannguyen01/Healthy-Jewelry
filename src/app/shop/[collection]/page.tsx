import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductGrid } from '@/components/product/ProductGrid'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd'
import { hjCollections } from '@/lib/data/hj-data'
import { getProductsByCollection } from '@/lib/shopify'
import type { HJCollectionHandle } from '@/lib/shopify/types'

const VALID_COLLECTIONS: HJCollectionHandle[] = [
  'rings',
  'necklaces',
  'earrings',
  'bracelets',
  'charms',
]

const COLLECTION_NUMBERS: Record<string, string> = {
  rings: '01',
  necklaces: '02',
  earrings: '03',
  bracelets: '04',
  charms: '05',
}

export function generateStaticParams() {
  return VALID_COLLECTIONS.map((collection) => ({ collection }))
}

interface CollectionPageProps {
  params: Promise<{ collection: string }>
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { collection } = await params
  const col = hjCollections.find((c) => c.handle === collection)
  if (!col) {
    return { title: 'Collection Not Found' }
  }
  return {
    title: col.title,
    description: col.description,
  }
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { collection } = await params

  if (!VALID_COLLECTIONS.includes(collection as HJCollectionHandle)) {
    notFound()
  }

  const handle = collection as HJCollectionHandle
  const col = hjCollections.find((c) => c.handle === handle)
  const products = await getProductsByCollection(handle)

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Shop', href: '/shop' },
    { label: col?.title ?? handle },
  ]

  return (
    <>
      <JsonLd type="BreadcrumbList" data={breadcrumbJsonLd(breadcrumbItems)} />
      <Nav />
      <main style={{ paddingTop: '64px' }}>
        <Breadcrumbs items={breadcrumbItems} />

        {/* Collection header */}
        <section
          style={{
            backgroundColor: 'var(--nacre)',
            padding: 'clamp(100px, 12vw, 140px) var(--space-gutter) clamp(48px, 6vw, 72px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative number — bottom-right, large, very faint */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: '-0.1em',
              right: 'var(--space-gutter)',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(8rem, 20vw, 18rem)',
              letterSpacing: '-0.02em',
              color: 'var(--ash)',
              opacity: 0.35,
              lineHeight: 1,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {COLLECTION_NUMBERS[handle] ?? '01'}
          </span>

          <span className="label-eyebrow">{col?.description ?? 'Collection'}</span>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--ink)',
              lineHeight: 1.02,
              margin: 0,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {col?.title ?? handle}
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--graphite)',
              lineHeight: 1.6,
              fontWeight: 300,
              margin: 0,
              maxWidth: '480px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {col?.description ?? ''}
          </p>
        </section>

        {/* Products count bar */}
        <div
          style={{
            padding: 'clamp(20px, 3vw, 32px) var(--space-gutter) 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
            }}
          >
            {products.length} {products.length === 1 ? 'piece' : 'pieces'}
          </span>
        </div>

        {/* Product grid — no filters on collection pages */}
        <section
          style={{
            padding: '0 var(--space-gutter) var(--space-section)',
          }}
        >
          <ProductGrid products={products} showFilters={false} />
        </section>
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
