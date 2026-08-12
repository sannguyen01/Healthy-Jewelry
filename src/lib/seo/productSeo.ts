import { SEO_DEFAULTS } from '@/config/site'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * The text that describes a product to anything that is not the page itself:
 * the browser tab, the search result, the share card, the JSON-LD.
 *
 * ## Why this is a function and not four inlined expressions
 *
 * These strings were derived independently in `generateMetadata`,
 * `opengraph-image.tsx` and `productJsonLd`. Independent derivations of the
 * same fact drift, and this project has already paid for that once: the page
 * body read Shopify while `generateMetadata` read the static catalogue, and
 * because the two catalogues barely overlap, 20 of 22 live products advertised
 * themselves as "Product Not Found".
 *
 * ## Why it takes a product rather than a handle
 *
 * Deliberately **pure**. An earlier proposal had a single `getProductForPage`
 * that every surface would call, but that cannot work: `opengraph-image.tsx` is
 * a separate route served on a separate request, so it can never share a fetch
 * result with `page.tsx` — deduplication happens in Next's cache, not by
 * calling one function. What *can* be shared is the derivation. Each surface
 * fetches through `@/lib/shopify` (enforced by
 * `metadata-data-source.test.ts`) and then derives through here, so the fetch
 * can be cached independently while the text cannot diverge.
 */
export interface ProductSeo {
  /** Bare product title. Next applies the site title template around it. */
  title: string
  description: string
  /** Title including the brand, for surfaces Next does not template. */
  fullTitle: string
}

/**
 * Metadata for a product handle that does not resolve.
 *
 * `/products/<unknown>` answers **HTTP 200** while rendering `not-found.tsx`, and no code
 * in the page can change that: Next returns 200 for streamed responses and 404 only for
 * non-streamed ones, so the status line is already sent before the render discovers there
 * is no product. Unlike `/shop/[collection]`, this route cannot use
 * `dynamicParams = false` — the handle set is open, and locking it would 404 any product
 * added in Shopify until the next redeploy.
 *
 * So the status stays wrong and the *harm* is addressed instead. `noindex` is Google's own
 * remedy for a soft 404 that cannot be status-coded: it removes the URL from the index
 * rather than merely discouraging the crawl, which is why it is the right tool here and a
 * `robots.txt` disallow is not — a disallowed URL can still be indexed from links alone.
 *
 * `follow: false` as well: there is nothing on a not-found page worth passing link equity
 * to.
 */
export const NOT_FOUND_SEO = {
  title: 'Product Not Found',
  robots: { index: false, follow: false },
} as const

export function productSeo(product: HJProduct): ProductSeo {
  // A Shopify product with an empty description is legitimate — it just must
  // not become an empty meta description, which reads to a crawler as a page
  // with nothing on it.
  const description = product.description?.trim() || SEO_DEFAULTS.description

  return {
    title: product.title,
    description,
    fullTitle: `${product.title} — ${SEO_DEFAULTS.openGraph.siteName}`,
  }
}
