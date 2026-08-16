import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * The price shown must be the price charged.
 *
 * This project has now hit that rule three times from three directions: every
 * price hardcoded to USD; a line item rendered as a bare unformatted number;
 * and this one, which is the subtlest of the three because nothing about it
 * looks wrong in the code.
 *
 * The bag persists the *whole product* — price included — into `localStorage`,
 * and `totalPrice()` sums those numbers. There is no expiry. A bag left open
 * across a price change in Shopify quotes the old price indefinitely, and
 * Shopify charges the new one at checkout.
 *
 * Meanwhile `CART_FRAGMENT` has always requested `cost.totalAmount` and each
 * line's `merchandise.price`. The data was arriving on every single sync and
 * being discarded by a type that declared three fields. The fix is not new
 * plumbing — it is reading what was already on the wire.
 */

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const VARIANT = 'gid://shopify/ProductVariant/44123456789'
const CART_ID = 'gid://shopify/Cart/abc'

/** The price the customer saw when they added the piece, weeks ago. */
const STALE_PRICE = '1450000'
/** What Shopify will actually charge today. */
const CURRENT_PRICE = '1590000'

const product: HJProduct = {
  id: 'hj-001',
  defaultVariantId: VARIANT,
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings'],
  price: STALE_PRICE,
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

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function routeCreate(opts: { total: string; linePrice: string; variantIds?: string[] }) {
  const variantIds = opts.variantIds ?? [VARIANT]
  mockFetch.mockImplementation(async () =>
    ok({
      data: {
        cartCreate: {
          cart: {
            id: CART_ID,
            checkoutUrl: `https://test-shop.myshopify.com/checkouts/${CART_ID}`,
            cost: { totalAmount: { amount: opts.total, currencyCode: 'VND' } },
            lines: {
              edges: variantIds.map((variantId, i) => ({
                node: {
                  id: `line-${i}`,
                  quantity: 1,
                  merchandise: {
                    id: variantId,
                    availableForSale: true,
                    price: { amount: opts.linePrice, currencyCode: 'VND' },
                  },
                },
              })),
            },
          },
          userErrors: [],
        },
      },
    })
  )
}

beforeEach(() => {
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
  })
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Shopify's price wins over a stale local one", () => {
  beforeEach(() => {
    routeCreate({ total: CURRENT_PRICE, linePrice: CURRENT_PRICE })
  })

  it('adopts the line price Shopify returns', async () => {
    expect(useCartStore.getState().items[0].product.price).toBe(STALE_PRICE)
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().items[0].product.price).toBe(CURRENT_PRICE)
  })

  it('records the authoritative total', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().shopifyTotal).toBe(CURRENT_PRICE)
  })

  it('the total no longer comes from the stale local sum', async () => {
    await useCartStore.getState().syncWithShopify()
    const { shopifyTotal, totalPrice } = useCartStore.getState()
    // Both now agree, because the line price was adopted too — the point is
    // that the number displayed is sourced from Shopify, not from storage.
    expect(shopifyTotal).toBe(CURRENT_PRICE)
    expect(totalPrice()).toBe(parseFloat(CURRENT_PRICE))
  })

  it('leaves an already-correct price untouched', async () => {
    routeCreate({ total: STALE_PRICE, linePrice: STALE_PRICE })
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().items[0].product.price).toBe(STALE_PRICE)
  })

  it('a bag change discards the total, which was scoped to other lines', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().shopifyTotal).toBe(CURRENT_PRICE)
    useCartStore.getState().updateQuantity(VARIANT, 3)
    expect(useCartStore.getState().shopifyTotal).toBeNull()
  })

  it('quantity is untouched — only price is adopted', async () => {
    useCartStore.setState({ items: [{ product, quantity: 4, variantId: VARIANT }] })
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().items[0].quantity).toBe(4)
  })
})

describe('a line Shopify will not sell is not silently dropped', () => {
  it('reports lines-unavailable when a variant comes back missing', async () => {
    const second: HJProduct = { ...product, id: 'hj-002', defaultVariantId: 'gid://x/2' }
    useCartStore.setState({
      items: [
        { product, quantity: 1, variantId: VARIANT },
        { product: second, quantity: 1, variantId: 'gid://x/2' },
      ],
    })
    // Shopify accepts the cart but returns only the first line.
    routeCreate({ total: CURRENT_PRICE, linePrice: CURRENT_PRICE, variantIds: [VARIANT] })

    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().checkoutError).toBe('lines-unavailable')
  })

  it('does not hand over a checkout URL for a short cart', async () => {
    const second: HJProduct = { ...product, id: 'hj-002', defaultVariantId: 'gid://x/2' }
    useCartStore.setState({
      items: [
        { product, quantity: 1, variantId: VARIANT },
        { product: second, quantity: 1, variantId: 'gid://x/2' },
      ],
    })
    routeCreate({ total: CURRENT_PRICE, linePrice: CURRENT_PRICE, variantIds: [VARIANT] })

    await useCartStore.getState().syncWithShopify()
    // Proceeding would take payment for a bag the customer never agreed to.
    expect(useCartStore.getState().checkoutUrl).toBeNull()
  })

  it('a complete cart proceeds normally', async () => {
    routeCreate({ total: CURRENT_PRICE, linePrice: CURRENT_PRICE })
    await useCartStore.getState().syncWithShopify()
    expect(useCartStore.getState().checkoutError).toBeNull()
    expect(useCartStore.getState().checkoutUrl).toContain(CART_ID)
  })
})
