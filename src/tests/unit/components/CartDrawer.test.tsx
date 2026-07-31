import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'
import { makeCartItem, makeProduct, makeSizedProduct } from '@/test/factories'

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
  currencyCode: 'USD',
  availableForSale: true,
  options: [],
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
  currencyCode: 'USD',
  availableForSale: true,
  options: [],
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
        makeCartItem({ product: mockProduct, quantity: 2 }),
        makeCartItem({ product: mockProduct2, quantity: 1 }),
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

// ── Variant-level cart lines ───────────────────────────────────────────────
//
// The drawer previously keyed rows by product id, so two sizes of one ring
// collapsed into a single row and the size was never shown at all — the
// customer had no way to check what they were about to buy.

describe('CartDrawer — variant lines', () => {
  const sized = makeSizedProduct(['7', '9'], { id: 'p-ring', title: 'Arc Band' })
  const seven = sized.variants[0]
  const nine = sized.variants[1]

  beforeEach(() => {
    useCartStore.setState({
      items: [
        makeCartItem({
          product: sized,
          variantId: seven.id,
          variantTitle: '7',
          selectedOptions: [{ name: 'Size', value: '7' }],
          quantity: 1,
        }),
        makeCartItem({
          product: sized,
          variantId: nine.id,
          variantTitle: '9',
          selectedOptions: [{ name: 'Size', value: '9' }],
          quantity: 2,
        }),
      ],
      isOpen: true,
      shopifyCartId: null,
      checkoutUrl: null,
      isLoading: false,
      error: null,
      totals: null,
      adjustments: [],
    })
  })

  it('renders two sizes of the same product as two separate rows', () => {
    render(<CartDrawer />)
    expect(screen.getAllByTestId('cart-line')).toHaveLength(2)
  })

  it('shows which size each row is for', () => {
    render(<CartDrawer />)
    const variants = screen.getAllByTestId('cart-line-variant').map((n) => n.textContent)
    expect(variants).toEqual(['Size 7', 'Size 9'])
  })

  it('gives each row an unambiguous remove control', () => {
    render(<CartDrawer />)
    expect(screen.getByRole('button', { name: 'Remove Arc Band, Size 7' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Arc Band, Size 9' })).toBeTruthy()
  })

  it('removes only the targeted size', () => {
    render(<CartDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Arc Band, Size 7' }))
    const items = useCartStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].variantId).toBe(nine.id)
  })

  it('changes the quantity of only the targeted size', () => {
    render(<CartDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /increase quantity of arc band, size 9/i }))
    const items = useCartStore.getState().items
    expect(items.find((i) => i.variantId === seven.id)?.quantity).toBe(1)
    expect(items.find((i) => i.variantId === nine.id)?.quantity).toBe(3)
  })
})

describe('CartDrawer — pricing', () => {
  it('renders the subtotal in the product currency, not a hardcoded dollar sign', () => {
    const vnd = makeProduct({ currencyCode: 'VND', price: '2450000' })
    useCartStore.setState({
      items: [makeCartItem({ product: vnd, unitPrice: '2450000', quantity: 1 })],
      isOpen: true,
      totals: null,
      error: null,
      adjustments: [],
    })
    render(<CartDrawer />)
    const subtotal = screen.getByTestId('cart-subtotal').textContent ?? ''
    expect(subtotal).not.toContain('$')
    expect(subtotal).toMatch(/2[.,\s]?450[.,\s]?000/)
  })

  it('prefers Shopify totals over the locally computed subtotal', () => {
    const product = makeProduct({ price: '89.00' })
    useCartStore.setState({
      items: [makeCartItem({ product, unitPrice: '89.00', quantity: 1 })],
      isOpen: true,
      error: null,
      adjustments: [],
      totals: {
        subtotal: { amount: '80.10', currencyCode: 'USD' },
        total: { amount: '80.10', currencyCode: 'USD' },
        tax: null,
        duty: null,
      },
    })
    render(<CartDrawer />)
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$80.10')
  })
})

describe('CartDrawer — checkout hand-off', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [makeCartItem({ product: makeProduct(), quantity: 1 })],
      isOpen: true,
      error: null,
      adjustments: [],
      totals: null,
    })
  })

  // The old handler fell through to `window.location.href = '/checkout'`, where
  // the same sync failed again and stranded the customer on a spinner.
  it('shows an error in place when checkout cannot be prepared', async () => {
    useCartStore.setState({ prepareCheckout: vi.fn().mockResolvedValue(null) })
    render(<CartDrawer />)
    fireEvent.click(screen.getByTestId('checkout-button'))
    await waitFor(() => expect(screen.getByTestId('cart-error')).toBeTruthy())
  })

  it('asks the store for a freshly validated checkout URL', async () => {
    const prepareCheckout = vi.fn().mockResolvedValue(null)
    useCartStore.setState({ prepareCheckout })
    render(<CartDrawer />)
    fireEvent.click(screen.getByTestId('checkout-button'))
    await waitFor(() => expect(prepareCheckout).toHaveBeenCalled())
  })
})
