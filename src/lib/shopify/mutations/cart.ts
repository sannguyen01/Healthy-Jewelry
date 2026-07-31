// Healthy Jewelry — Shopify cart GraphQL mutations
import { CART_FRAGMENT } from '../queries/cart'

export const CREATE_CART = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation CreateCart($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const ADD_TO_CART = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const UPDATE_CART_LINES = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation UpdateCartLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const REMOVE_FROM_CART = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation RemoveFromCart($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`

// Applies (or clears, with an empty array) the cart's discount codes. Shopify
// validates them server-side and echoes back `applicable: false` for a code
// that exists but doesn't apply to this cart — which is a different message to
// the customer than "no such code", so the UI distinguishes the two.
export const UPDATE_CART_DISCOUNT_CODES = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation UpdateCartDiscountCodes($cartId: ID!, $discountCodes: [String!]) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`

// Sets the buyer's country so Shopify prices the cart in the right presentment
// currency and can compute duties before checkout. Without this the cart is
// priced against the shop's default market, which is the wrong number for any
// customer outside it.
export const UPDATE_CART_BUYER_IDENTITY = /* GraphQL */ `
  ${CART_FRAGMENT}
  mutation UpdateCartBuyerIdentity($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ...CartFragment
      }
      userErrors {
        field
        message
      }
    }
  }
`
