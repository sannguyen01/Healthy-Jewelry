import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from '@/components/product/ProductCard'
import { makeProduct } from '@/tests/support/catalogFixtures'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const baseProduct = makeProduct()

describe('ProductCard', () => {
  describe('link', () => {
    it('wraps the card in a link to the product page', () => {
      render(<ProductCard product={baseProduct} />)
      const link = screen.getByRole('link')
      expect(link.getAttribute('href')).toBe('/products/arc-band-titanium')
    })
  })

  describe('content', () => {
    it('renders the product title', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.getByText('Arc Band')).toBeTruthy()
    })

    it('renders the material tag in uppercase', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.getByText('TITANIUM')).toBeTruthy()
    })

    it('renders product spec text on hover overlay', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.getByText('2 mm · 1.8 g')).toBeTruthy()
    })
  })

  /**
   * **The browse-only contract, asserted as an absence.**
   *
   * These replace `renders the formatted price`, `does not render compareAtPrice when
   * null` and `renders compareAtPrice with strikethrough when present`. All three passed
   * for the whole window in which the site had no Add to Bag button — a card quoting a
   * number nobody could pay.
   *
   * An absence has to be asserted deliberately, because nothing fails when a component
   * quietly stops rendering something. So this looks for any currency-shaped text at all
   * rather than for the specific string a price used to be: a card that starts rendering
   * `₫1,450,000` fails here just as one rendering `$89.00` would.
   */
  describe('no price', () => {
    it('renders no currency symbol anywhere on the card', () => {
      const { container } = render(<ProductCard product={baseProduct} />)
      expect(container.textContent ?? '').not.toMatch(/[$€£¥₫]/)
    })

    it('renders no bare decimal amount either', () => {
      // `89.00` without a symbol is still a price. The spec line is the one legitimate
      // numeric string on a card, and it carries units (`2 mm · 1.8 g`).
      const { container } = render(<ProductCard product={baseProduct} />)
      expect(container.textContent ?? '').not.toMatch(/\d+\.\d{2}(?!\s*(mm|g|"))/)
    })
  })

  describe('badge', () => {
    it('does not render badge when badge is null', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.queryByText('Bestseller')).toBeNull()
      expect(screen.queryByText('New')).toBeNull()
    })

    it('renders Bestseller badge', () => {
      render(<ProductCard product={makeProduct({ badge: 'bestseller' })} />)
      expect(screen.getByText('Bestseller')).toBeTruthy()
    })

    it('renders New badge', () => {
      render(<ProductCard product={makeProduct({ badge: 'new' })} />)
      expect(screen.getByText('New')).toBeTruthy()
    })

    /**
     * `Sale` was the third badge and it is gone, because it was *derived* — "neither tag
     * present but an active compare-at price". With no prices there is no compare-at
     * price to be below, so a Sale badge could not mean anything. The vocabulary is now
     * `bestseller | new | null` in `schema.ts`, and a record carrying `'Sale'` fails
     * validation rather than rendering a claim the catalogue cannot support.
     */
    it('has no Sale state left to render', () => {
      render(<ProductCard product={makeProduct({ badge: 'bestseller' })} />)
      expect(screen.queryByText('Sale')).toBeNull()
    })
  })

  /**
   * `Sold Out` came from `every variant unavailable`, read per variant from Shopify.
   * Nothing can check stock now, so the badge would be an invented fact rather than a
   * stale one — a strictly worse failure. `availability` on the record is what the site
   * may honestly say, and the card does not render it.
   */
  describe('no sold-out claim', () => {
    it('never renders Sold Out, because nothing can check stock', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.queryByText('Sold Out')).toBeNull()
    })

    it('does not render the availability state as a badge either', () => {
      render(<ProductCard product={makeProduct({ availability: 'discontinued' })} />)
      expect(screen.queryByText(/discontinued/i)).toBeNull()
    })
  })

  describe('material variants', () => {
    it('shows NIOBIUM for niobium material', () => {
      render(<ProductCard product={makeProduct({ material: 'niobium' })} />)
      expect(screen.getByText('NIOBIUM')).toBeTruthy()
    })

    it('shows SURGICAL STEEL for surgical-steel (hyphen replaced)', () => {
      render(<ProductCard product={makeProduct({ material: 'surgical-steel' })} />)
      expect(screen.getByText('SURGICAL STEEL')).toBeTruthy()
    })
  })

  describe('className prop', () => {
    it('appends custom className to the article', () => {
      const { container } = render(
        <ProductCard product={baseProduct} className="my-custom-class" />
      )
      expect(container.querySelector('.my-custom-class')).toBeTruthy()
    })
  })
})
