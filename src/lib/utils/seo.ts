import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from '@/config/site'
import type { HJProduct, HJCollection } from '@/lib/shopify/types'

// ── Product metadata ───────────────────────────────────────────────────────

export function generateProductMetadata(product: HJProduct): Metadata {
  const title = `${product.title} — ${SITE_NAME}`
  const description = product.description.slice(0, 155)
  const ogImageUrl = `${SITE_URL}/og-default.jpg`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/products/${product.handle}`,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: product.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

// ── Collection metadata ────────────────────────────────────────────────────

export function generateCollectionMetadata(collection: HJCollection): Metadata {
  const title = `${collection.title} — ${SITE_NAME}`
  const description = collection.description.slice(0, 155)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/shop/${collection.handle}`,
      siteName: SITE_NAME,
      images: [
        {
          url: `${SITE_URL}/og-default.jpg`,
          width: 1200,
          height: 630,
          alt: `${collection.title} — ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

// ── Generic page metadata ──────────────────────────────────────────────────

export function generatePageMetadata(
  title: string,
  description: string = SITE_DESCRIPTION
): Metadata {
  const fullTitle = `${title} — ${SITE_NAME}`

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      type: 'website',
      siteName: SITE_NAME,
      images: [
        {
          url: `${SITE_URL}/og-default.jpg`,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  }
}
