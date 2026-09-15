import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore } from '@/store/cart'
import type { HJProduct } from '@/lib/shopify/types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockProduct: HJProduct = {
  id: 'hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/44123456789',
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
  featuredImage: null,
  images: [],
  variants: [],
}

function jsonResponse(body: unknown, status = 200) {
  // `ok` derived from the status rather than hard-coded. It was pinned to `true`,
  // so a test passing a failure status got a success response and asserted
  // against a path it was not on.
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function operationName(body: unknown): string {
  const { operation } = body as { operation: string }
  return operation ?? ''
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

  /**
   * **The remote cart is never emptied to make it correct.**
   *
   * Reconciliation used to delete every line and then re-add the fresh set,
   * across three unguarded round-trips. A failure at the add — one throttle retry
   * exhausted, a 5xx, a dropped connection — left the customer's Shopify cart
   * **empty**, with no compensating action, while the local bag still showed
   * everything. `cartLinesUpdate` was already imported, already in the
   * persisted-query allowlist, already asserted to be there by
   * `api-shopify-route.test.ts:148` — and called by nothing.
   *
   * These cases assert the diff by the operations it issues, because the
   * operations are the observable behaviour: each one spends a token of the
   * customer's own 60/minute budget on `/api/shopify`, and each one is a chance
   * to fail somewhere that matters.
   */
  /** A GetCart response holding `lines`, in the shape the reconciler reads. */
  function existingCartWith(lines: { lineId: string; variantId: string; quantity: number }[]) {
    return {
      data: {
        cart: {
          id: 'gid://shopify/Cart/existing-1',
          checkoutUrl: 'https://checkout.shopify.com/existing-1-stale',
          lines: {
            edges: lines.map((l) => ({
              node: {
                id: l.lineId,
                quantity: l.quantity,
                merchandise: { id: l.variantId, availableForSale: true },
              },
            })),
          },
        },
      },
    }
  }

  /** Whatever mutation runs last hands back the cart the store adopts. */
  function mutationResponse(field: string, variantIds: string[]) {
    return {
      data: {
        [field]: {
          cart: {
            id: 'gid://shopify/Cart/existing-1',
            checkoutUrl: 'https://checkout.shopify.com/existing-1-fresh',
            lines: {
              edges: variantIds.map((id, i) => ({
                node: {
                  id: `gid://shopify/CartLine/n-${i}`,
                  quantity: 1,
                  merchandise: { id, availableForSale: true },
                },
              })),
            },
          },
          userErrors: [],
        },
      },
    }
  }

  /** Drive a sync against a scripted remote cart, recording the operations. */
  async function syncAgainst(
    existing: { lineId: string; variantId: string; quantity: number }[],
    finalVariantIds: string[]
  ): Promise<string[]> {
    const calledOps: string[] = []
    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string) as unknown)
      calledOps.push(op)
      if (op === 'GetCart') return jsonResponse(existingCartWith(existing))
      if (op === 'UpdateCartLines') return jsonResponse(mutationResponse('cartLinesUpdate', finalVariantIds))
      if (op === 'AddToCart') return jsonResponse(mutationResponse('cartLinesAdd', finalVariantIds))
      if (op === 'RemoveFromCart') return jsonResponse(mutationResponse('cartLinesRemove', finalVariantIds))
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()
    return calledOps
  }

  it('an unchanged bag costs one GetCart, not three round-trips', async () => {
    const variantId = mockProduct.defaultVariantId
    const ops = await syncAgainst(
      [{ lineId: 'gid://shopify/CartLine/a', variantId, quantity: 1 }],
      [variantId]
    )

    expect(ops).toEqual(['GetCart'])
    expect(useCartStore.getState().checkoutUrl).toBe(
      'https://checkout.shopify.com/existing-1-stale'
    )
  })

  it('a quantity change issues UpdateCartLines — and nothing destructive', async () => {
    const variantId = mockProduct.defaultVariantId
    const ops = await syncAgainst(
      [{ lineId: 'gid://shopify/CartLine/a', variantId, quantity: 7 }],
      [variantId]
    )

    expect(ops).toEqual(['GetCart', 'UpdateCartLines'])
    expect(ops).not.toContain('RemoveFromCart')
    expect(ops).not.toContain('CreateCart')
  })

  it('a variant the remote cart lacks is added, not rebuilt', async () => {
    const ops = await syncAgainst([], [mockProduct.defaultVariantId])

    expect(ops).toEqual(['GetCart', 'AddToCart'])
    expect(useCartStore.getState().shopifyCartId).toBe('gid://shopify/Cart/existing-1')
  })

  /**
   * **This scenario needs BOTH an addition and a removal, and the first draft did
   * not have one.**
   *
   * The original version put a stale line beside an already-correct one, so the
   * plan contained a single mutation and "removal is last" was true however the
   * code was ordered. A mutation that moved removals to the front left every test
   * green. The fixture below forces two mutations, which is the only arrangement
   * in which the ordering is observable at all.
   */
  const STALE_VARIANT = 'gid://shopify/ProductVariant/no-longer-in-the-bag'

  it('adds before it removes, so the cart is never a subset mid-flight', async () => {
    const variantId = mockProduct.defaultVariantId
    const ops = await syncAgainst(
      // Nothing the bag wants, one thing it does not: forces add + remove.
      [{ lineId: 'gid://shopify/CartLine/stale', variantId: STALE_VARIANT, quantity: 1 }],
      [variantId]
    )

    expect(ops).toEqual(['GetCart', 'AddToCart', 'RemoveFromCart'])
  })

  it('leaves the remote cart intact when the first mutation fails', async () => {
    // The regression this whole change exists for. Previously the order was
    // remove-then-add, so a failure at the add left the cart EMPTY with no
    // compensation and `{ kind: 'failed' }` returned.
    //
    // The plan here holds an addition and a removal. Correct ordering issues the
    // addition first, it fails, and no removal is ever sent — the customer's
    // remote cart still holds what it held. With removals first, the removal
    // would have succeeded before anything failed.
    const variantId = mockProduct.defaultVariantId
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string) as unknown)
      calledOps.push(op)
      if (op === 'GetCart') {
        return jsonResponse(
          existingCartWith([
            { lineId: 'gid://shopify/CartLine/stale', variantId: STALE_VARIANT, quantity: 1 },
          ])
        )
      }
      return jsonResponse({ errors: [{ message: 'nope' }] }, 500)
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(
      calledOps,
      'a removal was issued before the failure — the cart was emptied on the way to failing'
    ).not.toContain('RemoveFromCart')
    expect(calledOps).toEqual(['GetCart', 'AddToCart'])
    expect(useCartStore.getState().items.length).toBeGreaterThan(0)
    expect(useCartStore.getState().checkoutError).not.toBeNull()
  })

  it('refuses a checkout holding a line the bag does not', async () => {
    // Removing last means a failure after the add leaves a SUPERSET. That is the
    // better failure, but only if something notices: an unremoved line is an item
    // the customer took out and would still be charged for. The post-sync check
    // is bidirectional for exactly this reason.
    const variantId = mockProduct.defaultVariantId
    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string) as unknown)
      if (op === 'GetCart') return jsonResponse(existingCartWith([]))
      return jsonResponse(
        mutationResponse('cartLinesAdd', [variantId, 'gid://shopify/ProductVariant/extra'])
      )
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().checkoutError).toBe('lines-unavailable')
    expect(useCartStore.getState().checkoutUrl).toBeNull()
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
