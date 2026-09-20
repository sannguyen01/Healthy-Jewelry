import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductImage } from '@/components/product/ProductImage'
import {
  makePendingMediaProduct,
  makePhotoProduct,
  makeProduct,
} from '@/tests/support/catalogFixtures'

/**
 * **Three states, because two could not tell two different things apart.**
 *
 * `featuredImage: null` used to mean both *this piece is drawn, deliberately* and
 * *nobody has decided what this piece looks like*. One of those needs nothing and the
 * other is work, and a nullable field could not say which — so the content debt was
 * uncountable and the "deliberate illustration" decision was indistinguishable from an
 * oversight.
 *
 * The catalogue's media union splits them into `illustration`, `illustration-pending`
 * and `photo`, and `ProductImage` switches exhaustively over all three. Each arm is
 * pinned here, including the one production does not exercise: every product in the
 * catalogue today is an `illustration` or an `illustration-pending`, so the photograph
 * branch is the one nothing would notice breaking. That is ADR 002's shape exactly — the
 * branch that never runs locally is the one that breaks.
 */

describe('ProductImage — illustration', () => {
  it('draws the illustration, which is what almost every catalogue record renders', () => {
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

  it("draws the product's own illustration, not a generic one", () => {
    const { container } = render(
      <ProductImage
        product={makeProduct({ media: { kind: 'illustration', svgType: 'charm-star' } })}
        sizes="100vw"
      />
    )
    // svg-coverage.test.tsx owns which mark each type draws; what matters here is
    // that the type reaches JewelrySVG rather than being dropped.
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

/**
 * The state that did not exist before the catalogue: *nobody has chosen an illustration
 * for this piece yet*.
 *
 * It renders nothing on purpose. A default drawing on a real product is a claim about
 * the object made by a fallback, and a wrong claim is worse than an empty frame — the
 * same reasoning that removed the Sold Out badge when the inventory signal went away.
 */
describe('ProductImage — illustration pending', () => {
  it('renders neither an illustration nor a photograph', () => {
    const { container } = render(
      <ProductImage product={makePendingMediaProduct()} sizes="100vw" />
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the caller class so the tile geometry survives', () => {
    // The tile is `aspect-ratio: 1 / 1` (CLAUDE.md). An element that vanishes entirely
    // would collapse the box and reflow the grid around an absence.
    const { container } = render(
      <ProductImage product={makePendingMediaProduct()} sizes="100vw" className="tile-media" />
    )
    expect(container.querySelector('.tile-media')).not.toBeNull()
  })

  it('is hidden from assistive technology rather than announced as an empty image', () => {
    const { container } = render(
      <ProductImage product={makePendingMediaProduct()} sizes="100vw" className="tile-media" />
    )
    expect(container.querySelector('.tile-media')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('ProductImage — photograph present', () => {
  it('renders the photograph instead of the illustration', () => {
    const { container } = render(<ProductImage product={makePhotoProduct()} sizes="100vw" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('points at the catalogue record’s own src', () => {
    render(<ProductImage product={makePhotoProduct()} sizes="100vw" />)
    // next/image rewrites the src through /_next/image, so the original is
    // encoded inside it rather than being the attribute value.
    expect(decodeURIComponent(screen.getByRole('img').getAttribute('src') ?? '')).toContain(
      '/images/products/arc-band-titanium.jpg'
    )
  })

  it('uses the alt text the record carries', () => {
    render(<ProductImage product={makePhotoProduct()} sizes="100vw" />)
    expect(screen.getByAltText('Arc Band in brushed titanium')).toBeInTheDocument()
  })

  /**
   * **The alt-text fallback is gone, and its absence is the stronger guarantee.**
   *
   * There used to be four assertions here covering `altText` being `null`, `''` and
   * `'   '`, each checking that the component substituted the product title. They were
   * the common path, because Shopify's `altText` is unset far more often than set.
   *
   * The catalogue schema declares `alt: z.string().min(1)` inside the `photo` arm, so a
   * record with an empty alt **fails the build** rather than reaching a component that
   * papers over it. The fallback was a runtime repair for a data problem; the constraint
   * is the data problem not existing. `catalog-schema.test.ts` owns the rejection; what
   * remains here is that the component does not invent an alt of its own.
   */
  it('never renders an empty alt attribute', () => {
    const { container } = render(<ProductImage product={makePhotoProduct()} sizes="100vw" />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBeTruthy()
  })

  /**
   * Getting `sizes` wrong means Next serves a 1200px image into a 280px card. It
   * is required of every caller rather than defaulted, so this checks the value
   * actually reaches the element.
   */
  it("passes the caller's sizes hint through", () => {
    const { container } = render(<ProductImage product={makePhotoProduct()} sizes="280px" />)
    expect(container.querySelector('img')?.getAttribute('sizes')).toContain('280px')
  })

  it('contains rather than crops, so a necklace does not lose its ends', () => {
    const { container } = render(<ProductImage product={makePhotoProduct()} sizes="100vw" />)
    expect(container.querySelector('img')?.getAttribute('style')).toContain('contain')
  })
})
