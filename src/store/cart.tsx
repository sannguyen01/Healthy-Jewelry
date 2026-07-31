'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { shopifyConfig } from '@/config/shopify'
import type { HJProduct } from '@/lib/shopify/types'

// ── Types ──────────────────────────────────────────────────────────────────

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
              // checkout URL so the checkout page never redirects to a stale cart.
              checkoutUrl: null,
            }
          }
          return {
            items: [...state.items, { product, quantity, variantId: resolvedVariantId }],
            checkoutUrl: null,
          }
        })
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
          checkoutUrl: null,
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
        }))
      },

      clearCart: () => set({ items: [], shopifyCartId: null, checkoutUrl: null }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      syncWithShopify: async () => {
        if (!shopifyConfig.storeDomain) {
          return
        }

        const { items, shopifyCartId } = get()
        if (items.length === 0) {
          return
        }

        set({ isLoading: true })

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
            set({ shopifyCartId: cart.id, checkoutUrl: cart.checkoutUrl })
          }
        } catch (err) {
          console.warn('[HJ] Shopify cart sync failed — local cart still active', err)
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
      // Persist cart items, Shopify cart ID, and checkoutUrl; do not persist transient UI state
      partialize: (state) => ({
        items: state.items,
        shopifyCartId: state.shopifyCartId,
        checkoutUrl: state.checkoutUrl,
      }),
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
