'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { HJProduct } from '@/lib/shopify/types'
import { CREATE_CART } from '@/lib/shopify/mutations/cart'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CartItem {
  product: HJProduct
  quantity: number
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  shopifyCartId: string | null
  checkoutUrl: string | null
  isLoading: boolean

  // Mutations
  addItem: (product: HJProduct, quantity?: number) => void
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

      addItem: (product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((item) => item.product.id === product.id)
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            }
          }
          return { items: [...state.items, { product, quantity }] }
        })
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
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
        }))
      },

      clearCart: () => set({ items: [], shopifyCartId: null, checkoutUrl: null }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      syncWithShopify: async () => {
        const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
        if (!domain) {
          return
        }

        const { items } = get()
        if (items.length === 0) {
          return
        }

        set({ isLoading: true })

        try {
          const lines = items.map((item) => ({
            merchandiseId: item.product.id,
            quantity: item.quantity,
          }))

          const res = await fetch('/api/shopify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: CREATE_CART,
              variables: { lines },
            }),
          })

          const data = (await res.json()) as {
            data?: { cartCreate?: { cart?: { id: string; checkoutUrl: string } } }
          }

          const cart = data?.data?.cartCreate?.cart
          if (cart) {
            set({
              shopifyCartId: cart.id,
              checkoutUrl: cart.checkoutUrl,
            })
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
      storage: createJSONStorage(() => localStorage),
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
