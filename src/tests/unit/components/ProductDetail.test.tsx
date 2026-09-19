import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductDetail } from '@/components/product/ProductDetail'
import type { HJProduct } from '@/lib/catalog/types'

const money = (amount: string) => ({ amount, currencyCode: 'USD' })

const ringProduct: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-size-5',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium', 'bestseller'],
  price: '89.00',
  compareAtPrice: null,
  currencyCode: 'USD',
  badge: 'Bestseller',
  description: 'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
  spec: '2 mm · 1.8 g',
  svgType: 'ring-arc',
  featuredImage: null,
  images: [],
  variants: ['5', '6', '7', '8', '9', '10', '11', '12'].map((size) => ({
    id: `gid://shopify/ProductVariant/hj-001-size-${size}`,
    title: size,
    price: money('89.00'),
    compareAtPrice: null,
    currencyCode: 'USD',
    availableForSale: true,
    selectedOptions: [{ name: 'Size', value: size }],
  })),
}

const earringProduct: HJProduct = {
  id: 'hj-009',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-009-default',
  handle: 'disc-studs-titanium',
  title: 'Disc Studs',
  collection: 'earrings',
  material: 'titanium',
  tags: ['earrings', 'titanium'],
  price: '68.00',
  compareAtPrice: null,
  currencyCode: 'USD',
  badge: null,
  description: 'Flat disc studs on implant-grade titanium posts.',
  spec: 'Disc 8 mm · post 6 mm',
  svgType: 'earring-stud',
  featuredImage: null,
  images: [],
  variants: [
    {
      id: 'gid://shopify/ProductVariant/hj-009-default',
      title: 'Default',
      price: money('68.00'),
      compareAtPrice: null,
      availableForSale: true,
      selectedOptions: [],
    },
  ],
}

const braceletProduct: HJProduct = {
  id: 'hj-013',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-013-size-XS',
  handle: 'cable-cuff-titanium',
  title: 'Cable Cuff',
  collection: 'bracelets',
  material: 'titanium',
  tags: ['bracelets'],
  price: '168.00',
  compareAtPrice: null,
  currencyCode: 'USD',
  badge: null,
  description: 'Twisted titanium cable cuff.',
  spec: '2.5 mm cable · 160 mm',
  svgType: 'bracelet-cuff',
  featuredImage: null,
  images: [],
  variants: ['XS (155mm)', 'S (165mm)', 'M (175mm)', 'L (185mm)', 'XL (195mm)'].map((size) => ({
    id: `gid://shopify/ProductVariant/hj-013-size-${size.slice(0, size.indexOf(' '))}`,
    title: size,
    price: money('168.00'),
    compareAtPrice: null,
    currencyCode: 'USD',
    availableForSale: true,
    selectedOptions: [{ name: 'Size', value: size }],
  })),
}

/**
 * No cart-store reset here any more.
 *
 * This file used to reset `useCartStore` before every test because a third of them
 * clicked Add to Bag and asserted on what landed in the bag. That control has been
 * removed, so none of them do — and a `beforeEach` maintaining state nothing reads is
 * how a fixture outlives the thing it was for.
 *
 * What survives is what the page still shows: title, price, description, spec, material
 * name, badge, compare-at price, the size picker, the Sold Out badge and the trust
 * signals. The sold-out *button* assertions went with the button; the sold-out *badge*
 * assertion stayed, because the badge is still rendered.
 */

describe('ProductDetail', () => {
  describe('product info', () => {
    it('renders product title as h1', () => {
      render(<ProductDetail product={ringProduct} />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toBe('Arc Band')
    })

    it('renders formatted price', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('$89.00')).toBeTruthy()
    })

    it('renders product description', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText(/mirror-polished arc profile/i)).toBeTruthy()
    })

    it('renders product spec', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('2 mm · 1.8 g')).toBeTruthy()
    })

    it('renders full material name for titanium', () => {
      render(<ProductDetail product={ringProduct} />)
      expect(screen.getByText('Grade 23 Titanium')).toBeTruthy()
    })

    it('renders full material name for niobium', () => {
      render(<ProductDetail product={{ ...ringProduct, material: 'niobium' }} />)
      expect(screen.getByText('Niobium')).toBeTruthy()
    })

    it('renders full material name for surgical-steel', () => {
      render(<ProductDetail product={{ ...ringProduct, material: 'surgical-steel' }} />)
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

  describe('compare at price', () => {
    it('renders compareAtPrice when present', () => {
      render(
        <ProductDetail product={{ ...ringProduct, compareAtPrice: '130.00', badge: 'Sale' }} />
      )
      expect(screen.getByText('$130.00')).toBeTruthy()
    })

    it('does not render compareAtPrice when null', () => {
      render(<ProductDetail product={ringProduct} />)
      const prices = screen.getAllByText(/\$89\.00/)
      expect(prices.length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('$130.00')).toBeNull()
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
      const necklaceProduct = { ...earringProduct, collection: 'necklaces' as const }
      render(<ProductDetail product={necklaceProduct} />)
      expect(screen.queryByText('US Ring Size')).toBeNull()
    })
  })

  describe('sold out', () => {
    it('shows the Sold Out badge instead of the promotional badge when every variant is unavailable', () => {
      const soldOutRing = {
        ...ringProduct,
        variants: ringProduct.variants.map((v) => ({ ...v, availableForSale: false })),
      }
      render(<ProductDetail product={soldOutRing} />)
      expect(screen.getByText('Sold Out')).toBeTruthy()
      expect(screen.queryByText('Bestseller')).toBeNull()
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
