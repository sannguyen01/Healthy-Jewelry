import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductDetail } from '@/components/product/ProductDetail'
import { HorizontalScroll } from '@/components/home/HorizontalScroll'
import { getAllProducts, getProductByHandle, getProductsByCollection } from '@/lib/data/hj-data'

interface ProductPageProps {
  params: Promise<{ handle: string }>
}

export function generateStaticParams() {
  return getAllProducts().map((p) => ({ handle: p.handle }))
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { handle } = await params
  const product = getProductByHandle(handle)
  if (!product) {
    return { title: 'Product Not Found' }
  }
  return {
    title: product.title,
    description: product.description,
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params
  const product = getProductByHandle(handle)

  if (!product) {
    notFound()
  }

  const related = getProductsByCollection(product.collection).filter((p) => p.id !== product.id)

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px' }}>
        {/* Breadcrumbs */}
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
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            color: 'var(--graphite)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          <Link href="/" className="hj-bc-link">
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <Link href="/shop" className="hj-bc-link">
            Shop
          </Link>
          <span aria-hidden="true">›</span>
          <Link
            href={`/shop/${product.collection}`}
            className="hj-bc-link"
            style={{ textTransform: 'capitalize' }}
          >
            {product.collection}
          </Link>
          <span aria-hidden="true">›</span>
          <span style={{ color: 'var(--ink)' }}>{product.title}</span>
        </nav>

        {/* Product detail */}
        <section
          style={{
            padding: 'var(--space-section) var(--space-gutter)',
          }}
        >
          <ProductDetail product={product} />
        </section>

        {/* Related products */}
        {related.length > 0 && <HorizontalScroll label="YOU MAY ALSO LIKE" products={related} />}
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
