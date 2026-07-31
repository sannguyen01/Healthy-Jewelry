import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCartStore, diffCartLines } from '@/store/cart'
import { makeProduct, makeSizedProduct } from '@/test/factories'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockProduct = makeProduct({
  id: 'hj-001',
  handle: 'arc-band',
  title: 'Arc Band',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
})

const VARIANT = mockProduct.defaultVariantId

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

function operationName(body: unknown): string {
  const { query } = body as { query: string }
  // Not anchored to string start: real query/mutation constants interpolate
  // their fragment before the operation keyword.
  const match = query.match(/\b(?:query|mutation)\s+(\w+)/)
  return match?.[1] ?? ''
}

/** Builds a Shopify cart payload with lines for the given merchandise ids. */
function cartPayload(
  id: string,
  checkoutUrl: string,
  lines: { merchandiseId: string; quantity: number; lineId?: string }[]
) {
  return {
    id,
    checkoutUrl,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    cost: {
      subtotalAmount: { amount: '89.00', currencyCode: 'USD' },
      totalAmount: { amount: '89.00', currencyCode: 'USD' },
      totalTaxAmount: null,
      totalDutyAmount: null,
    },
    discountCodes: [],
    lines: {
      edges: lines.map((l, i) => ({
        node: {
          id: l.lineId ?? `gid://shopify/CartLine/${i + 1}`,
          quantity: l.quantity,
          merchandise: { id: l.merchandiseId, availableForSale: true },
        },
      })),
    },
  }
}

function resetStore() {
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
}

beforeEach(() => {
  resetStore()
  mockFetch.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-shop.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── diffCartLines ──────────────────────────────────────────────────────────

describe('diffCartLines', () => {
  const line = (id: string, merchandiseId: string, quantity: number) => ({
    id,
    quantity,
    merchandise: { id: merchandiseId, availableForSale: true },
  })

  it('issues no mutations when the remote cart already matches', () => {
    const diff = diffCartLines(
      [line('l1', 'v1', 2)],
      [{ merchandiseId: 'v1', quantity: 2 }]
    )
    expect(diff).toEqual({ toAdd: [], toUpdate: [], toRemove: [] })
  })

  it('updates a line in place when only the quantity changed', () => {
    const diff = diffCartLines(
      [line('l1', 'v1', 2)],
      [{ merchandiseId: 'v1', quantity: 5 }]
    )
    expect(diff.toUpdate).toEqual([{ id: 'l1', quantity: 5 }])
    expect(diff.toAdd).toEqual([])
    expect(diff.toRemove).toEqual([])
  })

  it('adds lines that are not in the remote cart yet', () => {
    const diff = diffCartLines(
      [line('l1', 'v1', 1)],
      [
        { merchandiseId: 'v1', quantity: 1 },
        { merchandiseId: 'v2', quantity: 3 },
      ]
    )
    expect(diff.toAdd).toEqual([{ merchandiseId: 'v2', quantity: 3 }])
  })

  it('removes remote lines the customer no longer wants', () => {
    const diff = diffCartLines(
      [line('l1', 'v1', 1), line('l2', 'v2', 1)],
      [{ merchandiseId: 'v1', quantity: 1 }]
    )
    expect(diff.toRemove).toEqual(['l2'])
  })

  it('empties the remote cart when the local bag is empty', () => {
    const diff = diffCartLines([line('l1', 'v1', 1), line('l2', 'v2', 1)], [])
    expect(diff.toRemove).toEqual(['l1', 'l2'])
    expect(diff.toAdd).toEqual([])
  })

  it('collapses duplicate remote lines for the same merchandise', () => {
    const diff = diffCartLines(
      [line('l1', 'v1', 1), line('l2', 'v1', 1)],
      [{ merchandiseId: 'v1', quantity: 4 }]
    )
    expect(diff.toRemove).toEqual(['l2'])
    expect(diff.toUpdate).toEqual([{ id: 'l1', quantity: 4 }])
  })

  it('drops a remote line whose merchandise cannot be identified', () => {
    const diff = diffCartLines(
      [{ id: 'l1', quantity: 1, merchandise: undefined }],
      [{ merchandiseId: 'v1', quantity: 1 }]
    )
    expect(diff.toRemove).toEqual(['l1'])
    expect(diff.toAdd).toEqual([{ merchandiseId: 'v1', quantity: 1 }])
  })

  it('keeps the two sizes of one product as two independent lines', () => {
    const diff = diffCartLines(
      [line('l1', 'ring-size-7', 1)],
      [
        { merchandiseId: 'ring-size-7', quantity: 1 },
        { merchandiseId: 'ring-size-9', quantity: 1 },
      ]
    )
    expect(diff.toRemove).toEqual([])
    expect(diff.toAdd).toEqual([{ merchandiseId: 'ring-size-9', quantity: 1 }])
  })
})

// ── First sync ─────────────────────────────────────────────────────────────

describe('syncWithShopify — first sync (no shopifyCartId)', () => {
  it('calls CreateCart and stores the returned id/checkoutUrl', async () => {
    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as unknown
      expect(operationName(body)).toBe('CreateCart')
      return jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/new-1', 'https://checkout.shopify.com/new-1', [
              { merchandiseId: VARIANT, quantity: 1 },
            ]),
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

  it('stores Shopify totals so the UI stops guessing the subtotal', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: {
              ...cartPayload('gid://shopify/Cart/new-1', 'https://checkout/x', [
                { merchandiseId: VARIANT, quantity: 1 },
              ]),
              cost: {
                subtotalAmount: { amount: '2450000', currencyCode: 'VND' },
                totalAmount: { amount: '2450000', currencyCode: 'VND' },
                totalTaxAmount: null,
                totalDutyAmount: null,
              },
            },
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().totals?.subtotal).toEqual({
      amount: '2450000',
      currencyCode: 'VND',
    })
    expect(useCartStore.getState().currencyCode()).toBe('VND')
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

    const { shopifyCartId, checkoutUrl, items, error } = useCartStore.getState()
    expect(shopifyCartId).toBeNull()
    expect(checkoutUrl).toBeNull()
    expect(items).toHaveLength(1)
    // The failure has to be visible to the customer, not just to the console.
    expect(error?.code).toBe('rejected')
    expect(error?.message).toBeTruthy()
  })

  it('a network failure is caught, isLoading returns to false, local items stay intact', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    const { isLoading, items, checkoutUrl, error } = useCartStore.getState()
    expect(isLoading).toBe(false)
    expect(items).toHaveLength(1)
    expect(checkoutUrl).toBeNull()
    expect(error?.code).toBe('network')
  })

  it('reports not_configured when the proxy says Shopify env vars are missing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'not configured' }, false, 503))

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().error?.code).toBe('not_configured')
  })

  it('does not call Shopify at all when the bag is empty and no cart exists', async () => {
    await useCartStore.getState().syncWithShopify()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── Resync ─────────────────────────────────────────────────────────────────

describe('syncWithShopify — resync with an existing shopifyCartId', () => {
  beforeEach(() => {
    useCartStore.setState({ shopifyCartId: 'gid://shopify/Cart/existing-1' })
  })

  it('adds only the new line, leaving the untouched one alone', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as unknown
      const op = operationName(body)
      calledOps.push(op)

      if (op === 'GetCart') {
        return jsonResponse({
          data: {
            cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/stale', [
              { merchandiseId: VARIANT, quantity: 1, lineId: 'line-a' },
            ]),
          },
        })
      }
      if (op === 'AddToCart') {
        return jsonResponse({
          data: {
            cartLinesAdd: {
              cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/fresh', [
                { merchandiseId: VARIANT, quantity: 1, lineId: 'line-a' },
                { merchandiseId: 'v-size-9', quantity: 1, lineId: 'line-b' },
              ]),
              userErrors: [],
            },
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct)
    useCartStore.getState().addItem(mockProduct, 1, 'v-size-9')
    await useCartStore.getState().syncWithShopify()

    // The previous implementation removed every line and re-added the whole
    // set on every sync. Diffing means an added size costs one mutation.
    expect(calledOps).toEqual(['GetCart', 'AddToCart'])
    expect(calledOps).not.toContain('RemoveFromCart')
    expect(calledOps).not.toContain('CreateCart')
    expect(useCartStore.getState().checkoutUrl).toBe('https://checkout/fresh')
  })

  it('issues no mutations at all when the remote cart already matches', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string))
      calledOps.push(op)
      if (op === 'GetCart') {
        return jsonResponse({
          data: {
            cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/same', [
              { merchandiseId: VARIANT, quantity: 1, lineId: 'line-a' },
            ]),
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(calledOps).toEqual(['GetCart'])
    expect(useCartStore.getState().checkoutUrl).toBe('https://checkout/same')
  })

  it('updates a quantity in place rather than removing and re-adding', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string))
      calledOps.push(op)
      if (op === 'GetCart') {
        return jsonResponse({
          data: {
            cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/stale', [
              { merchandiseId: VARIANT, quantity: 1, lineId: 'line-a' },
            ]),
          },
        })
      }
      if (op === 'UpdateCartLines') {
        return jsonResponse({
          data: {
            cartLinesUpdate: {
              cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/fresh', [
                { merchandiseId: VARIANT, quantity: 4, lineId: 'line-a' },
              ]),
              userErrors: [],
            },
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    useCartStore.getState().addItem(mockProduct, 4)
    await useCartStore.getState().syncWithShopify()

    expect(calledOps).toEqual(['GetCart', 'UpdateCartLines'])
  })

  // The old sync returned early on an empty bag, so removed items stayed in the
  // Shopify cart and any surviving checkout URL still charged for them.
  it('pushes an emptied bag to Shopify instead of leaving stale lines', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string))
      calledOps.push(op)
      if (op === 'GetCart') {
        return jsonResponse({
          data: {
            cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/stale', [
              { merchandiseId: VARIANT, quantity: 1, lineId: 'line-a' },
            ]),
          },
        })
      }
      if (op === 'RemoveFromCart') {
        return jsonResponse({
          data: {
            cartLinesRemove: {
              cart: cartPayload('gid://shopify/Cart/existing-1', 'https://checkout/empty', []),
              userErrors: [],
            },
          },
        })
      }
      throw new Error(`Unexpected operation in test: ${op}`)
    })

    await useCartStore.getState().syncWithShopify()

    expect(calledOps).toEqual(['GetCart', 'RemoveFromCart'])
    expect(useCartStore.getState().checkoutUrl).toBeNull()
  })

  it('falls back to CreateCart when the existing cart is not found/expired', async () => {
    const calledOps: string[] = []

    mockFetch.mockImplementation(async (_url, init) => {
      const op = operationName(JSON.parse((init as RequestInit).body as string))
      calledOps.push(op)

      if (op === 'GetCart') return jsonResponse({ data: { cart: null } })
      if (op === 'CreateCart') {
        return jsonResponse({
          data: {
            cartCreate: {
              cart: cartPayload(
                'gid://shopify/Cart/replacement-1',
                'https://checkout.shopify.com/replacement-1',
                [{ merchandiseId: VARIANT, quantity: 1 }]
              ),
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
    expect(useCartStore.getState().shopifyCartId).toBe('gid://shopify/Cart/replacement-1')
  })

  it('does not orphan the existing cart by creating a second one on a network blip', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(useCartStore.getState().shopifyCartId).toBe('gid://shopify/Cart/existing-1')
    expect(useCartStore.getState().error?.code).toBe('network')
  })
})

// ── Reconciliation of Shopify's own adjustments ────────────────────────────

describe('syncWithShopify — reconciling Shopify adjustments', () => {
  it('reduces a line when Shopify caps it to available stock', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', [
              { merchandiseId: VARIANT, quantity: 2 },
            ]),
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(mockProduct, 5)
    await useCartStore.getState().syncWithShopify()

    const { items, adjustments } = useCartStore.getState()
    expect(items[0].quantity).toBe(2)
    expect(adjustments.join(' ')).toMatch(/limited to 2/i)
  })

  it('drops a line Shopify refused and says so, keeping the rest of the bag', async () => {
    const sized = makeSizedProduct(['7', '9'], { id: 'p-sized' })
    const seven = sized.variants[0]
    const nine = sized.variants[1]

    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', [
              { merchandiseId: seven.id, quantity: 1 },
            ]),
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(sized, 1, seven.id)
    useCartStore.getState().addItem(sized, 1, nine.id)
    await useCartStore.getState().syncWithShopify()

    const { items, adjustments } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].variantId).toBe(seven.id)
    expect(adjustments.join(' ')).toMatch(/sold out/i)
  })

  // Emptying a real bag is unrecoverable, so a zero-line response for a
  // non-empty bag is treated as a bad payload, not as "everything sold out".
  it('refuses to empty the bag when Shopify returns a cart with no lines at all', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', []),
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(mockProduct, 2)
    await useCartStore.getState().syncWithShopify()

    const { items, checkoutUrl, error } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(checkoutUrl).toBeNull()
    expect(error).not.toBeNull()
  })
})

// ── prepareCheckout ────────────────────────────────────────────────────────

describe('prepareCheckout', () => {
  it('returns null without calling Shopify for an empty bag', async () => {
    const url = await useCartStore.getState().prepareCheckout()
    expect(url).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns a freshly synced checkout URL', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/fresh', [
              { merchandiseId: VARIANT, quantity: 1 },
            ]),
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(mockProduct)
    await expect(useCartStore.getState().prepareCheckout()).resolves.toBe(
      'https://checkout/fresh'
    )
  })

  it('returns null rather than a URL when the sync failed', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    useCartStore.getState().addItem(mockProduct)
    await expect(useCartStore.getState().prepareCheckout()).resolves.toBeNull()
  })

  it('does not send the customer to checkout when every line sold out', async () => {
    const sized = makeSizedProduct(['7', '9'], { id: 'p-gone' })
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', [
              { merchandiseId: sized.variants[0].id, quantity: 1 },
            ]),
            userErrors: [],
          },
        },
      })
    )

    useCartStore.getState().addItem(sized, 1, sized.variants[0].id)
    await useCartStore.getState().syncWithShopify()

    // Now everything is gone from the remote cart but one line survives
    // locally; emptying it must block the hand-off rather than open an
    // empty Shopify checkout.
    useCartStore.setState({ items: [], checkoutUrl: 'https://checkout/c1' })
    await expect(useCartStore.getState().prepareCheckout()).resolves.toBeNull()
  })
})

// ── checkoutUrl persistence ────────────────────────────────────────────────

describe('checkoutUrl is never persisted', () => {
  it('is excluded from the persisted partial state', () => {
    const persistOptions = (
      useCartStore as unknown as {
        persist: { getOptions: () => { partialize?: (s: unknown) => object } }
      }
    ).persist.getOptions()

    const partial = persistOptions.partialize?.({
      items: [],
      shopifyCartId: 'gid://shopify/Cart/1',
      checkoutUrl: 'https://checkout/expired',
      totals: { subtotal: { amount: '1', currencyCode: 'USD' } },
    })

    // A checkout URL from a previous visit can point at an expired Shopify
    // cart, which drops the customer out of the funnel with a 404.
    expect(partial).not.toHaveProperty('checkoutUrl')
    expect(partial).not.toHaveProperty('totals')
    expect(partial).toHaveProperty('shopifyCartId')
  })
})

// ── Concurrency ────────────────────────────────────────────────────────────

describe('syncWithShopify — bag edited mid-flight', () => {
  // Shopify's answer only speaks to the lines we asked about. A line added
  // while the request was in flight is not in that answer, and treating its
  // absence as "sold out" would delete a just-added item and say so.
  it('leaves an item added during the sync untouched', async () => {
    let resolveCreate: ((value: Response) => void) | undefined
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveCreate = resolve
        })
    )

    useCartStore.getState().addItem(mockProduct)
    const syncing = useCartStore.getState().syncWithShopify()

    // The customer adds a second size while the first request is open.
    useCartStore.getState().addItem(mockProduct, 1, 'v-added-late')

    resolveCreate?.(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', [
              { merchandiseId: VARIANT, quantity: 1 },
            ]),
            userErrors: [],
          },
        },
      })
    )
    await syncing

    const { items, adjustments } = useCartStore.getState()
    expect(items.map((i) => i.variantId)).toContain('v-added-late')
    expect(items).toHaveLength(2)
    expect(adjustments).toEqual([])
  })

  it('withholds the checkout URL until the newer bag has been synced', async () => {
    let resolveCreate: ((value: Response) => void) | undefined
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveCreate = resolve
        })
    )

    useCartStore.getState().addItem(mockProduct)
    const syncing = useCartStore.getState().syncWithShopify()
    useCartStore.getState().addItem(mockProduct, 1, 'v-added-late')

    resolveCreate?.(
      jsonResponse({
        data: {
          cartCreate: {
            cart: cartPayload('gid://shopify/Cart/c1', 'https://checkout/c1', [
              { merchandiseId: VARIANT, quantity: 1 },
            ]),
            userErrors: [],
          },
        },
      })
    )
    await syncing

    // That URL prices a cart missing the line the customer just added.
    expect(useCartStore.getState().checkoutUrl).toBeNull()
    expect(useCartStore.getState().totals).toBeNull()
  })
})

describe('reconcileCart — cart lookup failures', () => {
  // Swallowing the failure and creating a replacement would orphan a cart the
  // customer still holds, losing its contents and any applied discount.
  it('does not replace the existing cart when the lookup errors', async () => {
    useCartStore.setState({ shopifyCartId: 'gid://shopify/Cart/existing-1' })

    const ops: string[] = []
    mockFetch.mockImplementation(async (_url, init: RequestInit) => {
      ops.push(operationName(JSON.parse(init.body as string)))
      return jsonResponse({ errors: [{ message: 'Throttled' }] })
    })

    useCartStore.getState().addItem(mockProduct)
    await useCartStore.getState().syncWithShopify()

    expect(ops).toEqual(['GetCart'])
    expect(ops).not.toContain('CreateCart')
    expect(useCartStore.getState().shopifyCartId).toBe('gid://shopify/Cart/existing-1')
    expect(useCartStore.getState().error).not.toBeNull()
  })
})
