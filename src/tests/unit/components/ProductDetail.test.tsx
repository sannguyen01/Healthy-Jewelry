import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductDetail } from '@/components/product/ProductDetail'
import { makeProduct } from '@/tests/support/catalogFixtures'

const ringProduct = makeProduct({ badge: 'bestseller' })

const earringProduct = makeProduct({
  handle: 'disc-studs-titanium',
  title: 'Disc Studs',
  collection: 'earrings',
  description: 'Flat disc studs on implant-grade titanium posts.',
  specification: 'Disc 8 mm · post 6 mm',
  sizes: [],
  media: { kind: 'illustration', svgType: 'earring-stud' },
})

const braceletProduct = makeProduct({
  handle: 'cable-cuff-titanium',
  title: 'Cable Cuff',
  collection: 'bracelets',
  description: 'Twisted titanium cable cuff.',
  specification: '2.5 mm cable · 160 mm',
  sizes: ['XS (155mm)', 'S (165mm)', 'M (175mm)', 'L (185mm)', 'XL (195mm)'],
  media: { kind: 'illustration', svgType: 'bracelet-cuff' },
})

/**
 * No cart-store reset here any more, and no product literals either.
 *
 * This file used to reset `useCartStore` before every test because a third of them
 * clicked Add to Bag and asserted on what landed in the bag. That control has been
 * removed, so none of them do — and a `beforeEach` maintaining state nothing reads is
 * how a fixture outlives the thing it was for.
 *
 * The three products were then twenty-line `HJProduct` literals carrying `price`,
 * `compareAtPrice`, `currencyCode`, `defaultVariantId` and a `variants` array with
 * `availableForSale` on each entry — five commerce fields feeding assertions about a
 * page that sells nothing. They are now three overrides on the shared catalogue fixture,
 * so what each test varies is the line it varies.
 *
 * What survives is what the page still shows: title, description, spec, material label,
 * badge, the size picker and the trust signals. The price block and the Sold Out badge
 * went with the data that produced them, and their absence is asserted below rather than
 * left implicit.
 */

describe('ProductDetail', () => {
  describe('product info', () => {
    it('renders product title as h1', () => {
      render(<ProductDetail product={ringProduct} />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toBe('Arc Band')
    })

    it('renders product description', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText(/mirror-polished arc profile/i)).toBeTruthy()
    })

    it('renders product spec', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('2 mm · 1.8 g')).toBeTruthy()
    })

    /**
     * The material line reads `materialLabel` off the record now, not a lookup table
     * keyed on `material`. These three cases used to prove the table had three rows;
     * they now prove the published label reaches the page unaltered, which is the claim
     * that actually matters — `schema.ts` keeps handle and label as separate fields
     * precisely so a metallurgy claim lives in content rather than in a component.
     */
    it('renders the published material label for titanium', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('Grade 23 Titanium')).toBeTruthy()
    })

    it('renders the published material label for niobium', () => {
      render(
        <ProductDetail
          product={makeProduct({ material: 'niobium', materialLabel: 'Niobium' })}
        />
      )
      expect(screen.getByText('Niobium')).toBeTruthy()
    })

    it('renders the published material label for surgical steel', () => {
      render(
        <ProductDetail
          product={makeProduct({
            material: 'surgical-steel',
            materialLabel: '316L Surgical Steel',
          })}
        />
      )
      expect(screen.getByText('316L Surgical Steel')).toBeTruthy()
    })

    it('renders separator element', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(document.querySelector('[role="separator"]')).toBeTruthy()
    })
  })

  describe('badge', () => {
    it('renders badge when product has one', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('Bestseller')).toBeTruthy()
    })

    it('does not render badge when null', () => {
      render(<ProductDetail product={earringProduct} />)
      expect(screen.queryByText('Bestseller')).toBeNull()
    })
  })

  /**
   * **What a page that sells nothing must not say.**
   *
   * These replace `renders formatted price`, `renders compareAtPrice when present` and
   * `does not render compareAtPrice when null`. All three described a page with an Add
   * to Bag button; PR #75 removed the button and left the number, so for a window the
   * detail page quoted a price against no way to pay it.
   *
   * Asserted as an absence over the whole rendered subtree, because a price that comes
   * back somewhere new — a tooltip, a meta line, a badge — is the same defect in a
   * different element, and an assertion naming one element would miss it.
   */
  describe('no price and nothing purchasable', () => {
    it('renders no currency symbol anywhere', () => {
      const { container } = render(<ProductDetail product={ringProduct} />)
      expect(container.textContent ?? '').not.toMatch(/[$€£¥₫]/)
    })

    it('renders no Add to Bag control', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.queryByRole('button', { name: /add to bag|add to cart|buy/i })).toBeNull()
    })

    it('renders no Sold Out claim, because nothing can check stock', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.queryByText('Sold Out')).toBeNull()
    })

    it('does not surface the availability state as customer-facing copy', () => {
      // `availability` is the honest field and it is not rendered here yet. When it is,
      // this assertion is the one to change — deliberately, in the same diff.
      render(<ProductDetail product={makeProduct({ availability: 'discontinued' })} />)
      expect(screen.queryByText(/discontinued|ask-an-ambassador|made-to-order/i)).toBeNull()
    })
  })

  describe('size picker', () => {
    it('shows size picker for rings', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('US Ring Size')).toBeTruthy()
    })

    it('shows size picker for bracelets', () => {
      render(<ProductDetail product={braceletProduct} />)
      expect(screen.getByText('Bracelet Size')).toBeTruthy()
    })

    it('does not show size picker for earrings', () => {
      render(<ProductDetail product={earringProduct} />)
      expect(screen.queryByText('US Ring Size')).toBeNull()
      expect(screen.queryByText('Bracelet Size')).toBeNull()
    })

    it('does not show size picker for necklaces', () => {
      render(<ProductDetail product={makeProduct({ collection: 'necklaces', sizes: [] })} />)
      expect(screen.queryByText('US Ring Size')).toBeNull()
    })
  })

  /**
   * An empty `specification` used to render a blank uppercase line with its own margins,
   * so the layout showed a gap where a measurement should be. The catalogue schema
   * declares `.min(1)`, so an empty spec cannot be stored — but the guard stays in the
   * component and so does this test, because the two protect against different things:
   * the schema stops the empty string being authored, and the guard stops whitespace
   * that passes `.min(1)` from rendering a gap.
   */
  describe('specification guard', () => {
    it('renders nothing for a whitespace-only specification', () => {
      render(<ProductDetail product={makeProduct({ specification: '   ' })} />)
      expect(screen.queryByText('2 mm · 1.8 g')).toBeNull()
    })
  })

  describe('trust signals', () => {
    it('shows IMPLANT GRADE trust signal', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('·IMPLANT GRADE·')).toBeTruthy()
    })

    it('shows HYPOALLERGENIC trust signal', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('·HYPOALLERGENIC·')).toBeTruthy()
    })

    it('shows MRI SAFE trust signal', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('·MRI SAFE·')).toBeTruthy()
    })
  })
})
