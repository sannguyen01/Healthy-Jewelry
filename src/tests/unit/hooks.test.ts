import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrolled } from '@/lib/hooks/useScrolled'
import { useMedia, useIsMobile, useIsTablet } from '@/lib/hooks/useMedia'
import {
  useCartItem,
  useIsInCart,
  useCartItemQuantity,
  useProductQuantityInCart,
  useCartError,
  useCartTotals,
  useCartCurrency,
  useCartDiscountCodes,
  useCartAdjustments,
  useCheckoutUrl,
  useCartIsLoading,
} from '@/lib/hooks/useCart'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

// ── useScrolled ────────────────────────────────────────────────────────────

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', {
    value,
    writable: true,
    configurable: true,
  })
}

describe('useScrolled', () => {
  afterEach(() => {
    setScrollY(0)
  })

  it('returns false when scrollY is 0 (default threshold 60)', () => {
    setScrollY(0)
    const { result } = renderHook(() => useScrolled())
    expect(result.current).toBe(false)
  })

  it('returns true when scrollY exceeds the 60px default threshold', () => {
    setScrollY(61)
    const { result } = renderHook(() => useScrolled())
    expect(result.current).toBe(true)
  })

  it('returns false when scrollY exactly equals the threshold (strict >)', () => {
    setScrollY(60)
    const { result } = renderHook(() => useScrolled(60))
    expect(result.current).toBe(false)
  })

  it('respects a custom threshold', () => {
    setScrollY(25)
    const { result } = renderHook(() => useScrolled(20))
    expect(result.current).toBe(true)
  })

  it('transitions to true when a scroll event fires', () => {
    setScrollY(0)
    const { result } = renderHook(() => useScrolled(60))
    expect(result.current).toBe(false)

    act(() => {
      setScrollY(80)
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current).toBe(true)
  })

  it('transitions back to false when scroll returns below threshold', () => {
    setScrollY(80)
    const { result } = renderHook(() => useScrolled(60))
    expect(result.current).toBe(true)

    act(() => {
      setScrollY(20)
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current).toBe(false)
  })

  it('cleans up the scroll listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useScrolled(60))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
    removeSpy.mockRestore()
  })
})

// ── useMedia ───────────────────────────────────────────────────────────────

type MockMQ = {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
}

const createMockMQ = (matches: boolean): MockMQ => ({
  matches,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})

describe('useMedia', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    matchMediaMock = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  it('returns false initially when media query does not match', () => {
    matchMediaMock.mockReturnValue(createMockMQ(false))
    const { result } = renderHook(() => useMedia('(max-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when media query matches on mount', () => {
    matchMediaMock.mockReturnValue(createMockMQ(true))
    const { result } = renderHook(() => useMedia('(max-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('registers a change event listener', () => {
    const mq = createMockMQ(false)
    matchMediaMock.mockReturnValue(mq)
    renderHook(() => useMedia('(max-width: 768px)'))
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('removes the change listener on unmount', () => {
    const mq = createMockMQ(false)
    matchMediaMock.mockReturnValue(mq)
    const { unmount } = renderHook(() => useMedia('(max-width: 768px)'))
    unmount()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('passes the exact query string to matchMedia', () => {
    matchMediaMock.mockReturnValue(createMockMQ(false))
    renderHook(() => useMedia('(prefers-color-scheme: dark)'))
    expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })
})

describe('useIsMobile', () => {
  it('queries the 768px mobile breakpoint', () => {
    const mq = createMockMQ(true)
    const matchMedia = vi.fn().mockReturnValue(mq)
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia })
    renderHook(() => useIsMobile())
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 768px)')
  })
})

describe('useIsTablet', () => {
  it('queries the 769–1024px tablet breakpoint', () => {
    const mq = createMockMQ(false)
    const matchMedia = vi.fn().mockReturnValue(mq)
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia })
    renderHook(() => useIsTablet())
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 769px) and (max-width: 1024px)')
  })
})

// ── Cart selector hooks ────────────────────────────────────────────────────

const testProduct: HJProduct = {
  id: 'gid://shopify/Product/hj-test-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-test-001-default',
  handle: 'test-ring-titanium',
  title: 'Test Ring',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium'],
  price: '89.00',
  compareAtPrice: null,
  badge: null,
  description: 'Titanium ring used for unit testing.',
  spec: '2 mm · 1.8 g',
  currencyCode: 'USD',
  availableForSale: true,
  options: [],
  svgType: 'ring-arc',
  variants: [],
}

describe('useCartItem', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isOpen: false })
  })

  it('returns undefined when product is not in cart', () => {
    const { result } = renderHook(() => useCartItem(testProduct.defaultVariantId))
    expect(result.current).toBeUndefined()
  })

  it('returns the CartItem when product is in cart', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useCartItem(testProduct.defaultVariantId))
    expect(result.current).toBeDefined()
    expect(result.current?.product.id).toBe(testProduct.id)
  })

  it('returns undefined for a different product id', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useCartItem('other-id'))
    expect(result.current).toBeUndefined()
  })
})

describe('useIsInCart', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isOpen: false })
  })

  it('returns false when cart is empty', () => {
    const { result } = renderHook(() => useIsInCart(testProduct.defaultVariantId))
    expect(result.current).toBe(false)
  })

  it('returns true when product is in cart', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useIsInCart(testProduct.defaultVariantId))
    expect(result.current).toBe(true)
  })

  it('returns false for a product not added to cart', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useIsInCart('other-product-id'))
    expect(result.current).toBe(false)
  })
})

describe('useCartItemQuantity', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isOpen: false })
  })

  it('returns 0 when product is not in cart', () => {
    const { result } = renderHook(() => useCartItemQuantity(testProduct.defaultVariantId))
    expect(result.current).toBe(0)
  })

  it('returns 1 for default addItem call', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useCartItemQuantity(testProduct.defaultVariantId))
    expect(result.current).toBe(1)
  })

  it('returns the specified quantity', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct, 3)
    })
    const { result } = renderHook(() => useCartItemQuantity(testProduct.defaultVariantId))
    expect(result.current).toBe(3)
  })

  it('returns 0 for a different product id', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct)
    })
    const { result } = renderHook(() => useCartItemQuantity('other-id'))
    expect(result.current).toBe(0)
  })
})

// ── Cart state hooks added with the transaction-path rework ────────────────

describe('useProductQuantityInCart', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isOpen: false })
  })

  it('returns 0 when the product is not in the bag', () => {
    const { result } = renderHook(() => useProductQuantityInCart(testProduct.id))
    expect(result.current).toBe(0)
  })

  // A product card has no size context, so it reports the total across sizes.
  it('sums quantities across every variant of the product', () => {
    act(() => {
      useCartStore.getState().addItem(testProduct, 2, 'v-size-7')
      useCartStore.getState().addItem(testProduct, 3, 'v-size-9')
    })
    const { result } = renderHook(() => useProductQuantityInCart(testProduct.id))
    expect(result.current).toBe(5)
  })
})

describe('useCartError', () => {
  beforeEach(() => {
    useCartStore.setState({ error: null })
  })

  it('returns null when the cart is healthy', () => {
    const { result } = renderHook(() => useCartError())
    expect(result.current).toBeNull()
  })

  it('returns the surfaced error', () => {
    act(() => {
      useCartStore.setState({ error: { code: 'network', message: 'offline' } })
    })
    const { result } = renderHook(() => useCartError())
    expect(result.current?.code).toBe('network')
  })
})

describe('useCartTotals and useCartCurrency', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], totals: null })
  })

  it('returns null totals before the first sync', () => {
    const { result } = renderHook(() => useCartTotals())
    expect(result.current).toBeNull()
  })

  it('returns Shopify totals once synced', () => {
    act(() => {
      useCartStore.setState({
        totals: {
          subtotal: { amount: '2450000', currencyCode: 'VND' },
          total: { amount: '2450000', currencyCode: 'VND' },
          tax: null,
          duty: null,
        },
      })
    })
    expect(renderHook(() => useCartTotals()).result.current?.total.amount).toBe('2450000')
    expect(renderHook(() => useCartCurrency()).result.current).toBe('VND')
  })
})

describe('useCartDiscountCodes and useCartAdjustments', () => {
  beforeEach(() => {
    useCartStore.setState({ discountCodes: [], adjustments: [] })
  })

  it('returns applied discount codes', () => {
    act(() => {
      useCartStore.setState({ discountCodes: [{ code: 'TITANIUM10', applicable: true }] })
    })
    expect(renderHook(() => useCartDiscountCodes()).result.current).toEqual([
      { code: 'TITANIUM10', applicable: true },
    ])
  })

  it('returns pending adjustment notices', () => {
    act(() => {
      useCartStore.setState({ adjustments: ['Arc Band is limited to 2 — your bag was updated.'] })
    })
    expect(renderHook(() => useCartAdjustments()).result.current).toHaveLength(1)
  })
})

describe('useCheckoutUrl and useCartIsLoading', () => {
  it('reflects the synced checkout URL', () => {
    act(() => {
      useCartStore.setState({ checkoutUrl: 'https://checkout/x' })
    })
    expect(renderHook(() => useCheckoutUrl()).result.current).toBe('https://checkout/x')
  })

  it('reflects the loading flag', () => {
    act(() => {
      useCartStore.setState({ isLoading: true })
    })
    expect(renderHook(() => useCartIsLoading()).result.current).toBe(true)
    act(() => {
      useCartStore.setState({ isLoading: false })
    })
  })
})
