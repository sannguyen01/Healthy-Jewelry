// Healthy Jewelry — JSON-LD structured data components
// dangerouslySetInnerHTML is safe here: data is server-generated structured data, never user input.

import type { CatalogProduct } from '@/lib/catalog'
import { SITE_NAME, SITE_URL, CONTACT_EMAIL, SOCIAL_LINKS } from '@/config/site'
import { productSeo } from '@/lib/seo/productSeo'
import type { BreadcrumbItem } from './Breadcrumbs'

// ── Material handle → full name map ───────────────────────────────────────

const MATERIAL_NAMES: Record<string, string> = {
  titanium: 'Grade 23 Titanium',
  niobium: 'Niobium',
  'surgical-steel': '316L Surgical Steel',
}

// ── Helper: productJsonLd ──────────────────────────────────────────────────

/**
 * The public catalogue entry for a product. **No `offers` block.**
 *
 * ## The claim that had stopped being true
 *
 * This emitted an `Offer` carrying `price`, `priceCurrency`, a purchase `url`, and
 * `availability: https://schema.org/InStock`. That was correct for a storefront with a
 * checkout, and its currency handling was correct for the same reason — a hardcoded USD
 * here would have published dollar prices for a VND store to Google Shopping.
 *
 * PR #75 removed the Add to Bag control. From that merge onward there has been **no way to
 * buy anything on this site**, and the structured data has been telling every search engine
 * that all seventeen products are in stock, at a price, at a purchase URL. Not a stale
 * field: an assertion, to the one audience that reads structured data instead of the page,
 * that a transaction is available which is not.
 *
 * So this is a correction rather than a step of the decommission that could wait for the
 * data source to change. `schema.org/Product` without an `offers` block is valid, and it is
 * the honest description of a catalogue you cannot buy from.
 *
 * ## What stays, and what is left out and why
 *
 * `name`, `description`, `brand` and `material` stay: they are claims about the object,
 * and they remain true. `url` is the product's own page — `Product.url` is "URL of the
 * item", not a purchase link, which was `offers.url` and is gone with it.
 *
 * **No `image`.** The decommission brief's example carries one, and every product here is
 * drawn rather than photographed, so there is no image URL that would not be invented.
 * When photography exists (see the `photo` arm of the catalogue's media union) this is
 * where it goes.
 *
 * `browse-only-smoke`'s `commerce-offer-jsonld`, `commerce-price-jsonld` and
 * `commerce-availability-jsonld` findings are the live check on all of this.
 */
export function productJsonLd(product: CatalogProduct): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productSeo(product).title,
    description: productSeo(product).description,
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    material: MATERIAL_NAMES[product.material] ?? product.material,
    url: `${SITE_URL}/products/${product.handle}`,
  }
}

// ── Helper: organizationJsonLd ─────────────────────────────────────────────

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    description:
      'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic, corrosion-proof, and designed to last a lifetime.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: CONTACT_EMAIL,
      contactType: 'customer service',
    },
    sameAs: Object.values(SOCIAL_LINKS),
  }
}

// ── Helper: breadcrumbJsonLd ───────────────────────────────────────────────

export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  }
}

// ── Helper: webSiteJsonLd ──────────────────────────────────────────────────

export function webSiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface JsonLdProps {
  type: 'Product' | 'Organization' | 'WebSite' | 'BreadcrumbList'
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  // Data is server-generated structured data (Shopify catalog fields), never
  // end-user input. Still escaping "<" as defense-in-depth: a catalog field
  // containing "</script>" would otherwise break out of this tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

export default JsonLd
