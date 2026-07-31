'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { shopifyConfig } from '@/config/shopify'
import type { HJProduct, SelectedOption, Money, CartDiscountCode } from '@/lib/shopify/types'
import {
  CREATE_CART,
  ADD_TO_CART,
  UPDATE_CART_LINES,
  REMOVE_FROM_CART,
  UPDATE_CART_DISCOUNT_CODES,
} from '@/lib/shopify/mutations/cart'
import { GET_CART } from '@/lib/shopify/queries/cart'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CartItem {
  product: HJProduct
  quantity: number
  // The specific Shopify variant (e.g. a size) this line represents. This — not
  // the product id — is the identity of a cart line: two sizes of the same ring
  // are two different things to buy, two different SKUs, and two different
  // lines. Keying by product id silently merged them and shipped the wrong size.
  variantId: string
  // Snapshotted at add time so the bag can show "Size 9" without re-fetching,
  // and so the line still renders correctly if the product is later edited.
  variantTitle: string
  selectedOptions: SelectedOption[]
  // Unit price of this specific variant, which can differ from the product's
  // "from" price (a size 12 band uses more metal). Falls back to the product
  // price when a variant carries none.
  unitPrice: string
}

// Maximum units of a single variant. Shopify enforces its own inventory limit
// server-side; this is a client-side sanity bound so a stuck "+" button can't
// push a 900-unit line at the API.
export const MAX_LINE_QUANTITY = 20

export type CartErrorCode =
  | 'not_configured' // Shopify env vars absent — local-only cart
  | 'network' // request never reached Shopify
  | 'rejected' // Shopify returned userErrors
  | 'unavailable' // one or more lines are out of stock
  | 'unknown'

export interface CartError {
  code: CartErrorCode
  message: string
}

// Customer-facing copy. Cart failures used to be console.warn only, which left
// the checkout button bouncing between /cart and /checkout with no explanation.
const ERROR_MESSAGES: Record<CartErrorCode, string> = {
  not_configured: 'Checkout is not available right now. Please contact us to complete your order.',
  network: 'We could not reach our checkout service. Check your connection and try again.',
  rejected: 'Something in your bag could not be reserved. Review the items below and try again.',
  unavailable: 'An item in your bag just sold out. Remove it to continue to checkout.',
  unknown: 'Something went wrong preparing your checkout. Please try again.',
}

export function cartErrorMessage(code: CartErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown
}

interface ShopifyCartLineNode {
  id: string
  quantity: number
  merchandise?: {
    id?: string
    availableForSale?: boolean
  }
}

interface ShopifyCartPayload {
  id: string
  checkoutUrl: string
  totalQuantity?: number
  lines: { edges: { node: ShopifyCartLineNode }[] }
  cost?: {
    totalAmount: Money
    subtotalAmount: Money
    totalTaxAmount: Money | null
    totalDutyAmount: Money | null
  }
  discountCodes?: CartDiscountCode[]
}

interface ShopifyUserError {
  field: string[] | null
  message: string
}

interface ShopifyMutationResult {
  cart?: ShopifyCartPayload | null
  userErrors?: ShopifyUserError[]
}

class CartSyncError extends Error {
  constructor(
    public readonly code: CartErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'CartSyncError'
  }
}

// ── Transport ──────────────────────────────────────────────────────────────

// Every Storefront call goes through our own /api/shopify proxy so the access
// token is never shipped to the browser. Unlike the previous version this
// distinguishes transport failure from GraphQL failure, because the two need
// different messages and only one of them is worth retrying.
async function postShopify<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T | undefined> {
  let res: Response
  try {
    res = await fetch('/api/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new CartSyncError('network')
  }

  if (!res.ok) {
    // 503 is the proxy telling us the store env vars are missing.
    throw new CartSyncError(res.status === 503 ? 'not_configured' : 'network')
  }

  let body: { data?: T; errors?: { message: string }[] }
  try {
    body = (await res.json()) as typeof body
  } catch {
    throw new CartSyncError('unknown')
  }

  if (body.errors && body.errors.length > 0) {
    throw new CartSyncError('unknown', body.errors.map((e) => e.message).join('; '))
  }

  return body.data
}

// Unwraps a `{ cart, userErrors }` mutation payload, converting Shopify's
// userErrors into a typed throw so callers don't each re-implement the check.
function unwrapMutation(
  result: ShopifyMutationResult | undefined,
  operation: string
): ShopifyCartPayload | null {
  const userErrors = result?.userErrors ?? []
  if (userErrors.length > 0) {
    console.warn(`[HJ] ${operation} userErrors:`, userErrors)
    throw new CartSyncError('rejected', userErrors.map((e) => e.message).join('; '))
  }
  return result?.cart ?? null
}

// ── Line reconciliation ────────────────────────────────────────────────────

export interface DesiredLine {
  merchandiseId: string
  quantity: number
}

export interface LineDiff {
  toAdd: DesiredLine[]
  toUpdate: { id: string; quantity: number }[]
  toRemove: string[]
}

/**
 * Computes the minimal set of mutations that turns the remote cart into the
 * desired one.
 *
 * The previous implementation removed every remote line and re-added the whole
 * set on every sync. That is destructive (a failure between the two calls left
 * the customer with an empty Shopify cart), it churns line ids on every
 * keystroke of the quantity stepper, and it discards Shopify's own line state.
 * Diffing instead means an unchanged bag issues zero mutations.
 *
 * Exported for direct unit testing — this is the piece most worth pinning down.
 */
export function diffCartLines(
  remoteLines: ShopifyCartLineNode[],
  desired: DesiredLine[]
): LineDiff {
  const desiredByMerch = new Map(desired.map((l) => [l.merchandiseId, l.quantity]))

  const toUpdate: { id: string; quantity: number }[] = []
  const toRemove: string[] = []
  const seen = new Set<string>()

  for (const line of remoteLines) {
    const merchId = line.merchandise?.id
    // A line whose merchandise we can't identify can't be reconciled; drop it
    // rather than leave an unknown item in the customer's checkout.
    if (!merchId) {
      toRemove.push(line.id)
      continue
    }

    const wanted = desiredByMerch.get(merchId)

    if (wanted === undefined) {
      toRemove.push(line.id)
      continue
    }

    // Shopify can return duplicate lines for the same merchandise (e.g. added
    // through two different sessions). Keep the first, remove the rest, and let
    // the kept one carry the full desired quantity.
    if (seen.has(merchId)) {
      toRemove.push(line.id)
      continue
    }
    seen.add(merchId)

    if (line.quantity !== wanted) {
      toUpdate.push({ id: line.id, quantity: wanted })
    }
  }

  const toAdd = desired.filter((l) => !seen.has(l.merchandiseId))

  return { toAdd, toUpdate, toRemove }
}

// ── Store shape ────────────────────────────────────────────────────────────

export interface CartTotals {
  subtotal: Money
  total: Money
  tax: Money | null
  duty: Money | null
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  shopifyCartId: string | null
  // Deliberately NOT persisted. Shopify carts expire (~10 days) and a checkout
  // URL from a previous visit can 404 the customer straight out of the funnel.
  // It is always re-derived from a live sync before we navigate.
  checkoutUrl: string | null
  isLoading: boolean
  error: CartError | null
  // Authoritative pricing from Shopify once synced. Until then the UI falls
  // back to the locally computed subtotal, clearly labelled as an estimate.
  totals: CartTotals | null
  discountCodes: CartDiscountCode[]
  // Human-readable notes about changes Shopify made to the bag on our behalf
  // (a line capped to available stock, a sold-out line dropped).
  adjustments: string[]

  // Mutations — all keyed by variantId, which is the identity of a cart line
  addItem: (product: HJProduct, quantity?: number, variantId?: string) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
  clearError: () => void
  dismissAdjustments: () => void

  // Drawer controls
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void

  // Shopify sync
  syncWithShopify: () => Promise<void>
  /** Syncs, then returns a freshly-validated checkout URL (null on failure). */
  prepareCheckout: () => Promise<string | null>
  applyDiscountCode: (code: string) => Promise<boolean>
  removeDiscountCode: (code: string) => Promise<void>

  // Computed selectors (called as functions to stay reactive with zustand)
  totalItems: () => number
  totalPrice: () => number
  currencyCode: () => string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)))
}

function resolveVariant(product: HJProduct, variantId?: string) {
  const id = variantId ?? product.defaultVariantId
  const variant = product.variants.find((v) => v.id === id)
  return { id, variant }
}

function toTotals(cost: ShopifyCartPayload['cost']): CartTotals | null {
  if (!cost) return null
  return {
    subtotal: cost.subtotalAmount,
    total: cost.totalAmount,
    tax: cost.totalTaxAmount,
    duty: cost.totalDutyAmount,
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      shopifyCartId: null,
      checkoutUrl: null,
      isLoading: false,
      error: null,
      totals: null,
      discountCodes: [],
      adjustments: [],

      addItem: (product, quantity = 1, variantId) => {
        const { id: resolvedVariantId, variant } = resolveVariant(product, variantId)

        // Refuse to put an unbuyable variant in the bag. Shopify would reject it
        // at checkout anyway; failing here means the customer finds out on the
        // product page, where they can still pick another size.
        if (variant && !variant.availableForSale) {
          set({ error: { code: 'unavailable', message: cartErrorMessage('unavailable') } })
          return
        }

        set((state) => {
          const existing = state.items.find((item) => item.variantId === resolvedVariantId)

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.variantId === resolvedVariantId
                  ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
                  : item
              ),
              // Any cart-content change invalidates the synced checkout URL and
              // Shopify's totals, so neither can be shown stale.
              checkoutUrl: null,
              totals: null,
              error: null,
            }
          }

          const newItem: CartItem = {
            product,
            quantity: clampQuantity(quantity),
            variantId: resolvedVariantId,
            variantTitle: variant?.title ?? '',
            selectedOptions: variant?.selectedOptions ?? [],
            unitPrice: variant?.price?.amount ?? product.price,
          }

          return {
            items: [...state.items, newItem],
            checkoutUrl: null,
            totals: null,
            error: null,
          }
        })
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((item) => item.variantId !== variantId),
          checkoutUrl: null,
          totals: null,
          error: null,
        }))
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.variantId === variantId ? { ...item, quantity: clampQuantity(quantity) } : item
          ),
          checkoutUrl: null,
          totals: null,
          error: null,
        }))
      },

      clearCart: () =>
        set({
          items: [],
          shopifyCartId: null,
          checkoutUrl: null,
          totals: null,
          discountCodes: [],
          adjustments: [],
          error: null,
        }),

      clearError: () => set({ error: null }),
      dismissAdjustments: () => set({ adjustments: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      syncWithShopify: async () => {
        if (!shopifyConfig.storeDomain) {
          set({ error: { code: 'not_configured', message: cartErrorMessage('not_configured') } })
          return
        }

        const { items, shopifyCartId } = get()

        // An emptied bag still has to be pushed. Returning early here — as the
        // previous version did — left the removed items sitting in the Shopify
        // cart, so a surviving checkout URL charged for things the customer had
        // already taken out.
        const desired: DesiredLine[] = items.map((item) => ({
          merchandiseId: item.variantId,
          quantity: item.quantity,
        }))

        if (desired.length === 0 && !shopifyCartId) {
          set({ checkoutUrl: null, totals: null, error: null })
          return
        }

        set({ isLoading: true, error: null })

        try {
          const cart = await reconcileCart(shopifyCartId, desired)

          if (!cart) {
            set({ isLoading: false })
            return
          }

          // Reconcile Shopify's answer back into local state. Shopify silently
          // caps a line to available stock and drops lines that sold out
          // mid-session; without reading the result back, the bag would keep
          // showing quantities the customer will never be charged for.
          const remoteByMerch = new Map(
            cart.lines.edges
              .map((e) => e.node)
              .filter((n) => n.merchandise?.id)
              .map((n) => [n.merchandise!.id as string, n])
          )

          // Guard against wiping a real bag on an anomalous response. A cart
          // that comes back with no lines at all when we asked for several is
          // far more likely to be a truncated payload or a changed fragment
          // than every item selling out in the same instant — and emptying the
          // customer's bag on a bad parse is unrecoverable. Trust per-line
          // absence only when the cart clearly contains other lines.
          const trustLineAbsence = remoteByMerch.size > 0

          if (!trustLineAbsence && desired.length > 0) {
            set({
              shopifyCartId: cart.id,
              checkoutUrl: null,
              isLoading: false,
              error: { code: 'unknown', message: cartErrorMessage('unknown') },
            })
            console.warn('[HJ] Shopify returned a cart with no lines for a non-empty bag')
            return
          }

          const adjustments: string[] = []
          const reconciledItems: CartItem[] = []

          // Shopify's answer only speaks to the lines we asked about. A line
          // the customer added while this request was in flight is not in
          // `desired`, so its absence from the response means nothing — judging
          // it here would delete a just-added item and tell the customer it had
          // sold out. Those lines pass through untouched and the next sync
          // reconciles them.
          const requested = new Set(desired.map((l) => l.merchandiseId))
          let addedDuringSync = false

          for (const item of get().items) {
            if (!requested.has(item.variantId)) {
              reconciledItems.push(item)
              addedDuringSync = true
              continue
            }

            const remote = remoteByMerch.get(item.variantId)
            if (!remote) {
              adjustments.push(`${item.product.title} sold out and was removed from your bag.`)
              continue
            }
            if (remote.quantity !== item.quantity) {
              adjustments.push(
                `${item.product.title} is limited to ${remote.quantity} — your bag was updated.`
              )
              reconciledItems.push({ ...item, quantity: remote.quantity })
              continue
            }
            reconciledItems.push(item)
          }

          set({
            items: reconciledItems,
            shopifyCartId: cart.id,
            // A cart that changed mid-flight has not been priced or reserved by
            // Shopify yet, so neither its checkout URL nor its totals describe
            // what the customer is now holding.
            checkoutUrl:
              reconciledItems.length > 0 && !addedDuringSync ? cart.checkoutUrl : null,
            totals: addedDuringSync ? null : toTotals(cart.cost),
            discountCodes: cart.discountCodes ?? [],
            adjustments,
            isLoading: false,
            error: null,
          })
        } catch (err) {
          const code = err instanceof CartSyncError ? err.code : 'unknown'
          console.warn('[HJ] Shopify cart sync failed — local cart still active', err)
          set({
            isLoading: false,
            checkoutUrl: null,
            error: { code, message: cartErrorMessage(code) },
          })
        }
      },

      prepareCheckout: async () => {
        const { items } = get()
        if (items.length === 0) return null

        await get().syncWithShopify()

        const state = get()
        // A sync that dropped every line (everything sold out) must not send the
        // customer to an empty Shopify checkout.
        if (state.items.length === 0) {
          set({ error: { code: 'unavailable', message: cartErrorMessage('unavailable') } })
          return null
        }
        return state.checkoutUrl
      },

      applyDiscountCode: async (code) => {
        const trimmed = code.trim()
        if (!trimmed) return false

        let cartId = get().shopifyCartId
        if (!cartId) {
          await get().syncWithShopify()
          cartId = get().shopifyCartId
          if (!cartId) return false
        }

        const existing = get().discountCodes.map((d) => d.code)
        const next = existing.includes(trimmed) ? existing : [...existing, trimmed]

        set({ isLoading: true, error: null })
        try {
          const data = await postShopify<{ cartDiscountCodesUpdate: ShopifyMutationResult }>(
            UPDATE_CART_DISCOUNT_CODES,
            { cartId, discountCodes: next }
          )
          const cart = unwrapMutation(data?.cartDiscountCodesUpdate, 'cartDiscountCodesUpdate')
          if (!cart) {
            set({ isLoading: false })
            return false
          }

          const codes = cart.discountCodes ?? []
          set({
            discountCodes: codes,
            totals: toTotals(cart.cost),
            checkoutUrl: cart.checkoutUrl,
            isLoading: false,
          })

          // Shopify echoes back a code it recognises but cannot apply with
          // `applicable: false` — a different thing to tell the customer than
          // "that code doesn't exist", and both differ from success.
          return codes.some((d) => d.code === trimmed && d.applicable)
        } catch (err) {
          const code = err instanceof CartSyncError ? err.code : 'unknown'
          set({ isLoading: false, error: { code, message: cartErrorMessage(code) } })
          return false
        }
      },

      removeDiscountCode: async (code) => {
        const cartId = get().shopifyCartId
        if (!cartId) return

        const next = get()
          .discountCodes.map((d) => d.code)
          .filter((c) => c !== code)

        set({ isLoading: true })
        try {
          const data = await postShopify<{ cartDiscountCodesUpdate: ShopifyMutationResult }>(
            UPDATE_CART_DISCOUNT_CODES,
            { cartId, discountCodes: next }
          )
          const cart = unwrapMutation(data?.cartDiscountCodesUpdate, 'cartDiscountCodesUpdate')
          set({
            discountCodes: cart?.discountCodes ?? [],
            totals: toTotals(cart?.cost),
            isLoading: false,
          })
        } catch {
          set({ isLoading: false })
        }
      },

      totalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0)
      },

      totalPrice: () => {
        return get().items.reduce((sum, item) => {
          const price = parseFloat(item.unitPrice ?? item.product.price)
          return sum + (Number.isFinite(price) ? price : 0) * item.quantity
        }, 0)
      },

      // Currency of the bag. Taken from Shopify's own totals once synced, and
      // from the products themselves before that. Never assumed.
      currencyCode: () => {
        const state = get()
        return (
          state.totals?.total?.currencyCode ??
          state.items[0]?.product?.currencyCode ??
          'USD'
        )
      },
    }),
    {
      name: 'hj-cart',
      version: 2,
      storage: createJSONStorage(() => {
        try {
          localStorage.setItem('__hj_test__', '1')
          localStorage.removeItem('__hj_test__')
          return localStorage
        } catch {
          // Safari private browsing throws on localStorage access
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
        }
      }),
      // v1 keyed lines by product id and had no variant metadata. Rather than
      // guess which size a returning customer meant, drop the persisted bag —
      // an empty bag is recoverable, a wrong-size order is not.
      migrate: (persisted, version) => {
        if (version < 2) {
          return { items: [], shopifyCartId: null }
        }
        return persisted as { items: CartItem[]; shopifyCartId: string | null }
      },
      // checkoutUrl and totals are deliberately excluded: both go stale, and a
      // stale checkout URL sends the customer to an expired Shopify cart.
      partialize: (state) => ({
        items: state.items,
        shopifyCartId: state.shopifyCartId,
      }),
    }
  )
)

// ── Cart reconciliation ────────────────────────────────────────────────────

// Brings the remote cart in line with `desired`, creating one if needed.
// Kept outside the store so it can be unit-tested against a mocked transport
// without standing up the whole zustand store.
async function reconcileCart(
  cartId: string | null,
  desired: DesiredLine[]
): Promise<ShopifyCartPayload | null> {
  if (!cartId) {
    if (desired.length === 0) return null
    return createCart(desired)
  }

  // Only a successful query that comes back with `cart: null` means the cart is
  // gone — that is how Shopify reports an expired or completed one. Any thrown
  // error is a failure to find out, which is a different thing: swallowing it
  // and creating a replacement would orphan a cart the customer still has,
  // losing whatever is in it along with any discount already applied.
  const data = await postShopify<{ cart: ShopifyCartPayload | null }>(GET_CART, { cartId })
  const existing = data?.cart ?? null

  if (!existing) {
    if (desired.length === 0) return null
    return createCart(desired)
  }

  const remoteLines = existing.lines.edges.map((e) => e.node)
  const { toAdd, toUpdate, toRemove } = diffCartLines(remoteLines, desired)

  let cart: ShopifyCartPayload | null = existing

  // Order matters: update and add before removing, so a failure part-way
  // through never leaves the customer looking at an empty cart.
  if (toUpdate.length > 0) {
    const data = await postShopify<{ cartLinesUpdate: ShopifyMutationResult }>(UPDATE_CART_LINES, {
      cartId,
      lines: toUpdate,
    })
    cart = unwrapMutation(data?.cartLinesUpdate, 'cartLinesUpdate') ?? cart
  }

  if (toAdd.length > 0) {
    const data = await postShopify<{ cartLinesAdd: ShopifyMutationResult }>(ADD_TO_CART, {
      cartId,
      lines: toAdd,
    })
    cart = unwrapMutation(data?.cartLinesAdd, 'cartLinesAdd') ?? cart
  }

  if (toRemove.length > 0) {
    const data = await postShopify<{ cartLinesRemove: ShopifyMutationResult }>(REMOVE_FROM_CART, {
      cartId,
      lineIds: toRemove,
    })
    cart = unwrapMutation(data?.cartLinesRemove, 'cartLinesRemove') ?? cart
  }

  return cart
}

async function createCart(lines: DesiredLine[]): Promise<ShopifyCartPayload | null> {
  const data = await postShopify<{ cartCreate: ShopifyMutationResult }>(CREATE_CART, { lines })
  return unwrapMutation(data?.cartCreate, 'cartCreate')
}

// ── CartProvider ───────────────────────────────────────────────────────────

// Thin no-op wrapper so layout.tsx can import CartProvider.
// Zustand stores are self-contained; no context provider is needed,
// but exporting CartProvider keeps the layout import clean.
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
