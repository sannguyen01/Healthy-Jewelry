import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductDetail } from '@/components/product/ProductDetail'
import { HorizontalScroll } from '@/components/home/HorizontalScroll'
import { hjCollections } from '@/lib/data/hj-data'
import { getProduct, getProducts, getProductsByCollection } from '@/lib/shopify'
import { SEO_DEFAULTS, SITE_URL } from '@/config/site'
import { JsonLd, productJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'

interface ProductPageProps {
  params: Promise<{ handle: string }>
}

export async function generateStaticParams() {
  // Shopify, not the static fallback. Prerendering static handles built pages
  // for 26 products that do not exist in Shopify — each one a build-time 404 —
  // while prerendering none of the 20 that do.
  //
  // `getProducts` returns the static catalogue by itself when Shopify is
  // unconfigured, so local builds and CI are unchanged.
  const products = await getProducts()
  return products.map((p) => ({ handle: p.handle }))
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { handle } = await params
  // Same source as the page body below. These were split — body from Shopify,
  // metadata from the static catalogue — and because the two catalogues are
  // nearly disjoint, 20 of the 22 live products returned 'Product Not Found'
  // as their title while rendering a perfectly good page. That string was the
  // browser tab, the search result, and the shared link.
  const product = await getProduct(handle)
  if (!product) {
    return { title: 'Product Not Found' }
  }

  const description = product.description || SEO_DEFAULTS.description

  return {
    title: product.title,
    description,
    // The route's own opengraph-image.tsx supplies the image; naming title and
    // description here keeps the share card's text from falling back to the
    // site-wide defaults.
    openGraph: {
      title: product.title,
      description,
      type: 'website',
      url: `${SITE_URL}/products/${product.handle}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description,
    },
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
