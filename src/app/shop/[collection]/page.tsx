import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductGrid } from '@/components/product/ProductGrid'
import { getProductsByCollection, hjCollections } from '@/lib/data/hj-data'
import type { HJCollectionHandle } from '@/lib/shopify/types'

const VALID_COLLECTIONS: HJCollectionHandle[] = [
  'rings',
  'necklaces',
  'earrings',
  'bracelets',
]

export function generateStaticParams() {
  return VALID_COLLECTIONS.map((collection) => ({ collection }))
}

interface CollectionPageProps {
  params: Promise<{ collection: string }>
}

export async function generateMetadata(
  { params }: CollectionPageProps
): Promise<Metadata> {
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
  const products = getProductsByCollection(handle)

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px' }}>
        {/* Collection header */}
        <section
          style={{
            padding:
              'var(--space-section) var(--space-gutter) calc(var(--space-section) / 2)',
          }}
        >
          <span className="label-eyebrow" style={{ marginBottom: '12px' }}>
            {col?.description ?? 'Collection'}
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
            {col?.title ?? handle}
          </h1>
        </section>

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
