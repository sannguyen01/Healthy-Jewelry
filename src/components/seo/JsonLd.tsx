// Healthy Jewelry — JSON-LD structured data components
// dangerouslySetInnerHTML is safe here: data is server-generated structured data, never user input.

import type { HJProduct } from '@/lib/shopify/types'
import { SITE_NAME, SITE_URL } from '@/config/site'

// ── Material handle → full name map ───────────────────────────────────────

const MATERIAL_NAMES: Record<string, string> = {
  titanium: 'Grade 23 Titanium',
  niobium: 'Niobium',
  'surgical-steel': '316L Surgical Steel',
}

// ── Helper: productJsonLd ──────────────────────────────────────────────────

export function productJsonLd(product: HJProduct): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    material: MATERIAL_NAMES[product.material] ?? product.material,
    offers: {
      '@type': 'Offer',
      price: product.price,
      // Structured data is what Google prints beside the listing and what
      // Merchant Center validates against the landing page. A hardcoded USD
      // over a store that charges VND advertises the wrong price publicly and
      // gets the feed disapproved for price mismatch.
      priceCurrency: product.currencyCode,
      // Advertising InStock for a sold-out product is the other half of the
      // same problem: Merchant Center checks availability against the page.
      availability: product.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/products/${product.handle}`,
    },
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
      email: 'hello@healthyjewelry.com',
      contactType: 'customer service',
    },
    sameAs: [
      'https://instagram.com/healthyjewelry',
      'https://tiktok.com/@healthyjewelry',
      'https://pinterest.com/healthyjewelry',
    ],
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
  type: 'Product' | 'Organization' | 'WebSite'
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  // Safe: data is server-generated structured data only, never user-supplied HTML.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export default JsonLd
