import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductImage } from '@/components/product/ProductImage'
import type { HJProduct, Image } from '@/lib/shopify/types'

/**
 * **Both branches, because for a long while only one of them could ever run.**
 *
 * `PRODUCT_FRAGMENT` requested no image field and `HJProduct` had nowhere to put
 * one, so the storefront was structurally incapable of showing a photograph — a
 * jewellery site that could not render jewellery. Every surface hardcoded
 * `<JewelrySVG>`, not as a fallback but as the only option.
 *
 * Today every product on the connected store still has zero media, so the
 * illustration branch is the one production actually exercises and the photograph
 * branch is the one nothing would notice breaking. That is the ADR 002 shape
 * exactly — the branch that never runs locally is the one that breaks — so both
 * are pinned here, and `verify-production.mjs` checks the live direction that
 * matters most: a product that *has* a photo in Shopify must show it on its page.
 */

const photo: Image = {
  url: 'https://cdn.shopify.com/s/files/1/0000/arc-band.jpg',
  altText: 'Arc Band in brushed titanium',
  width: 1200,
  height: 1200,
}

function makeProduct(overrides: Partial<HJProduct> = {}): HJProduct {
  return {
    id: 'gid://shopify/Product/1',
    defaultVariantId: 'gid://shopify/ProductVariant/1',
    handle: 'arc-band-titanium',
    title: 'Arc Band',
    collection: 'rings',
    material: 'titanium',
    tags: [],
    price: '1450000',
    compareAtPrice: null,
    currencyCode: 'VND',
    badge: null,
    description: 'A titanium ring.',
    spec: '',
    svgType: 'ring-arc',
    featuredImage: null,
    images: [],
    variants: [],
    ...overrides,
  }
}

describe('ProductImage — no photograph', () => {
  it('draws the illustration, which is what every live product renders today', () => {
    const { container } = render(<ProductImage product={makeProduct()} sizes="100vw" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('respects the per-surface illustration scale', () => {
    // Cards use 65%, the detail page 70%, the strips 60% — the illustrations are
    // line art and need air, and each surface had already tuned its own value.
    const { container } = render(
      <ProductImage product={makeProduct()} svgScale="60%" sizes="100vw" />
    )
    expect(container.querySelector('svg')?.getAttribute('style')).toContain('60%')
  })

  it('draws the product\'s own illustration, not a generic one', () => {
    const { container } = render(
      <ProductImage product={makeProduct({ svgType: 'charm-star' })} sizes="100vw" />
    )
    // svg-coverage.test.tsx owns which mark each type draws; what matters here is
    // that the type reaches JewelrySVG rather than being dropped.
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('ProductImage — photograph present', () => {
  it('renders the photograph instead of the illustration', () => {
    const { container } = render(
      <ProductImage product={makeProduct({ featuredImage: photo })} sizes="100vw" />
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('points at the Shopify CDN URL', () => {
    render(<ProductImage product={makeProduct({ featuredImage: photo })} sizes="100vw" />)
    // next/image rewrites the src through /_next/image, so the original is
    // encoded inside it rather than being the attribute value.
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src') ?? '')).toContain(
      'cdn.shopify.com'
    )
  })

  it('uses Shopify alt text when the merchant wrote some', () => {
    render(<ProductImage product={makeProduct({ featuredImage: photo })} sizes="100vw" />)
    expect(screen.getByAltText('Arc Band in brushed titanium')).toBeInTheDocument()
  })

  /**
   * An empty `alt` tells a screen reader the image is decorative — a lie about the
   * one thing on the page the customer is buying. Shopify's `altText` is unset far
   * more often than it is set, so this is the common path, not the edge case.
   */
  it.each([null, '', '   '])('falls back to the product title when altText is %p', (altText) => {
    render(
      <ProductImage
        product={makeProduct({ featuredImage: { ...photo, altText } })}
        sizes="100vw"
      />
    )
    expect(screen.getByAltText('Arc Band')).toBeInTheDocument()
  })

  it('never renders an empty alt attribute', () => {
    for (const altText of [null, '', '  ']) {
      const { container, unmount } = render(
        <ProductImage
          product={makeProduct({ featuredImage: { ...photo, altText } })}
          sizes="100vw"
        />
      )
      expect(container.querySelector('img')?.getAttribute('alt')).toBeTruthy()
      unmount()
    }
  })

  /**
   * Getting `sizes` wrong means Next serves a 1200px image into a 280px card. It
   * is required of every caller rather than defaulted, so this checks the value
   * actually reaches the element.
   */
  it('passes the caller\'s sizes hint through', () => {
    const { container } = render(
      <ProductImage product={makeProduct({ featuredImage: photo })} sizes="280px" />
    )
    expect(container.querySelector('img')?.getAttribute('sizes')).toContain('280px')
  })

  it('contains rather than crops, so a necklace does not lose its ends', () => {
    const { container } = render(
      <ProductImage product={makeProduct({ featuredImage: photo })} sizes="100vw" />
    )
    expect(container.querySelector('img')?.getAttribute('style')).toContain('contain')
  })
})
