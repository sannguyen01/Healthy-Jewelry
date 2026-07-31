import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore, cartErrorMessage } from '@/store/cart'
import { makeProduct } from '@/test/factories'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const product = makeProduct({ id: 'p1', defaultVariantId: 'v1' })

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

function operationName(init: RequestInit): string {
  const { query } = JSON.parse(init.body as string) as { query: string }
  return query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? ''
}

function cartWithDiscounts(codes: { code: string; applicable: boolean }[], total = '80.00') {
  return {
    id: 'gid://shopify/Cart/c1',
    checkoutUrl: 'https://checkout/c1',
    totalQuantity: 1,
    cost: {
      subtotalAmount: { amount: '89.00', currencyCode: 'USD' },
      totalAmount: { amount: total, currencyCode: 'USD' },
      totalTaxAmount: null,
      totalDutyAmount: null,
    },
    discountCodes: codes,
    lines: {
      edges: [
        {
          node: {
            id: 'line-1',
            quantity: 1,
            merchandise: { id: 'v1', availableForSale: true },
          },
        },
      ],
    },
  }
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: 'gid://shopify/Cart/c1',
    checkoutUrl: null,
    isLoading: false,
    error: null,
    totals: null,
    discountCodes: [],
    adjustments: [],
  })
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('applyDiscountCode', () => {
  it('applies a valid code and stores the discounted total', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'TITANIUM10', applicable: true }], '80.10'),
            userErrors: [],
          },
        },
      })
    )

    await expect(useCartStore.getState().applyDiscountCode('TITANIUM10')).resolves.toBe(true)
    expect(useCartStore.getState().discountCodes).toEqual([
      { code: 'TITANIUM10', applicable: true },
    ])
    expect(useCartStore.getState().totals?.total.amount).toBe('80.10')
  })

  // Shopify distinguishes "this code exists but does not apply to your bag"
  // from "no such code"; both are failures, but only one is worth retrying
  // with different items, so the store reports applicability honestly.
  it('reports failure when Shopify says the code is not applicable', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'SUMMER', applicable: false }]),
            userErrors: [],
          },
        },
      })
    )

    await expect(useCartStore.getState().applyDiscountCode('SUMMER')).resolves.toBe(false)
  })

  it('trims surrounding whitespace before sending the code', async () => {
    let sentCodes: unknown
    mockFetch.mockImplementation(async (_url, init: RequestInit) => {
      sentCodes = (JSON.parse(init.body as string) as { variables: { discountCodes: string[] } })
        .variables.discountCodes
      return jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'TITANIUM10', applicable: true }]),
            userErrors: [],
          },
        },
      })
    })

    await useCartStore.getState().applyDiscountCode('  TITANIUM10  ')
    expect(sentCodes).toEqual(['TITANIUM10'])
  })

  it('ignores an empty code without calling Shopify', async () => {
    await expect(useCartStore.getState().applyDiscountCode('   ')).resolves.toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not duplicate a code that is already applied', async () => {
    useCartStore.setState({ discountCodes: [{ code: 'TITANIUM10', applicable: true }] })

    let sentCodes: string[] = []
    mockFetch.mockImplementation(async (_url, init: RequestInit) => {
      sentCodes = (JSON.parse(init.body as string) as { variables: { discountCodes: string[] } })
        .variables.discountCodes
      return jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'TITANIUM10', applicable: true }]),
            userErrors: [],
          },
        },
      })
    })

    await useCartStore.getState().applyDiscountCode('TITANIUM10')
    expect(sentCodes).toEqual(['TITANIUM10'])
  })

  it('creates a cart first when none exists yet', async () => {
    useCartStore.setState({ shopifyCartId: null, items: [] })
    useCartStore.getState().addItem(product)

    const ops: string[] = []
    mockFetch.mockImplementation(async (_url, init: RequestInit) => {
      const op = operationName(init)
      ops.push(op)
      if (op === 'CreateCart') {
        return jsonResponse({
          data: { cartCreate: { cart: cartWithDiscounts([]), userErrors: [] } },
        })
      }
      return jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'X', applicable: true }]),
            userErrors: [],
          },
        },
      })
    })

    await useCartStore.getState().applyDiscountCode('X')
    expect(ops).toEqual(['CreateCart', 'UpdateCartDiscountCodes'])
  })

  it('surfaces a network failure as a cart error and resolves false', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    await expect(useCartStore.getState().applyDiscountCode('X')).resolves.toBe(false)
    expect(useCartStore.getState().error?.code).toBe('network')
    expect(useCartStore.getState().isLoading).toBe(false)
  })

  it('surfaces a userErrors rejection', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: null,
            userErrors: [{ field: ['discountCodes'], message: 'Invalid' }],
          },
        },
      })
    )
    await expect(useCartStore.getState().applyDiscountCode('X')).resolves.toBe(false)
    expect(useCartStore.getState().error?.code).toBe('rejected')
  })
})

describe('removeDiscountCode', () => {
  it('sends the remaining codes and updates state', async () => {
    useCartStore.setState({
      discountCodes: [
        { code: 'A', applicable: true },
        { code: 'B', applicable: true },
      ],
    })

    let sentCodes: string[] = []
    mockFetch.mockImplementation(async (_url, init: RequestInit) => {
      sentCodes = (JSON.parse(init.body as string) as { variables: { discountCodes: string[] } })
        .variables.discountCodes
      return jsonResponse({
        data: {
          cartDiscountCodesUpdate: {
            cart: cartWithDiscounts([{ code: 'B', applicable: true }]),
            userErrors: [],
          },
        },
      })
    })

    await useCartStore.getState().removeDiscountCode('A')
    expect(sentCodes).toEqual(['B'])
    expect(useCartStore.getState().discountCodes).toEqual([{ code: 'B', applicable: true }])
  })

  it('does nothing without a Shopify cart', async () => {
    useCartStore.setState({ shopifyCartId: null })
    await useCartStore.getState().removeDiscountCode('A')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('leaves isLoading false after a failure', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    await useCartStore.getState().removeDiscountCode('A')
    expect(useCartStore.getState().isLoading).toBe(false)
  })
})

describe('cartErrorMessage', () => {
  it('returns customer-facing copy for every known code', () => {
    for (const code of ['not_configured', 'network', 'rejected', 'unavailable', 'unknown'] as const) {
      const message = cartErrorMessage(code)
      expect(message.length).toBeGreaterThan(10)
      // The old failure path leaked "Connect your Shopify store to enable
      // checkout" — an instruction to the developer, shown to the customer.
      expect(message.toLowerCase()).not.toContain('shopify store')
    }
  })

  it('falls back to the generic message for an unrecognised code', () => {
    expect(cartErrorMessage('nonsense' as 'unknown')).toBe(cartErrorMessage('unknown'))
  })
})

describe('clearError and dismissAdjustments', () => {
  it('clears a surfaced error', () => {
    useCartStore.setState({ error: { code: 'network', message: 'x' } })
    useCartStore.getState().clearError()
    expect(useCartStore.getState().error).toBeNull()
  })

  it('dismisses adjustment notices', () => {
    useCartStore.setState({ adjustments: ['a', 'b'] })
    useCartStore.getState().dismissAdjustments()
    expect(useCartStore.getState().adjustments).toEqual([])
  })

  it('clearCart resets discounts, totals and notices', () => {
    useCartStore.setState({
      items: [],
      discountCodes: [{ code: 'A', applicable: true }],
      adjustments: ['note'],
      totals: {
        subtotal: { amount: '1', currencyCode: 'USD' },
        total: { amount: '1', currencyCode: 'USD' },
        tax: null,
        duty: null,
      },
    })
    useCartStore.getState().clearCart()
    const state = useCartStore.getState()
    expect(state.discountCodes).toEqual([])
    expect(state.adjustments).toEqual([])
    expect(state.totals).toBeNull()
    expect(state.shopifyCartId).toBeNull()
  })
})
