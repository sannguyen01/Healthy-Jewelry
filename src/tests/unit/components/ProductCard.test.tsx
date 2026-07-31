import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from '@/components/product/ProductCard'
import type { HJProduct } from '@/lib/shopify/types'

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

const baseProduct: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium', 'bestseller'],
  price: '89.00',
  compareAtPrice: null,
  badge: null,
  description: 'Grade 23 titanium. Mirror-polished arc profile.',
  spec: '2 mm · 1.8 g',
  currencyCode: 'USD',
  availableForSale: true,
  options: [],
  svgType: 'ring-arc',
  variants: [],
}

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

    it('renders the formatted price', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.getByText('$89.00')).toBeTruthy()
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

  describe('badge', () => {
    it('does not render badge when badge is null', () => {
      render(<ProductCard product={baseProduct} />)
      expect(screen.queryByText('Bestseller')).toBeNull()
      expect(screen.queryByText('New')).toBeNull()
      expect(screen.queryByText('Sale')).toBeNull()
    })

    it('renders Bestseller badge', () => {
      render(<ProductCard product={{ ...baseProduct, badge: 'Bestseller' }} />)
      expect(screen.getByText('Bestseller')).toBeTruthy()
    })

    it('renders New badge', () => {
      render(<ProductCard product={{ ...baseProduct, badge: 'New' }} />)
      expect(screen.getByText('New')).toBeTruthy()
    })

    it('renders Sale badge', () => {
      render(<ProductCard product={{ ...baseProduct, badge: 'Sale' }} />)
      expect(screen.getByText('Sale')).toBeTruthy()
    })
  })

  describe('compare at price', () => {
    it('does not render compareAtPrice when null', () => {
      render(<ProductCard product={baseProduct} />)
      const prices = screen.getAllByText(/\$/)
      expect(prices).toHaveLength(1)
    })

    it('renders compareAtPrice with strikethrough when present', () => {
      render(<ProductCard product={{ ...baseProduct, compareAtPrice: '130.00', badge: 'Sale' }} />)
      expect(screen.getByText('$130.00')).toBeTruthy()
      expect(screen.getByText('$89.00')).toBeTruthy()
    })
  })

  describe('material variants', () => {
    it('shows NIOBIUM for niobium material', () => {
      render(<ProductCard product={{ ...baseProduct, material: 'niobium' }} />)
      expect(screen.getByText('NIOBIUM')).toBeTruthy()
    })

    it('shows SURGICAL STEEL for surgical-steel (hyphen replaced)', () => {
      render(<ProductCard product={{ ...baseProduct, material: 'surgical-steel' }} />)
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
