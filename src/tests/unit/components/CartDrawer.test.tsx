import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}))

const mockProduct: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium'],
  price: '89.00',
  compareAtPrice: null,
  badge: null,
  description: 'Grade 23 titanium.',
  spec: '2 mm · 1.8 g',
  svgType: 'ring-arc',
  variants: [],
}

const mockProduct2: HJProduct = {
  id: 'hj-002',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-002-default',
  handle: 'dome-ring',
  title: 'Dome Ring',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings'],
  price: '112.00',
  compareAtPrice: null,
  badge: null,
  description: 'Dome profile.',
  spec: '4 mm · 2.4 g',
  svgType: 'ring-dome',
  variants: [],
}

function openDrawer() {
  useCartStore.setState({ isOpen: true })
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
  })
  document.body.style.overflow = ''
})

describe('CartDrawer — closed', () => {
  it('renders nothing when isOpen is false', () => {
    render(<CartDrawer />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('CartDrawer — open', () => {
  it('renders dialog when isOpen is true', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(screen.getByRole('dialog', { name: /shopping bag/i })).toBeTruthy()
  })

  it('shows "Your Bag" heading', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(screen.getByText('Your Bag')).toBeTruthy()
  })

  it('close button has correct aria-label', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(screen.getByRole('button', { name: /close bag/i })).toBeTruthy()
  })

  it('clicking close button calls closeCart', () => {
    openDrawer()
    render(<CartDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /close bag/i }))
    expect(useCartStore.getState().isOpen).toBe(false)
  })

  it('locks body scroll when open', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('clicking backdrop closes drawer', () => {
    openDrawer()
    render(<CartDrawer />)
    const backdrop = document.querySelector('[aria-hidden="true"]')!
    fireEvent.click(backdrop)
    expect(useCartStore.getState().isOpen).toBe(false)
  })

  it('pressing Escape closes drawer', () => {
    openDrawer()
    render(<CartDrawer />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useCartStore.getState().isOpen).toBe(false)
  })
})

describe('CartDrawer — empty state', () => {
  it('shows "Your bag is empty" when cart is empty', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(screen.getByText('Your bag is empty')).toBeTruthy()
  })

  it('shows "Shop Now" link to /shop', () => {
    openDrawer()
    render(<CartDrawer />)
    const link = screen.getByRole('link', { name: /shop now/i })
    expect(link.getAttribute('href')).toBe('/shop')
  })

  it('does not show checkout button when cart is empty', () => {
    openDrawer()
    render(<CartDrawer />)
    expect(screen.queryByRole('button', { name: /checkout/i })).toBeNull()
  })
})

describe('CartDrawer — with items', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [
        { product: mockProduct, quantity: 2, variantId: mockProduct.defaultVariantId },
        { product: mockProduct2, quantity: 1, variantId: mockProduct2.defaultVariantId },
      ],
      isOpen: true,
      shopifyCartId: null,
      checkoutUrl: null,
      isLoading: false,
    })
  })

  it('shows each product title', () => {
    render(<CartDrawer />)
    expect(screen.getByText('Arc Band')).toBeTruthy()
    expect(screen.getByText('Dome Ring')).toBeTruthy()
  })

  it('shows item count in heading', () => {
    render(<CartDrawer />)
    expect(screen.getByText('(3)')).toBeTruthy()
  })

  it('shows total price', () => {
    render(<CartDrawer />)
    // 89 * 2 + 112 * 1 = 290.00
    expect(screen.getByText('$290.00')).toBeTruthy()
  })

  it('shows quantity for each item', () => {
    render(<CartDrawer />)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows checkout button', () => {
    render(<CartDrawer />)
    expect(screen.getByRole('button', { name: /checkout/i })).toBeTruthy()
  })

  it('decrease quantity button has aria-label', () => {
    render(<CartDrawer />)
    const decreaseButtons = screen.getAllByRole('button', { name: /decrease quantity/i })
    expect(decreaseButtons.length).toBe(2)
  })

  it('increase quantity button has aria-label', () => {
    render(<CartDrawer />)
    const increaseButtons = screen.getAllByRole('button', { name: /increase quantity/i })
    expect(increaseButtons.length).toBe(2)
  })

  it('clicking increase quantity updates store', () => {
    render(<CartDrawer />)
    const increaseButtons = screen.getAllByRole('button', { name: /increase quantity/i })
    fireEvent.click(increaseButtons[0])
    expect(useCartStore.getState().items[0].quantity).toBe(3)
  })

  it('clicking decrease quantity updates store', () => {
    render(<CartDrawer />)
    const decreaseButtons = screen.getAllByRole('button', { name: /decrease quantity/i })
    fireEvent.click(decreaseButtons[0])
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('clicking remove button removes item from store', () => {
    render(<CartDrawer />)
    const removeButton = screen.getByRole('button', { name: /remove arc band/i })
    fireEvent.click(removeButton)
    const items = useCartStore.getState().items
    expect(items.find((i) => i.product.id === 'hj-001')).toBeUndefined()
  })

  it('shows "Preparing…" label and disabled button while loading', () => {
    useCartStore.setState((s) => ({ ...s, isLoading: true }))
    render(<CartDrawer />)
    const checkoutBtn = screen.getByRole('button', { name: /preparing/i })
    expect(checkoutBtn).toBeTruthy()
    expect((checkoutBtn as HTMLButtonElement).disabled).toBe(true)
  })
})
