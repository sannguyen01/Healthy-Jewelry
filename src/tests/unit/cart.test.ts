import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore, cartItemVariantLabel } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

const mockProduct: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
  handle: 'arc-band',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings'],
  price: '89.00',
  compareAtPrice: null,
  currencyCode: 'USD',
  badge: 'Bestseller',
  description: 'Test',
  spec: '2mm',
  svgType: 'ring-arc',
  featuredImage: null,
  images: [],
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
  currencyCode: 'USD',
  badge: 'New',
  description: 'Dome ring',
  spec: '4mm',
  svgType: 'ring-dome',
  featuredImage: null,
  images: [],
  variants: [],
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

describe('cart store — initial state', () => {
  it('has an empty items array', () => {
    const { items } = useCartStore.getState()
    expect(items).toEqual([])
  })

  it('has isOpen as false', () => {
    const { isOpen } = useCartStore.getState()
    expect(isOpen).toBe(false)
  })

  it('has shopifyCartId as null', () => {
    const { shopifyCartId } = useCartStore.getState()
    expect(shopifyCartId).toBeNull()
  })

  it('has checkoutUrl as null', () => {
    const { checkoutUrl } = useCartStore.getState()
    expect(checkoutUrl).toBeNull()
  })

  it('has isLoading as false', () => {
    const { isLoading } = useCartStore.getState()
    expect(isLoading).toBe(false)
  })
})

describe('addItem', () => {
  it('adds a product and totalItems becomes 1', () => {
    const { addItem, totalItems } = useCartStore.getState()
    addItem(mockProduct)
    expect(totalItems()).toBe(1)
  })

  it('adding the same product twice results in quantity 2', () => {
    const { addItem, totalItems } = useCartStore.getState()
    addItem(mockProduct)
    addItem(mockProduct)
    expect(totalItems()).toBe(2)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('adding two different products results in two items', () => {
    const { addItem } = useCartStore.getState()
    addItem(mockProduct)
    addItem(mockProduct2)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
  })

  it('respects explicit quantity when adding', () => {
    const { addItem, totalItems } = useCartStore.getState()
    addItem(mockProduct, 3)
    expect(totalItems()).toBe(3)
  })
})

describe('removeItem', () => {
  it('removes the correct line by variant id', () => {
    const { addItem, removeItem } = useCartStore.getState()
    addItem(mockProduct)
    addItem(mockProduct2)
    removeItem(mockProduct.defaultVariantId)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].product.id).toBe('hj-002')
  })

  it('removing a non-existent variant id leaves cart unchanged', () => {
    const { addItem, removeItem } = useCartStore.getState()
    addItem(mockProduct)
    removeItem('does-not-exist')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
  })

  it('removing one size of a product leaves the other size untouched', () => {
    const { addItem, removeItem } = useCartStore.getState()
    addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    removeItem('gid://shopify/ProductVariant/size-9')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].variantId).toBe('gid://shopify/ProductVariant/size-11')
  })
})

describe('updateQuantity', () => {
  it('updates quantity for an existing line', () => {
    const { addItem, updateQuantity } = useCartStore.getState()
    addItem(mockProduct)
    updateQuantity(mockProduct.defaultVariantId, 5)
    const { items } = useCartStore.getState()
    expect(items[0].quantity).toBe(5)
  })

  it('removes the item when quantity is set to 0', () => {
    const { addItem, updateQuantity } = useCartStore.getState()
    addItem(mockProduct)
    updateQuantity(mockProduct.defaultVariantId, 0)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('removes the item when quantity is negative', () => {
    const { addItem, updateQuantity } = useCartStore.getState()
    addItem(mockProduct)
    updateQuantity(mockProduct.defaultVariantId, -1)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('updating one size of a product leaves the other size untouched', () => {
    const { addItem, updateQuantity } = useCartStore.getState()
    addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    updateQuantity('gid://shopify/ProductVariant/size-9', 5)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
    const size9 = items.find((i) => i.variantId === 'gid://shopify/ProductVariant/size-9')
    const size11 = items.find((i) => i.variantId === 'gid://shopify/ProductVariant/size-11')
    expect(size9?.quantity).toBe(5)
    expect(size11?.quantity).toBe(1)
  })
})

describe('checkoutUrl invalidation on cart edits', () => {
  beforeEach(() => {
    useCartStore.setState({
      shopifyCartId: 'gid://shopify/Cart/123',
      checkoutUrl: 'https://checkout.shopify.com/stale',
    })
  })

  it('addItem clears checkoutUrl but keeps shopifyCartId', () => {
    useCartStore.getState().addItem(mockProduct)
    const { checkoutUrl, shopifyCartId } = useCartStore.getState()
    expect(checkoutUrl).toBeNull()
    expect(shopifyCartId).toBe('gid://shopify/Cart/123')
  })

  it('removeItem clears checkoutUrl but keeps shopifyCartId', () => {
    useCartStore.getState().addItem(mockProduct)
    useCartStore.getState().removeItem(mockProduct.defaultVariantId)
    const { checkoutUrl, shopifyCartId } = useCartStore.getState()
    expect(checkoutUrl).toBeNull()
    expect(shopifyCartId).toBe('gid://shopify/Cart/123')
  })

  it('updateQuantity clears checkoutUrl but keeps shopifyCartId', () => {
    useCartStore.getState().addItem(mockProduct)
    useCartStore.setState({ checkoutUrl: 'https://checkout.shopify.com/stale' })
    useCartStore.getState().updateQuantity(mockProduct.defaultVariantId, 5)
    const { checkoutUrl, shopifyCartId } = useCartStore.getState()
    expect(checkoutUrl).toBeNull()
    expect(shopifyCartId).toBe('gid://shopify/Cart/123')
  })
})

describe('addItem — variant resolution', () => {
  it('uses the provided variantId when given', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    const { items } = useCartStore.getState()
    expect(items[0].variantId).toBe('gid://shopify/ProductVariant/size-9')
  })

  it('falls back to defaultVariantId when no variantId is given', () => {
    useCartStore.getState().addItem(mockProduct)
    const { items } = useCartStore.getState()
    expect(items[0].variantId).toBe(mockProduct.defaultVariantId)
  })

  it('adding two different sizes of the same product creates two separate lines', () => {
    // The regression this guards: keying the merge check by product id
    // collapsed size 9 and size 11 of the same ring into one line carrying
    // whichever size was added first — the quantity went up, the size did
    // not, and the customer received the wrong ring.
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.variantId).sort()).toEqual(
      ['gid://shopify/ProductVariant/size-11', 'gid://shopify/ProductVariant/size-9'].sort()
    )
    expect(items.every((i) => i.quantity === 1)).toBe(true)
  })

  it('adding the same size twice merges into one line with quantity 2', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
    expect(items[0].variantId).toBe('gid://shopify/ProductVariant/size-9')
  })
})

describe('clearCart', () => {
  it('empties the items array', () => {
    const { addItem, clearCart } = useCartStore.getState()
    addItem(mockProduct)
    addItem(mockProduct2)
    clearCart()
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('clears shopifyCartId and checkoutUrl', () => {
    useCartStore.setState({
      shopifyCartId: 'gid://shopify/Cart/123',
      checkoutUrl: 'https://checkout.shopify.com/x',
    })
    useCartStore.getState().clearCart()
    const { shopifyCartId, checkoutUrl } = useCartStore.getState()
    expect(shopifyCartId).toBeNull()
    expect(checkoutUrl).toBeNull()
  })
})

describe('drawer controls', () => {
  it('openCart sets isOpen to true', () => {
    useCartStore.getState().openCart()
    expect(useCartStore.getState().isOpen).toBe(true)
  })

  it('closeCart sets isOpen to false', () => {
    useCartStore.setState({ isOpen: true })
    useCartStore.getState().closeCart()
    expect(useCartStore.getState().isOpen).toBe(false)
  })

  it('toggleCart flips isOpen from false to true', () => {
    useCartStore.getState().toggleCart()
    expect(useCartStore.getState().isOpen).toBe(true)
  })

  it('toggleCart flips isOpen from true to false', () => {
    useCartStore.setState({ isOpen: true })
    useCartStore.getState().toggleCart()
    expect(useCartStore.getState().isOpen).toBe(false)
  })
})

describe('totalPrice', () => {
  it('returns 0 for an empty cart', () => {
    const { totalPrice } = useCartStore.getState()
    expect(totalPrice()).toBe(0)
  })

  it('returns price * quantity for a single item', () => {
    const { addItem, totalPrice } = useCartStore.getState()
    addItem(mockProduct, 2) // 89.00 * 2 = 178.00
    expect(totalPrice()).toBeCloseTo(178.0, 2)
  })

  it('sums price * quantity across multiple items', () => {
    const { addItem, totalPrice } = useCartStore.getState()
    addItem(mockProduct, 1) // 89.00
    addItem(mockProduct2, 2) // 112.00 * 2 = 224.00 → total 313.00
    expect(totalPrice()).toBeCloseTo(313.0, 2)
  })
})

describe('totalItems', () => {
  it('sums quantities across all items', () => {
    const { addItem, totalItems } = useCartStore.getState()
    addItem(mockProduct, 3)
    addItem(mockProduct2, 2)
    expect(totalItems()).toBe(5)
  })
})

describe('cartItemVariantLabel', () => {
  const sizedProduct: HJProduct = {
    ...mockProduct,
    variants: [
      {
        id: 'gid://shopify/ProductVariant/size-9',
        title: 'Size 9',
        price: { amount: '89.00', currencyCode: 'USD' },
        compareAtPrice: null,
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: '9' }],
      },
      {
        id: 'gid://shopify/ProductVariant/size-11',
        title: 'Size 11',
        price: { amount: '89.00', currencyCode: 'USD' },
        compareAtPrice: null,
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: '11' }],
      },
    ],
  }

  it('returns the matching variant title', () => {
    expect(
      cartItemVariantLabel({
        product: sizedProduct,
        variantId: 'gid://shopify/ProductVariant/size-9',
      })
    ).toBe('Size 9')
  })

  it('distinguishes two variants of the same product', () => {
    const size9 = cartItemVariantLabel({
      product: sizedProduct,
      variantId: 'gid://shopify/ProductVariant/size-9',
    })
    const size11 = cartItemVariantLabel({
      product: sizedProduct,
      variantId: 'gid://shopify/ProductVariant/size-11',
    })
    expect(size9).not.toBe(size11)
  })

  it('returns null for a single-variant product (Shopify API sentinel)', () => {
    const unsized: HJProduct = {
      ...mockProduct,
      variants: [
        {
          id: mockProduct.defaultVariantId,
          title: 'Default Title',
          price: { amount: '89.00', currencyCode: 'USD' },
          compareAtPrice: null,
          availableForSale: true,
          selectedOptions: [],
        },
      ],
    }
    expect(
      cartItemVariantLabel({ product: unsized, variantId: unsized.defaultVariantId })
    ).toBeNull()
  })

  it('returns null for a single-variant product (static fallback catalog sentinel)', () => {
    // src/lib/data/hj-data.ts buildVariants() titles the implicit single
    // variant "Default", not Shopify's "Default Title" — both must be caught.
    const unsized: HJProduct = {
      ...mockProduct,
      variants: [
        {
          id: mockProduct.defaultVariantId,
          title: 'Default',
          price: { amount: '89.00', currencyCode: 'USD' },
          compareAtPrice: null,
          availableForSale: true,
          selectedOptions: [],
        },
      ],
    }
    expect(
      cartItemVariantLabel({ product: unsized, variantId: unsized.defaultVariantId })
    ).toBeNull()
  })

  it('formats a single selected option as "Name Value" (bare "9" would read as noise)', () => {
    const ringVariant: HJProduct = {
      ...mockProduct,
      variants: [
        {
          id: 'hj-001-size-9',
          title: '9',
          price: { amount: '89.00', currencyCode: 'USD' },
          compareAtPrice: null,
          availableForSale: true,
          selectedOptions: [{ name: 'Size', value: '9' }],
        },
      ],
    }
    expect(cartItemVariantLabel({ product: ringVariant, variantId: 'hj-001-size-9' })).toBe(
      'Size 9'
    )
  })

  it('returns null when the variant is not found (e.g. discontinued)', () => {
    expect(
      cartItemVariantLabel({ product: mockProduct, variantId: 'gid://shopify/ProductVariant/gone' })
    ).toBeNull()
  })
})
