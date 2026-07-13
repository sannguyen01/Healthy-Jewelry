import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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
  badge: null,
  description: 'Test',
  spec: '2mm',
  svgType: 'ring-arc',
  variants: [],
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response
}

function operationName(body: unknown): string {
  const { query } = body as { query: string }
  // Not anchored to string start: real query/mutation constants interpolate
  // their fragment before the operation keyword.
  const match = query.match(/\b(?:query|mutation)\s+(\w+)/)
  return match?.[1] ?? ''
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
  })
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('syncWithShopify — first sync (no shopifyCartId)', () => {
  it('calls CreateCart and stores the returned id/checkoutUrl', async () => {
    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as unknown
      expect(operationName(body)).toBe('CreateCart')
      return jsonResponse({
        data: {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/new-1',
              checkoutUrl: 'https://checkout.shopify.com/new-1',
              lines: { edges: [] },
            },
            userErrors: [],
          },
        },
      })
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    const { shopifyCartId, checkoutUrl } = useCartStore.getState()
    expect(shopifyCartId).toBe('gid://shopify/Cart/new-1')
    expect(checkoutUrl).toBe('https://checkout.shopify.com/new-1')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('a userErrors response leaves the cart id/checkoutUrl unset and does not throw', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: null,
            userErrors: [{ field: ['lines'], message: 'Variant is out of stock' }],
          },
        },
      })
    )

    useCartStore.getState().addItem(mockProduct)
    await expect(useCartStore.getState().syncWithShopify()).resolves.toBeUndefined()

    const { shopifyCartId, checkoutUrl, items } = useCartStore.getState()
    expect(shopifyCartId).toBeNull()
    expect(checkoutUrl).toBeNull()
    expect(items).toHaveLength(1)
  })

  it('a network failure is caught, isLoading returns to false, local items stay intact', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    const { isLoading, items, checkoutUrl } = useCartStore.getState()
    expect(isLoading).toBe(false)
    expect(items).toHaveLength(1)
    expect(checkoutUrl).toBeNull()
  })
})

describe('syncWithShopify — resync with an existing shopifyCartId', () => {
  beforeEach(() => {
    useCartStore.setState({ shopifyCartId: 'gid://shopify/Cart/existing-1' })
  })

  it('uses GetCart + CartLinesRemove + CartLinesAdd, not CreateCart again', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as unknown
      const op = operationName(body)
      calledOps.push(op)

      if (op === 'GetCart') {
        return jsonResponse({
          data: {
            cart: {
              id: 'gid://shopify/Cart/existing-1',
              checkoutUrl: 'https://checkout.shopify.com/existing-1-stale',
              lines: { edges: [{ node: { id: 'gid://shopify/CartLine/old-1' } }] },
            },
          },
        })
      }
      if (op === 'RemoveFromCart') {
        return jsonResponse({
          data: { cartLinesRemove: { cart: null, userErrors: [] } },
        })
      }
      if (op === 'AddToCart') {
        return jsonResponse({
          data: {
            cartLinesAdd: {
              cart: {
                id: 'gid://shopify/Cart/existing-1',
                checkoutUrl: 'https://checkout.shopify.com/existing-1-fresh',
                lines: { edges: [] },
              },
              userErrors: [],
            },
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(calledOps).toEqual(['GetCart', 'RemoveFromCart', 'AddToCart'])
    expect(calledOps).not.toContain('CreateCart')

    const { shopifyCartId, checkoutUrl } = useCartStore.getState()
    expect(shopifyCartId).toBe('gid://shopify/Cart/existing-1')
    expect(checkoutUrl).toBe('https://checkout.shopify.com/existing-1-fresh')
  })

  it('falls back to CreateCart when the existing cart is not found/expired', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as unknown
      const op = operationName(body)
      calledOps.push(op)

      if (op === 'GetCart') {
        return jsonResponse({ data: { cart: null } })
      }
      if (op === 'CreateCart') {
        return jsonResponse({
          data: {
            cartCreate: {
              cart: {
                id: 'gid://shopify/Cart/replacement-1',
                checkoutUrl: 'https://checkout.shopify.com/replacement-1',
                lines: { edges: [] },
              },
              userErrors: [],
            },
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(calledOps).toEqual(['GetCart', 'CreateCart'])

    const { shopifyCartId, checkoutUrl } = useCartStore.getState()
    expect(shopifyCartId).toBe('gid://shopify/Cart/replacement-1')
    expect(checkoutUrl).toBe('https://checkout.shopify.com/replacement-1')
  })
})
