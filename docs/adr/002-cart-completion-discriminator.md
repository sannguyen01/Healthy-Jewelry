# 002 — Telling a completed order apart from an expired cart

## Context

Shopify **deletes a cart when an order is created from it**, and exposes no completion
flag. From the storefront's side, a customer who has just paid and a customer whose cart
expired look identical: the cart ID no longer resolves.

The original code collapsed both into "rebuild the cart silently". For an expired cart
that is correct and invisible. For a completed order it means a customer who had just paid
returned to a bag still holding what they bought, with a live Checkout button.

The failure mode is charging someone twice.

## Decision

`pendingCheckoutCartId` records the cart ID at the moment the customer is handed to
Shopify's checkout — the one fact the storefront knows and Shopify cannot tell it.

- cart gone **and** its ID matches `pendingCheckoutCartId` → treat as a completed order:
  clear the bag, show the confirmation state;
- cart gone and it does **not** match → ordinary expiry: rebuild silently, as before.

Both `pendingCheckoutCartId` and `justCompleted` are persisted, because paying navigates
away from the site and the answer has to survive the return trip.

## Consequences

- The expiry half is guarded as carefully as the order half. The obvious "fix" — treating
  every missing cart as a completed order — breaks silent rebuilding, so the tests pin
  both directions: reverting to the collapsed behaviour turns 7 assertions red while 9
  separate expiry assertions stay green.
- The site sends **no** order confirmation email. Shopify already sends one, and a second
  would carry worse data with no way to stay in sync with refunds or fulfilment changes.
- The confirmation screen claims nothing the storefront cannot know — no order number, no
  total. It defers to Shopify's email as the receipt.

Referenced by: `src/store/cart.tsx`, `src/tests/unit/checkout-journey.test.ts`,
`docs/testing-strategy.md`.
