import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { ProductDetail } from '@/components/product/ProductDetail'
import { HorizontalScroll } from '@/components/home/HorizontalScroll'
import { getAllCollections } from '@/lib/catalog'
import { getProductByHandle, getAllProducts, getProductsByCollection } from '@/lib/catalog'
import { SITE_URL } from '@/config/site'
import { productSeo, NOT_FOUND_SEO } from '@/lib/seo/productSeo'
import { JsonLd, productJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'

interface ProductPageProps {
  params: Promise<{ handle: string }>
}

/**
 * **An unknown handle is a real 404, not a page that says "not found".**
 *
 * `dynamicParams = false` makes `generateStaticParams` exhaustive: a handle not in that
 * list is never rendered on demand, so Next answers 404 with a status code rather than
 * 200 with `not-found.tsx` inside it.
 *
 * This could not be set while Shopify was the catalogue, and the page said so: a merchant
 * adding a product in an admin console would have got a hard 404 until the next deploy.
 * That premise expired the moment `src/content/catalog/**` became the source — nobody can
 * add a product anywhere but this repository now, so the list below is complete by
 * construction.
 *
 * `src/tests/unit/soft-404-premise.test.ts` is why this is not a line somebody had to
 * remember. It reads the page's imports through the TypeScript compiler and fails the
 * moment the data source moves without this beside it; it failed on exactly that during
 * WS-4b, naming the fix in its message. [ADR 008](../../../../docs/adr/008-decisions-need-premise-detectors.md).
 */
export const dynamicParams = false

export function generateStaticParams() {
  // Exhaustive, and asserted to be: `catalog-content.test.ts` holds this catalogue at 17
  // records and reconciles 17 + 5 = 22 against the Shopify delta WS-2 has yet to close.
  return getAllProducts().map((p) => ({ handle: p.handle }))
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { handle } = await params
  // Same source as the page body below. These were split — body from Shopify,
  // metadata from the static catalogue — and because the two catalogues are
  // nearly disjoint, 20 of the 22 live products returned 'Product Not Found'
  // as their title while rendering a perfectly good page. That string was the
  // browser tab, the search result, and the shared link.
  const product = getProductByHandle(handle)
  if (!product) {
    // Unreachable in practice now that `dynamicParams = false` makes an unknown handle a
    // real 404 before this runs. Kept because `generateMetadata` and the page body resolve
    // the handle independently, and a metadata function that assumed the product exists
    // would throw rather than degrade if that ever stopped being true. The `noindex` it
    // carries costs nothing and is the right answer if it is ever reached.
    return NOT_FOUND_SEO
  }

  // Shared, pure derivation — the same one the OG image and JSON-LD use, so
  // the tab, the share card and the structured data cannot describe the
  // product differently.
  const { title, description } = productSeo(product)

  return {
    title,
    description,
    // The route's own opengraph-image.tsx supplies the image; naming title and
    // description here keeps the share card's text from falling back to the
    // site-wide defaults.
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/products/${product.handle}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params
  const product = getProductByHandle(handle)

  if (!product) {
    notFound()
  }

  const related = getProductsByCollection(product.collection).filter(
    (p) => p.handle !== product.handle
  )

  // Matches the title shown on /shop/[collection] rather than the raw
  // handle, so JSON-LD and the rendered breadcrumb agree on the same name.
  const collectionTitle =
    getAllCollections().find((c) => c.handle === product.collection)?.title ?? product.collection

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
    </>
  )
}
