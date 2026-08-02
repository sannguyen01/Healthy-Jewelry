'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { shopifyConfig } from '@/config/shopify'
import { isPlaceholderVariantId } from '@/lib/shopify/variant-id'
import type { HJProduct } from '@/lib/shopify/types'

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Why a checkout could not be started.
 *
 * Every one of these used to collapse into a `console.warn` and a null
 * `checkoutUrl`, so the UI had no way to say anything more useful than a
 * spinner — which is exactly what customers saw. The reason has to leave this
 * function for anything upstream to respond honestly.
 *
 * - `not-configured`    — no store domain in the bundle. NEXT_PUBLIC_* values
 *                         are inlined at build time, so this means the variable
 *                         was missing *when the deployment was built*.
 * - `placeholder-catalog` — the cart holds ids from the static fallback catalog,
 *                         so Shopify is unreachable or unauthenticated and the
 *                         products on screen are not real Shopify products.
 * - `network`           — the request to our own /api/shopify proxy failed.
 * - `shopify-error`     — Shopify answered, and refused.
 */
export type CheckoutError =
  | 'not-configured'
  | 'placeholder-catalog'
  | 'network'
  | 'shopify-error'

export interface CartItem {
  product: HJProduct
  quantity: number
  // The specific Shopify variant (e.g. a size) this line represents.
  // Falls back to the product's default variant for unsized products.
  variantId: string
}

interface ShopifyCartPayload {
  id: string
  checkoutUrl: string
  lines: { edges: { node: { id: string } }[] }
}

interface ShopifyMutationResult {
  cart?: ShopifyCartPayload
  userErrors?: { field: string[]; message: string }[]
}

// `operation` is a persisted-query key, not GraphQL text — the server
// resolves it to its own literal query string (see api/shopify/route.ts),
// so the client can never influence an operation's selection set or args.
async function postShopify<T>(
  operation: string,
  variables: Record<string, unknown>
): Promise<{ data?: T }> {
  const res = await fetch('/api/shopify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, variables }),
  })
  return (await res.json()) as { data?: T }
}

type SyncLine = { merchandiseId: string; quantity: number }

// Reconciles an existing Shopify cart to match the current local lines by
// removing everything then re-adding the fresh set. Returns null when the
// cart is gone/expired or a mutation reports a userError, in which case the
// caller falls back to creating a brand new cart.
async function syncExistingCart(
  cartId: string,
  lines: SyncLine[]
): Promise<ShopifyCartPayload | null> {
  const cartResult = await postShopify<{ cart: ShopifyCartPayload | null }>('GetCart', { cartId })
  const existingCart = cartResult.data?.cart
  if (!existingCart) {
    return null
  }

  const existingLineIds = existingCart.lines.edges.map((e) => e.node.id)
  if (existingLineIds.length > 0) {
    const removeResult = await postShopify<{ cartLinesRemove: ShopifyMutationResult }>(
      'RemoveFromCart',
      { cartId, lineIds: existingLineIds }
    )
    const removeErrors = removeResult.data?.cartLinesRemove?.userErrors
    if (removeErrors && removeErrors.length > 0) {
      console.warn('[HJ] cartLinesRemove returned userErrors:', removeErrors)
      return null
    }
  }

  const addResult = await postShopify<{ cartLinesAdd: ShopifyMutationResult }>('AddToCart', {
    cartId,
    lines,
  })
  const added = addResult.data?.cartLinesAdd
  if (added?.userErrors && added.userErrors.length > 0) {
    console.warn('[HJ] cartLinesAdd returned userErrors:', added.userErrors)
    return null
  }
  return added?.cart ?? null
}

async function createShopifyCart(lines: SyncLine[]): Promise<ShopifyCartPayload | null> {
  const createResult = await postShopify<{ cartCreate: ShopifyMutationResult }>('CreateCart', {
    lines,
  })
  const created = createResult.data?.cartCreate
  if (created?.userErrors && created.userErrors.length > 0) {
    console.warn('[HJ] cartCreate returned userErrors:', created.userErrors)
    return null
  }
  return created?.cart ?? null
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  shopifyCartId: string | null
  checkoutUrl: string | null
  isLoading: boolean
  /** Null until a sync fails. Cleared at the start of each attempt. */
  checkoutError: CheckoutError | null
  /**
   * False until the persisted bag has been read back from localStorage.
   *
   * Rehydration is asynchronous, so on first render `items` is always `[]`
   * regardless of what the customer actually has. Anything that branches on an
   * empty bag — redirects especially — must wait for this, or it acts on a
   * state that was never true.
   */
  hasHydrated: boolean

  // Mutations
  addItem: (product: HJProduct, quantity?: number, variantId?: string) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void

  // Drawer controls
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void

  // Shopify sync
  syncWithShopify: () => Promise<void>

  // Hydration
  setHasHydrated: (value: boolean) => void

  // Computed selectors (called as functions to stay reactive with zustand)
  totalItems: () => number
  totalPrice: () => number
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
      checkoutError: null,
      hasHydrated: false,

      setHasHydrated: (value) => set({ hasHydrated: value }),

      addItem: (product, quantity = 1, variantId) => {
        const resolvedVariantId = variantId ?? product.defaultVariantId
        set((state) => {
          const existing = state.items.find((item) => item.product.id === product.id)
          if (existing) {
            // Same product already in the bag — merge quantity, keep the size
            // originally selected rather than silently swapping it.
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
              // A cart-content change invalidates any previously-synced
              // checkout URL so the checkout page never redirects to a stale
              // cart — and clears any error from the previous attempt, which
              // may no longer apply to these lines.
              checkoutUrl: null,
              checkoutError: null,
            }
          }
          return {
            items: [...state.items, { product, quantity, variantId: resolvedVariantId }],
            checkoutUrl: null,
            checkoutError: null,
          }
        })
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
          checkoutUrl: null,
          checkoutError: null,
        }))
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          ),
          checkoutUrl: null,
          checkoutError: null,
        }))
      },

      clearCart: () =>
        set({ items: [], shopifyCartId: null, checkoutUrl: null, checkoutError: null }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      syncWithShopify: async () => {
        if (!shopifyConfig.storeDomain) {
          // NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN is inlined at build time, so an
          // empty value here means it was absent when this deployment was
          // built — setting it in the dashboard afterwards changes nothing
          // until a rebuild.
          set({ checkoutError: 'not-configured' })
          return
        }

        const { items, shopifyCartId } = get()
        if (items.length === 0) {
          return
        }

        // A cart built from the static fallback catalog can never check out:
        // Shopify does not know these ids. Failing here names the cause;
        // sending the request would return an opaque userError instead.
        if (items.some((item) => isPlaceholderVariantId(item.variantId))) {
          set({ checkoutError: 'placeholder-catalog' })
          return
        }

        set({ isLoading: true, checkoutError: null })

        try {
          const lines: SyncLine[] = items.map((item) => ({
            merchandiseId: item.variantId,
            quantity: item.quantity,
          }))

          // Reuse the existing Shopify cart (same id, so abandoned-checkout
          // tracking stays coherent) when one exists; only create a new cart
          // when there isn't one yet, or the existing one turned out to be
          // gone/expired on Shopify's side.
          const cart = shopifyCartId
            ? ((await syncExistingCart(shopifyCartId, lines)) ?? (await createShopifyCart(lines)))
            : await createShopifyCart(lines)

          if (cart) {
            set({ shopifyCartId: cart.id, checkoutUrl: cart.checkoutUrl, checkoutError: null })
          } else {
            // Shopify answered but produced no cart — a userError on create or
            // on the re-add path. Already logged in detail by the helpers.
            set({ checkoutError: 'shopify-error' })
          }
        } catch (err) {
          console.warn('[HJ] Shopify cart sync failed — local cart still active', err)
          set({ checkoutError: 'network' })
        } finally {
          set({ isLoading: false })
        }
      },

      totalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0)
      },

      totalPrice: () => {
        return get().items.reduce((sum, item) => {
          const price = parseFloat(item.product.price)
          return sum + price * item.quantity
        }, 0)
      },
    }),
    {
      name: 'hj-cart',
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
      // Persist cart items, Shopify cart ID, and checkoutUrl; do not persist
      // transient UI state, error reasons, or the hydration flag itself.
      partialize: (state) => ({
        items: state.items,
        shopifyCartId: state.shopifyCartId,
        checkoutUrl: state.checkoutUrl,
      }),
      // Rehydration is async. Until it finishes, `items` is [] for every
      // visitor — including ones with a full bag — so consumers that redirect
      // on an empty bag need to know the difference between "empty" and "not
      // read yet". Runs on error too: a storage failure must not leave the app
      // waiting forever for a hydration that will never arrive.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[HJ] cart rehydration failed', error)
        }
        state?.setHasHydrated(true)
      },
    }
  )
)

// ── CartProvider ───────────────────────────────────────────────────────────

// Thin no-op wrapper so layout.tsx can import CartProvider.
// Zustand stores are self-contained; no context provider is needed,
// but exporting CartProvider keeps the layout import clean.
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
