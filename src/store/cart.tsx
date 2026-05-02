'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { HJProduct } from '@/lib/shopify/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CartItem {
  product: HJProduct
  quantity: number
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean

  // Mutations
  addItem: (product: HJProduct, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void

  // Drawer controls
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void

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

      clearCart: () => set({ items: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

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
      // Only persist cart items; do not persist UI open/close state
      partialize: (state) => ({ items: state.items }),
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
