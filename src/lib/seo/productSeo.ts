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
