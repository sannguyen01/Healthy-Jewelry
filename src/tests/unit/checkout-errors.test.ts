import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import { checkoutMessage, supportMailto, SUPPORT_EMAIL } from '@/lib/utils/checkoutMessages'
import type { CheckoutError } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * Every one of these failures used to end at the same place: a null
 * checkoutUrl, a `console.warn` nobody reads, and a customer watching a spinner
 * resolve into "Connect your Shopify store to enable checkout."
 *
 * These assert the reason now escapes the sync function, because that is the
 * only thing that lets the UI say something true.
 */

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function productWith(variantId: string): HJProduct {
  return {
    id: 'hj-001',
    defaultVariantId: variantId,
    handle: 'arc-band',
    title: 'Arc Band',
    collection: 'rings',
    material: 'titanium',
    tags: ['rings'],
    price: '89.00',
    compareAtPrice: null,
    currencyCode: 'USD',
    badge: null,
    description: 'Test',
    spec: '2mm',
    svgType: 'ring-arc',
    variants: [],
  }
}

const REAL_VARIANT = 'gid://shopify/ProductVariant/44123456789'
const PLACEHOLDER_VARIANT = 'gid://shopify/ProductVariant/hj-001-default'

function resetStore() {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
    checkoutError: null,
  })
}

beforeEach(() => {
  resetStore()
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkoutError — not-configured', () => {
  it('is set when no store domain was baked into the bundle', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('not-configured')
    // The point of failing early: no pointless round trip.
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('checkoutError — placeholder-catalog', () => {
  it('is set when the bag holds static fallback ids, without calling Shopify', async () => {
    useCartStore.getState().addItem(productWith(PLACEHOLDER_VARIANT), 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('placeholder-catalog')
    // Sending this would return an opaque userError and tell us nothing.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('is set when only one line of several is a placeholder', async () => {
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)
    useCartStore.getState().addItem({ ...productWith(PLACEHOLDER_VARIANT), id: 'hj-002' }, 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('placeholder-catalog')
  })
})

describe('checkoutError — network', () => {
  it('is set when the proxy request throws', async () => {
    mockFetch.mockRejectedValue(new Error('connection reset'))
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('network')
    expect(useCartStore.getState().isLoading).toBe(false)
  })
})

describe('checkoutError — shopify-error', () => {
  it('is set when Shopify answers but returns no cart', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          cartCreate: {
            userErrors: [{ field: ['lines'], message: 'Variant does not exist' }],
          },
        },
      }),
    } as Response)
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('shopify-error')
    expect(useCartStore.getState().checkoutUrl).toBeNull()
  })
})

describe('checkoutError lifecycle', () => {
  it('is cleared by a successful sync', async () => {
    useCartStore.setState({ checkoutError: 'network' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/1',
              checkoutUrl: 'https://test-shop.myshopify.com/checkout/1',
              lines: { edges: [] },
            },
          },
        },
      }),
    } as Response)
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)

    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBeNull()
    expect(useCartStore.getState().checkoutUrl).toBe('https://test-shop.myshopify.com/checkout/1')
  })

  it('is cleared when the bag changes, so a stale reason is never shown', async () => {
    useCartStore.getState().addItem(productWith(REAL_VARIANT), 1)
    useCartStore.setState({ checkoutError: 'shopify-error' })

    useCartStore.getState().addItem({ ...productWith(REAL_VARIANT), id: 'hj-003' }, 1)

    expect(useCartStore.getState().checkoutError).toBeNull()
  })

  it('is cleared when the bag is emptied', () => {
    useCartStore.setState({ checkoutError: 'network' })
    useCartStore.getState().clearCart()
    expect(useCartStore.getState().checkoutError).toBeNull()
  })
})

describe('customer-facing copy', () => {
  const ALL: CheckoutError[] = [
    'not-configured',
    'placeholder-catalog',
    'network',
    'shopify-error',
  ]

  it('has a message for every failure reason', () => {
    for (const error of ALL) {
      const message = checkoutMessage(error)
      expect(message.title.length).toBeGreaterThan(0)
      expect(message.body.length).toBeGreaterThan(0)
    }
  })

  it('never leaks the cause to the customer', () => {
    // A shopper cannot act on "the storefront token was rejected", and it
    // reads as though they did something wrong.
    for (const error of ALL) {
      const text = `${checkoutMessage(error).title} ${checkoutMessage(error).body}`.toLowerCase()
      for (const jargon of ['shopify', 'api', 'token', 'variant', 'catalog', 'configure', 'env']) {
        expect(text, `"${jargon}" leaked into the ${error} message`).not.toContain(jargon)
      }
    }
  })

  it('reassures that nothing was charged and the bag survives', () => {
    for (const error of ALL) {
      const body = checkoutMessage(error).body.toLowerCase()
      expect(body, `${error} message should mention the bag`).toMatch(/bag|saved/)
    }
  })

  it('only offers a retry where retrying could actually work', () => {
    expect(checkoutMessage('network').retryable).toBe(true)
    expect(checkoutMessage('shopify-error').retryable).toBe(true)
    // Configuration faults cannot be retried away; offering a button that
    // always fails wastes the customer's time.
    expect(checkoutMessage('not-configured').retryable).toBe(false)
    expect(checkoutMessage('placeholder-catalog').retryable).toBe(false)
  })
})

describe('supportMailto', () => {
  it('addresses the existing support inbox', () => {
    expect(supportMailto()).toContain(`mailto:${SUPPORT_EMAIL}`)
  })

  it('carries the bag so support can act without a back-and-forth', () => {
    const link = supportMailto('1 × Arc Band')
    expect(decodeURIComponent(link)).toContain('1 × Arc Band')
  })

  it('omits the body when there is nothing to summarise', () => {
    expect(supportMailto()).not.toContain('&body=')
  })
})
