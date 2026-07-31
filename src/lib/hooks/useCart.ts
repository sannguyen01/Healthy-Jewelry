'use client'

import { useCartStore } from '@/store/cart'
import type { CartItem, CartError, CartTotals } from '@/store/cart'
import type { CartDiscountCode } from '@/lib/shopify/types'

// Re-export the main store hook
export { useCartStore }

/**
 * Returns the CartItem for a specific variant, or undefined if not in cart.
 *
 * Cart lines are identified by variant, not product: a size 7 and a size 9 of
 * the same ring are two separate lines.
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
 * Returns the total quantity of a product across all of its variants — the
 * number to show somewhere with no size context, such as a product card.
 */
export function useProductQuantityInCart(productId: string): number {
  return useCartStore((state) =>
    state.items.filter((i) => i.product.id === productId).reduce((sum, i) => sum + i.quantity, 0)
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
 * Returns the current cart error, or null when the cart is healthy.
 */
export function useCartError(): CartError | null {
  return useCartStore((state) => state.error)
}

/**
 * Returns Shopify's authoritative cart totals once synced, or null before that.
 * Callers should fall back to the locally computed subtotal and label it as an
 * estimate rather than presenting a total Shopify has not confirmed.
 */
export function useCartTotals(): CartTotals | null {
  return useCartStore((state) => state.totals)
}

/**
 * Returns the currency the bag is priced in.
 */
export function useCartCurrency(): string {
  return useCartStore((state) => state.currencyCode())
}

/**
 * Returns discount codes currently applied to the Shopify cart.
 */
export function useCartDiscountCodes(): CartDiscountCode[] {
  return useCartStore((state) => state.discountCodes)
}

/**
 * Returns notes about changes Shopify made to the bag (stock caps, sold-out
 * lines removed) that the customer has not dismissed yet.
 */
export function useCartAdjustments(): string[] {
  return useCartStore((state) => state.adjustments)
}
