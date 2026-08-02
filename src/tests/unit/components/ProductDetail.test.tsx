import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductDetail } from '@/components/product/ProductDetail'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

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

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
  })
})

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

  describe('add to bag — unsized product (earrings)', () => {
    it('renders "Add to Bag" button, enabled, with no size selection', () => {
      render(<ProductDetail product={earringProduct} />)
      const button = screen.getByRole('button', { name: /add disc studs to bag/i })
      expect(button).toBeTruthy()
      expect(button).not.toBeDisabled()
    })

    it('clicking Add to Bag adds the default variant to the cart', () => {
      render(<ProductDetail product={earringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /add disc studs to bag/i }))
      const items = useCartStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].product.id).toBe('hj-009')
      expect(items[0].variantId).toBe('gid://shopify/ProductVariant/hj-009-default')
    })

    it('clicking Add to Bag opens the cart drawer', () => {
      render(<ProductDetail product={earringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /add disc studs to bag/i }))
      expect(useCartStore.getState().isOpen).toBe(true)
    })
  })

  describe('add to bag — sized product (rings)', () => {
    it('shows "Select a Size" and disables the button before a size is chosen', () => {
      render(<ProductDetail product={ringProduct} />)
      const button = screen.getByRole('button', { name: /select a size/i })
      expect(button).toBeDisabled()
    })

    it('clicking the disabled button does not add anything to the cart', () => {
      render(<ProductDetail product={ringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /select a size/i }))
      expect(useCartStore.getState().items).toHaveLength(0)
    })

    it('enables "Add to Bag" once a size is selected', () => {
      render(<ProductDetail product={ringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /ring size 9/i }))
      const button = screen.getByRole('button', { name: /add arc band to bag/i })
      expect(button).not.toBeDisabled()
    })

    it('adds the variant matching the selected size, not the first variant', () => {
      render(<ProductDetail product={ringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /ring size 9/i }))
      fireEvent.click(screen.getByRole('button', { name: /add arc band to bag/i }))

      const items = useCartStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].variantId).toBe('gid://shopify/ProductVariant/hj-001-size-9')
      // Guards against the regression this test exists to prevent: silently
      // defaulting to the first variant (size 5) regardless of selection.
      expect(items[0].variantId).not.toBe('gid://shopify/ProductVariant/hj-001-size-5')
    })

    it('picking a different size before adding resolves the newly selected variant', () => {
      render(<ProductDetail product={ringProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /ring size 7/i }))
      fireEvent.click(screen.getByRole('button', { name: /ring size 11/i }))
      fireEvent.click(screen.getByRole('button', { name: /add arc band to bag/i }))

      const items = useCartStore.getState().items
      expect(items[0].variantId).toBe('gid://shopify/ProductVariant/hj-001-size-11')
    })
  })

  describe('add to bag — sized product (bracelets)', () => {
    it('resolves the correct variant for the selected bracelet size', () => {
      render(<ProductDetail product={braceletProduct} />)
      fireEvent.click(screen.getByRole('button', { name: /bracelet size m/i }))
      fireEvent.click(screen.getByRole('button', { name: /add cable cuff to bag/i }))

      const items = useCartStore.getState().items
      expect(items[0].variantId).toBe('gid://shopify/ProductVariant/hj-013-size-M')
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
