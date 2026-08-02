'use client'

import { useCartStore } from '@/store/cart'
import type { CartItem, CheckoutError } from '@/store/cart'

// Re-export the main store hook
export { useCartStore }

/**
 * Returns the CartItem for a specific product ID, or undefined if not in cart.
 */
export function useCartItem(productId: string): CartItem | undefined {
  return useCartStore((state) =>
    state.items.find((item) => item.product.id === productId)
  )
}

/**
 * Returns whether a given product is currently in the cart.
 */
export function useIsInCart(productId: string): boolean {
  return useCartStore((state) =>
    state.items.some((item) => item.product.id === productId)
  )
}

/**
 * Returns the quantity of a given product in the cart (0 if not in cart).
 */
export function useCartItemQuantity(productId: string): number {
  return useCartStore((state) => {
    const item = state.items.find((i) => i.product.id === productId)
    return item?.quantity ?? 0
  })
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
