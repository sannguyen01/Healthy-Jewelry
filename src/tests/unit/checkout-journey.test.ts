import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * The end of the purchase journey.
 *
 * Shopify's Cart API documentation, verbatim:
 *
 *   "Completed carts are deleted upon order creation. Unlike the Checkout API,
 *    you can't query a completed cart for order information or completion
 *    status. You can subscribe to webhooks to receive information about the
 *    created order."
 *
 * So from the storefront's side, a successful purchase and an expired cart look
 * *identical*: `cart(id:)` returns null in both cases. The store used to
 * collapse both into "no cart" and silently rebuild it from the local lines —
 * which meant a customer who had just paid came back to a bag still holding
 * everything they had bought, with a live Checkout button. The failure mode is
 * charging someone twice for the same thing.
 *
 * The only discriminator available is one we have to record ourselves: did *we*
 * send this person to pay for this exact cart? These tests pin both halves of
 * that, and the second half matters as much as the first — the obvious fix
 * (treat every missing cart as an order) would break the perfectly good silent
 * recovery that has always handled genuine expiry.
 */

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const product: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/44123456789',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings'],
  price: '1450000',
  compareAtPrice: null,
  currencyCode: 'VND',
  badge: null,
  description: 'Test',
  spec: '2mm',
  svgType: 'ring-arc',
  featuredImage: null,
  images: [],
  variants: [],
}

const VARIANT = product.defaultVariantId
const OLD_CART = 'gid://shopify/Cart/old'
const NEW_CART = 'gid://shopify/Cart/new'

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function cartPayload(id: string, opts: { total?: string; variantIds?: string[] } = {}) {
  const variantIds = opts.variantIds ?? [VARIANT]
  return {
    id,
    checkoutUrl: `https://test-shop.myshopify.com/checkouts/${id}`,
    cost: { totalAmount: { amount: opts.total ?? '1450000', currencyCode: 'VND' } },
    lines: {
      edges: variantIds.map((variantId, i) => ({
        node: {
          id: `line-${i}`,
          quantity: 1,
          merchandise: {
            id: variantId,
            availableForSale: true,
            price: { amount: opts.total ?? '1450000', currencyCode: 'VND' },
          },
        },
      })),
    },
  }
}

/** Routes each persisted-operation key to a canned response. */
function route(handlers: Record<string, unknown>) {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const { operation } = JSON.parse(init.body as string) as { operation: string }
    const handler = handlers[operation]
    if (handler === undefined) throw new Error(`unrouted operation: ${operation}`)
    return ok(handler)
  })
}

function seedBag(overrides: Partial<ReturnType<typeof useCartStore.getState>> = {}) {
  useCartStore.setState({
    items: [{ product, quantity: 1, variantId: VARIANT }],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
    checkoutError: null,
    pendingCheckoutCartId: null,
    justCompleted: false,
    shopifyTotal: null,
    ...overrides,
  })
}

beforeEach(() => {
  seedBag()
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a completed order ends the journey', () => {
  beforeEach(() => {
    // The customer was sent to pay for OLD_CART, and Shopify has since deleted
    // it — which is what a completed order looks like from here.
    seedBag({ shopifyCartId: OLD_CART, pendingCheckoutCartId: OLD_CART })
    route({ GetCart: { data: { cart: null } } })
  })

  it('empties the bag', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().items).toEqual([])
  })

  it('raises the confirmation flag', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().justCompleted).toBe(true)
  })

  it('reports no error — a purchase is not a failure', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().checkoutError).toBeNull()
  })

  it('clears the checkout URL so the button cannot be pressed again', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().checkoutUrl).toBeNull()
    expect(useCartStore.getState().shopifyCartId).toBeNull()
  })

  it('clears the pending marker, so one order is never counted twice', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().pendingCheckoutCartId).toBeNull()
  })

  it('does not rebuild the cart in Shopify', async () => {
    await useCartStore.getState().syncWithShopify()
    const operations = mockFetch.mock.calls.map(
      (call) => JSON.parse(call[1].body as string).operation
    )
    // Rebuilding is what produced a bag full of already-purchased items.
    expect(operations).not.toContain('CreateCart')
  })

  it('a second sync does nothing — an empty bag has nothing to submit', async () => {
    await useCartStore.getState().syncWithShopify()
    mockFetch.mockClear()
    await useCartStore.getState().syncWithShopify()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('an expired cart is NOT an order', () => {
  beforeEach(() => {
    // Same missing cart, but this customer was never sent to checkout. This is
    // ordinary expiry, and silently rebuilding is the correct, long-standing
    // behaviour that the completed-order fix must not break.
    seedBag({ shopifyCartId: OLD_CART, pendingCheckoutCartId: null })
    route({
      GetCart: { data: { cart: null } },
      CreateCart: { data: { cartCreate: { cart: cartPayload(NEW_CART), userErrors: [] } } },
    })
  })

  it('keeps the bag', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('does not claim an order was placed', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().justCompleted).toBe(false)
  })

  it('rebuilds the cart and produces a usable checkout URL', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().shopifyCartId).toBe(NEW_CART)
    expect(useCartStore.getState().checkoutUrl).toContain(NEW_CART)
    expect(useCartStore.getState().checkoutError).toBeNull()
  })

  it('a cart id that does not match the pending one is also expiry', async () => {
    // Guards the comparison itself: matching on "is anything pending" rather
    // than "is *this* cart pending" would call a stale marker an order.
    seedBag({ shopifyCartId: OLD_CART, pendingCheckoutCartId: 'gid://shopify/Cart/somethingelse' })
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().justCompleted).toBe(false)
    expect(useCartStore.getState().items).toHaveLength(1)
  })
})

describe('beginCheckout records what is being paid for', () => {
  it('marks the current cart as pending', () => {
    seedBag({ shopifyCartId: OLD_CART })
    useCartStore.getState().beginCheckout()
    expect(useCartStore.getState().pendingCheckoutCartId).toBe(OLD_CART)
  })

  it('does nothing when there is no cart to pay for', () => {
    seedBag({ shopifyCartId: null })
    useCartStore.getState().beginCheckout()
    expect(useCartStore.getState().pendingCheckoutCartId).toBeNull()
  })

  it('survives persistence — the customer leaves the origin to pay', () => {
    // `partialize` decides what outlives a page load. Paying navigates away
    // entirely, so a marker kept only in memory would be gone at exactly the
    // moment it is needed, and every order would read as an expired cart.
    seedBag({ shopifyCartId: OLD_CART, justCompleted: true })
    useCartStore.getState().beginCheckout()

    const persisted = JSON.parse(localStorage.getItem('hj-cart') ?? '{}') as {
      state?: Record<string, unknown>
    }
    expect(persisted.state).toHaveProperty('pendingCheckoutCartId', OLD_CART)
    expect(persisted.state).toHaveProperty('justCompleted', true)
  })
})

describe('the confirmation clears when the customer moves on', () => {
  it('acknowledgeCompletion lowers the flag', () => {
    seedBag({ justCompleted: true })
    useCartStore.getState().acknowledgeCompletion()
    expect(useCartStore.getState().justCompleted).toBe(false)
  })

  it('adding a new item dismisses the previous order', () => {
    seedBag({ items: [], justCompleted: true })
    useCartStore.getState().addItem(product)
    expect(useCartStore.getState().justCompleted).toBe(false)
  })
})
