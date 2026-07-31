import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore, MAX_LINE_QUANTITY } from '@/store/cart'
import { makeProduct, makeVariant, makeSizedProduct } from '@/test/factories'
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
  badge: 'Bestseller',
  description: 'Test',
  spec: '2mm',
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
  badge: 'New',
  description: 'Dome ring',
  spec: '4mm',
  currencyCode: 'USD',
  availableForSale: true,
  options: [],
  svgType: 'ring-dome',
  variants: [],
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
    error: null,
    totals: null,
    discountCodes: [],
    adjustments: [],
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
  it('removes the correct product by id', () => {
    const { addItem, removeItem } = useCartStore.getState()
    addItem(mockProduct)
    addItem(mockProduct2)
    removeItem(mockProduct.defaultVariantId)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].product.id).toBe('hj-002')
  })

  it('removing a non-existent id leaves cart unchanged', () => {
    const { addItem, removeItem } = useCartStore.getState()
    addItem(mockProduct)
    removeItem('does-not-exist')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
  })
})

describe('updateQuantity', () => {
  it('updates quantity for an existing item', () => {
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

  // The defect this replaces: lines were keyed by product id, so adding a
  // second size of the same ring merged into the first line and the customer
  // was shipped two of the size they picked first.
  it('keeps two sizes of the same product as two separate lines', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.variantId)).toEqual([
      'gid://shopify/ProductVariant/size-9',
      'gid://shopify/ProductVariant/size-11',
    ])
    expect(items.every((i) => i.quantity === 1)).toBe(true)
  })

  it('merges quantity only when the same variant is added twice', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 2, 'gid://shopify/ProductVariant/size-9')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(3)
  })

  it('removes only the targeted size, leaving the other in the bag', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    useCartStore.getState().removeItem('gid://shopify/ProductVariant/size-9')
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].variantId).toBe('gid://shopify/ProductVariant/size-11')
  })

  it('updates the quantity of only the targeted size', () => {
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-9')
    useCartStore.getState().addItem(mockProduct, 1, 'gid://shopify/ProductVariant/size-11')
    useCartStore.getState().updateQuantity('gid://shopify/ProductVariant/size-11', 4)
    const { items } = useCartStore.getState()
    expect(items.find((i) => i.variantId.endsWith('size-9'))?.quantity).toBe(1)
    expect(items.find((i) => i.variantId.endsWith('size-11'))?.quantity).toBe(4)
  })

  it('refuses to add a variant that is not available for sale', () => {
    const soldOut = makeProduct({
      variants: [makeVariant({ id: 'v-sold-out', availableForSale: false })],
      defaultVariantId: 'v-sold-out',
    })
    useCartStore.getState().addItem(soldOut, 1, 'v-sold-out')
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(useCartStore.getState().error?.code).toBe('unavailable')
  })

  it('snapshots the variant title and options onto the line', () => {
    const sized = makeSizedProduct(['7', '9'])
    const nine = sized.variants.find((v) => v.title === '9')!
    useCartStore.getState().addItem(sized, 1, nine.id)
    const line = useCartStore.getState().items[0]
    expect(line.variantTitle).toBe('9')
    expect(line.selectedOptions).toEqual([{ name: 'Size', value: '9' }])
  })

  it('uses the variant price rather than the product "from" price', () => {
    const sized = makeSizedProduct(['7', '12'])
    const big = sized.variants.find((v) => v.title === '12')!
    big.price = { amount: '129.00', currencyCode: 'USD' }
    useCartStore.getState().addItem(sized, 1, big.id)
    expect(useCartStore.getState().items[0].unitPrice).toBe('129.00')
    expect(useCartStore.getState().totalPrice()).toBe(129)
  })
})

describe('quantity bounds', () => {
  it('clamps an absurd quantity to the per-line maximum', () => {
    useCartStore.getState().addItem(mockProduct, 9999)
    expect(useCartStore.getState().items[0].quantity).toBe(MAX_LINE_QUANTITY)
  })

  it('clamps a merged quantity to the per-line maximum', () => {
    useCartStore.getState().addItem(mockProduct, MAX_LINE_QUANTITY)
    useCartStore.getState().addItem(mockProduct, 5)
    expect(useCartStore.getState().items[0].quantity).toBe(MAX_LINE_QUANTITY)
  })

  it('floors a fractional quantity', () => {
    useCartStore.getState().addItem(mockProduct, 2.7)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
  })
})

describe('currencyCode selector', () => {
  it('reports the currency carried by the products in the bag', () => {
    const vnd = makeProduct({ currencyCode: 'VND', price: '2450000' })
    useCartStore.getState().addItem(vnd)
    expect(useCartStore.getState().currencyCode()).toBe('VND')
  })

  it('prefers Shopify totals currency once the cart has synced', () => {
    useCartStore.getState().addItem(makeProduct({ currencyCode: 'USD' }))
    useCartStore.setState({
      totals: {
        subtotal: { amount: '89.00', currencyCode: 'VND' },
        total: { amount: '89.00', currencyCode: 'VND' },
        tax: null,
        duty: null,
      },
    })
    expect(useCartStore.getState().currencyCode()).toBe('VND')
  })

  it('falls back to USD for an empty, unsynced bag', () => {
    expect(useCartStore.getState().currencyCode()).toBe('USD')
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
