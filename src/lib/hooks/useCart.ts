'use client'

import { useCartStore } from '@/store/cart'
import type { CartItem, CheckoutError } from '@/store/cart'

// Re-export the main store hook
export { useCartStore }

/**
 * Returns the CartItem for a specific variant ID, or undefined if not in cart.
 *
 * Keyed by variant, not product: a product can have several lines in the bag
 * at once (one per size), so "the" cart item for a product id is not a
 * well-defined question — `find()` would silently return whichever line
 * happened to be added first.
 */
export function useCartItem(variantId: string): CartItem | undefined {
  return useCartStore((state) => state.items.find((item) => item.variantId === variantId))
}

/**
 * Returns whether a given variant is currently in the cart.
 */
export function useIsInCart(variantId: string): boolean {
  return useCartStore((state) => state.items.some((item) => item.variantId === variantId))
}

/**
 * Returns the quantity of a given variant in the cart (0 if not in cart).
 */
export function useCartItemQuantity(variantId: string): number {
  return useCartStore((state) => {
    const item = state.items.find((i) => i.variantId === variantId)
    return item?.quantity ?? 0
  })
}

/**
 * Returns the total quantity of a product in the cart, summed across every
 * variant (size) of it. For the one place that needs a product-level count
 * with no size context — a product card, which shows no size picker.
 */
export function useProductQuantityInCart(productId: string): number {
  return useCartStore((state) =>
    state.items
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0)
  )
}

/**
 * Returns the Shopify checkoutUrl from the cart store, or null if not yet synced.
 */
export function useCheckoutUrl(): string | null {
  return useCartStore((state) => state.checkoutUrl)
}

/**
 * Returns whether the cart is currently syncing with Shopify.
 */
export function useCartIsLoading(): boolean {
  return useCartStore((state) => state.isLoading)
}

/**
 * Returns why the last checkout attempt failed, or null if none has.
 */
export function useCheckoutError(): CheckoutError | null {
  return useCartStore((state) => state.checkoutError)
}
