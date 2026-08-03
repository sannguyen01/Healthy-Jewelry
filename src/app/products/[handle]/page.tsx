import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductDetail } from '@/components/product/ProductDetail'
import { HorizontalScroll } from '@/components/home/HorizontalScroll'
import { getAllProducts, getProductByHandle, hjCollections } from '@/lib/data/hj-data'
import { getProduct, getProductsByCollection } from '@/lib/shopify'
import { JsonLd, productJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'

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
  const product = await getProduct(handle)

  if (!product) {
    notFound()
  }

  const related = (await getProductsByCollection(product.collection)).filter(
    (p) => p.id !== product.id
  )

  // Matches the title shown on /shop/[collection] rather than the raw
  // handle, so JSON-LD and the rendered breadcrumb agree on the same name.
  const collectionTitle =
    hjCollections.find((c) => c.handle === product.collection)?.title ?? product.collection

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Shop', href: '/shop' },
    { label: collectionTitle, href: `/shop/${product.collection}` },
    { label: product.title },
  ]

  return (
    <>
      <JsonLd type="Product" data={productJsonLd(product)} />
      <JsonLd type="BreadcrumbList" data={breadcrumbJsonLd(breadcrumbItems)} />
      <Nav />
      <main style={{ paddingTop: '64px' }}>
        <Breadcrumbs items={breadcrumbItems} />

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
