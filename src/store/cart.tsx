'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
// Public config only: importing `@/config/shopify` here would pull the
// server-only token getters into the client bundle. See
// src/tests/unit/secret-exposure.test.ts.
import { shopifyPublicConfig } from '@/config/shopify-public'
import { track } from '@/lib/analytics'
import { cartCurrencyCode } from '@/lib/utils/formatPrice'
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
 * - `lines-unavailable` — Shopify accepted the cart but returned fewer lines
 *                         than were sent, so the checkout would not contain
 *                         what the bag on screen contains.
 */
export type CheckoutError =
  | 'not-configured'
  | 'placeholder-catalog'
  | 'network'
  | 'shopify-error'
  | 'lines-unavailable'

export interface CartItem {
  product: HJProduct
  quantity: number
  // The specific Shopify variant (e.g. a size) this line represents.
  // Falls back to the product's default variant for unsized products.
  variantId: string
}

// Single-variant products get a synthetic title standing in for "no real
// choice was made": Shopify's own API returns "Default Title"; the static
// fallback catalog (src/lib/data/hj-data.ts) returns "Default". Either would
// leak into the UI as a meaningless line if not filtered here.
const NO_VARIANT_CHOICE = new Set(['Default Title', 'Default'])

/**
 * The label that tells two cart lines for the same product apart (e.g. "Size 9").
 * Returns null for single-variant products, where there is no choice to label.
 *
 * Prefers `selectedOptions` over the raw variant title: a single-option ring
 * variant's title is just the bare size ("9"), which reads as noise without
 * its option name attached.
 */
export function cartItemVariantLabel(item: Pick<CartItem, 'product' | 'variantId'>): string | null {
  const variant = item.product.variants.find((v) => v.id === item.variantId)
  if (!variant || NO_VARIANT_CHOICE.has(variant.title)) return null

  if (variant.selectedOptions.length > 0) {
    return variant.selectedOptions.map((o) => `${o.name} ${o.value}`).join(' · ')
  }
  return variant.title
}

interface Money {
  amount: string
  currencyCode: string
}

/**
 * The parts of Shopify's Cart the storefront actually reads.
 *
 * `CART_FRAGMENT` has always requested `cost` and each line's `merchandise`
 * price — this type used to declare only `id`, `checkoutUrl` and line ids, so
 * every authoritative figure Shopify sent was parsed and thrown away. The bag
 * then displayed prices summed from `localStorage`, which can be arbitrarily
 * old. Quoting a price nothing guarantees is the price charged is the same
 * failure as the hardcoded USD and the unformatted line item, on a third axis.
 */
interface ShopifyCartPayload {
  id: string
  checkoutUrl: string
  cost?: { totalAmount?: Money; subtotalAmount?: Money }
  lines: {
    edges: {
      node: {
        id: string
        quantity?: number
        merchandise?: { id?: string; availableForSale?: boolean; price?: Money }
      }
    }[]
  }
}

interface ShopifyMutationResult {
  cart?: ShopifyCartPayload
  userErrors?: { field: string[]; message: string }[]
}

interface GraphQLError {
  message: string
  extensions?: { code?: string }
}

/**
 * The outcome of one call to our proxy, with the two things the old signature
 * discarded: the HTTP status, and Shopify's GraphQL `errors` array.
 *
 * Both were being dropped, and both change what the customer should be told.
 * A 503 from the proxy means the *server-side* Storefront token is missing —
 * a configuration fault no amount of retrying can fix — but it arrived here as
 * a body with no `data`, indistinguishable from Shopify refusing the cart, so
 * the customer was shown "try again" and a button that could never work.
 */
interface ShopifyResult<T> {
  ok: boolean
  status: number
  data?: T
  errors?: GraphQLError[]
}

/** Shopify signals rate limiting in-band, with HTTP 200 and this code. */
function isThrottled(result: ShopifyResult<unknown>): boolean {
  return (
    result.status === 429 ||
    (result.errors?.some((e) => e.extensions?.code === 'THROTTLED') ?? false)
  )
}

// `operation` is a persisted-query key, not GraphQL text — the server
// resolves it to its own literal query string (see api/shopify/route.ts),
// so the client can never influence an operation's selection set or args.
async function postShopify<T>(
  operation: string,
  variables: Record<string, unknown>
): Promise<ShopifyResult<T>> {
  const res = await fetch('/api/shopify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, variables }),
  })

  let body: { data?: T; errors?: GraphQLError[] } = {}
  try {
    body = (await res.json()) as { data?: T; errors?: GraphQLError[] }
  } catch {
    // A non-JSON body (an edge/proxy error page) is still a failure with a
    // status worth reporting — it must not throw past the caller's mapping.
  }

  return { ok: res.ok, status: res.status, data: body.data, errors: body.errors }
}

/**
 * One bounded retry, for throttling only.
 *
 * Shopify's Storefront API rate-limits per IP, and a shared serverless egress
 * IP makes that reachable on an ordinary traffic spike. One retry after a short
 * pause converts a customer-visible failure into a hesitation. It stays at one:
 * a longer chain would sit behind a spinner for seconds and, under a sustained
 * limit, would add load to the thing already refusing us.
 */
const THROTTLE_RETRY_DELAY_MS = 600

async function postShopifyWithRetry<T>(
  operation: string,
  variables: Record<string, unknown>
): Promise<ShopifyResult<T>> {
  const first = await postShopify<T>(operation, variables)
  if (!isThrottled(first)) return first

  console.warn(`[HJ] Shopify throttled "${operation}" — retrying once`)
  await new Promise((resolve) => setTimeout(resolve, THROTTLE_RETRY_DELAY_MS))
  return postShopify<T>(operation, variables)
}

type SyncLine = { merchandiseId: string; quantity: number }

/**
 * What one attempt at reconciling with Shopify produced.
 *
 * `cart-gone` is deliberately its own outcome rather than folded into a null.
 * Per Shopify's Cart API documentation — *"Completed carts are deleted upon
 * order creation… you can't query a completed cart for order information or
 * completion status"* — a vanished cart is how a **successful purchase** looks
 * from here. It is also how an expired cart looks. Those need opposite
 * responses (empty the bag vs. rebuild it), and collapsing them into `null` is
 * exactly why a customer who had just paid came back to a bag still holding
 * what they had bought, with a live Checkout button.
 */
type SyncOutcome =
  | { kind: 'cart'; cart: ShopifyCartPayload }
  | { kind: 'cart-gone' }
  | { kind: 'failed'; error: CheckoutError }

/**
 * Translate a transport-level failure into something a customer can be told.
 *
 * The distinction that matters is 503: our own proxy returns it when the
 * server-side `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is missing, which is a
 * deployment fault. Reporting it as `shopify-error` offered a Retry button for
 * a condition retrying can never change.
 */
function mapFailure(result: ShopifyResult<unknown>): CheckoutError {
  if (result.status === 503) return 'not-configured'
  if (result.status === 429 || result.status === 502 || result.status >= 500) return 'network'
  // Everything else is Shopify refusing. There used to be an `if (!result.ok)`
  // here returning the same value as the line below it — a branch that read as a
  // discrimination and made none, which is the kind of line that survives a
  // refactor by looking intentional.
  return 'shopify-error'
}

/** True when the response carried no usable payload for the caller. */
function failed(result: ShopifyResult<unknown>): boolean {
  return !result.ok || (result.errors?.length ?? 0) > 0
}

/**
 * The three mutations needed to make a remote cart match the local bag.
 *
 * Exported and pure so the decision can be asserted against fixtures rather than
 * inferred from a network trace — the same reason `escalationDecision` and
 * `planCartReconciliation`'s siblings elsewhere in this repository are pure.
 */
export interface CartReconciliation {
  /** Existing lines whose quantity changed. */
  updates: { id: string; quantity: number }[]
  /** Variants the remote cart does not have at all. */
  additions: SyncLine[]
  /** Line ids the local bag no longer contains. */
  removals: string[]
  /** True when the remote cart already matches — nothing to send. */
  isNoop: boolean
}

/**
 * Diff the remote cart against the local bag.
 *
 * ## Why this replaces remove-everything-then-re-add
 *
 * The previous reconciliation deleted every line and then added the fresh set,
 * across three unguarded round-trips. If the add failed — one throttle retry
 * exhausted, a 5xx, a dropped connection — the customer's Shopify cart was left
 * **empty**, with no compensating action, and the function returned only
 * `{ kind: 'failed' }`.
 *
 * `cartLinesUpdate` is the in-place primitive that makes that unnecessary. It was
 * already imported, already registered in the persisted-query allowlist
 * (`api/shopify/route.ts:29`), and already asserted to be there by
 * `api-shopify-route.test.ts:148` — and called by nothing. The safe tool was
 * plumbed and unused while the destructive path shipped.
 *
 * ## Order matters, and so does the check that follows it
 *
 * The caller issues update → add → **remove last**, so the remote cart is never a
 * *subset* of what the customer expects at any point mid-flight. The cost of that
 * ordering is that a failure after the add leaves a *superset* — lines the
 * customer removed still present — which would be charged at checkout.
 *
 * So `syncWithShopify`'s post-sync check became bidirectional. It previously
 * asserted only that every line sent came back; it now also asserts that nothing
 * came back that was not sent. Reordering without that would have traded an empty
 * cart for an over-charged one, which is not a trade worth making.
 *
 * ## Duplicates
 *
 * Shopify can hold two lines for the same merchandise id. The first is reconciled
 * and the rest are removed, rather than being left to double a quantity silently.
 */
export function planCartReconciliation(
  existing: ShopifyCartPayload,
  desired: SyncLine[]
): CartReconciliation {
  const updates: CartReconciliation['updates'] = []
  const additions: SyncLine[] = []
  const removals: string[] = []

  /** First remote line per merchandise id; any later one is a duplicate. */
  const byMerchandise = new Map<string, { id: string; quantity: number }>()

  for (const edge of existing.lines.edges) {
    const merchandiseId = edge.node.merchandise?.id
    if (!merchandiseId) {
      // A line whose merchandise Shopify will not name cannot be matched to
      // anything local, so it cannot be kept.
      removals.push(edge.node.id)
      continue
    }
    if (byMerchandise.has(merchandiseId)) {
      removals.push(edge.node.id)
      continue
    }
    byMerchandise.set(merchandiseId, { id: edge.node.id, quantity: edge.node.quantity ?? 0 })
  }

  const desiredIds = new Set(desired.map((line) => line.merchandiseId))

  for (const line of desired) {
    const remote = byMerchandise.get(line.merchandiseId)
    if (!remote) {
      additions.push(line)
    } else if (remote.quantity !== line.quantity) {
      updates.push({ id: remote.id, quantity: line.quantity })
    }
  }

  for (const [merchandiseId, remote] of byMerchandise) {
    if (!desiredIds.has(merchandiseId)) removals.push(remote.id)
  }

  return {
    updates,
    additions,
    removals,
    isNoop: updates.length === 0 && additions.length === 0 && removals.length === 0,
  }
}

/** Run one cart mutation and normalise its three failure shapes into one. */
async function applyCartMutation(
  operation: 'UpdateCartLines' | 'AddToCart' | 'RemoveFromCart',
  field: 'cartLinesUpdate' | 'cartLinesAdd' | 'cartLinesRemove',
  variables: Record<string, unknown>
): Promise<{ ok: true; cart: ShopifyCartPayload | undefined } | { ok: false; error: CheckoutError }> {
  const result = await postShopifyWithRetry<Record<string, ShopifyMutationResult>>(
    operation,
    variables
  )
  if (failed(result)) {
    console.warn(`[HJ] ${operation} failed:`, result.status, result.errors)
    return { ok: false, error: mapFailure(result) }
  }
  const payload = result.data?.[field]
  if (payload?.userErrors && payload.userErrors.length > 0) {
    console.warn(`[HJ] ${field} returned userErrors:`, payload.userErrors)
    return { ok: false, error: 'shopify-error' }
  }
  return { ok: true, cart: payload?.cart }
}

/**
 * Reconcile an existing Shopify cart to match the current local lines.
 *
 * Mutations are issued update → add → remove, and only the ones the diff calls
 * for. An unchanged bag now costs a single `GetCart` rather than three
 * round-trips, which matters because each one spends a token of the customer's
 * own 60/minute budget on `/api/shopify`.
 */
async function syncExistingCart(cartId: string, lines: SyncLine[]): Promise<SyncOutcome> {
  const cartResult = await postShopifyWithRetry<{ cart: ShopifyCartPayload | null }>('GetCart', {
    cartId,
  })
  if (failed(cartResult)) {
    console.warn('[HJ] GetCart failed:', cartResult.status, cartResult.errors)
    return { kind: 'failed', error: mapFailure(cartResult) }
  }

  const existingCart = cartResult.data?.cart
  if (!existingCart) {
    // Shopify answered successfully and said this cart no longer exists.
    return { kind: 'cart-gone' }
  }

  const plan = planCartReconciliation(existingCart, lines)
  if (plan.isNoop) {
    // Already correct. Three round-trips used to be spent proving this.
    return { kind: 'cart', cart: existingCart }
  }

  let cart: ShopifyCartPayload = existingCart

  if (plan.updates.length > 0) {
    const result = await applyCartMutation('UpdateCartLines', 'cartLinesUpdate', {
      cartId,
      lines: plan.updates,
    })
    if (!result.ok) return { kind: 'failed', error: result.error }
    if (result.cart) cart = result.cart
  }

  if (plan.additions.length > 0) {
    const result = await applyCartMutation('AddToCart', 'cartLinesAdd', {
      cartId,
      lines: plan.additions,
    })
    if (!result.ok) return { kind: 'failed', error: result.error }
    if (result.cart) cart = result.cart
  }

  // Last, deliberately. Removing first is what could leave the cart empty.
  if (plan.removals.length > 0) {
    const result = await applyCartMutation('RemoveFromCart', 'cartLinesRemove', {
      cartId,
      lineIds: plan.removals,
    })
    if (!result.ok) return { kind: 'failed', error: result.error }
    if (result.cart) cart = result.cart
  }

  return { kind: 'cart', cart }
}

async function createShopifyCart(lines: SyncLine[]): Promise<SyncOutcome> {
  const createResult = await postShopifyWithRetry<{ cartCreate: ShopifyMutationResult }>(
    'CreateCart',
    { lines }
  )
  if (failed(createResult)) {
    console.warn('[HJ] CreateCart failed:', createResult.status, createResult.errors)
    return { kind: 'failed', error: mapFailure(createResult) }
  }
  const created = createResult.data?.cartCreate
  if (created?.userErrors && created.userErrors.length > 0) {
    console.warn('[HJ] cartCreate returned userErrors:', created.userErrors)
    return { kind: 'failed', error: 'shopify-error' }
  }
  return created?.cart
    ? { kind: 'cart', cart: created.cart }
    : { kind: 'failed', error: 'shopify-error' }
}

/**
 * Shopify's own figures for a synced cart, keyed by variant id.
 *
 * These overwrite what the bag has been carrying in `localStorage`, which is a
 * snapshot of the price at the moment the item was added and can be weeks old.
 */
interface CartTruth {
  total: string | null
  currencyCode: string | null
  priceByVariantId: Record<string, string>
  returnedVariantIds: string[]
}

function readCartTruth(cart: ShopifyCartPayload): CartTruth {
  const priceByVariantId: Record<string, string> = {}
  const returnedVariantIds: string[] = []

  for (const edge of cart.lines.edges) {
    const variantId = edge.node.merchandise?.id
    if (!variantId) continue
    returnedVariantIds.push(variantId)
    const amount = edge.node.merchandise?.price?.amount
    if (amount) priceByVariantId[variantId] = amount
  }

  return {
    total: cart.cost?.totalAmount?.amount ?? null,
    currencyCode: cart.cost?.totalAmount?.currencyCode ?? null,
    priceByVariantId,
    returnedVariantIds,
  }
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
   * The Shopify cart this customer was last handed to checkout with.
   *
   * The only signal available for telling a completed order apart from an
   * expired cart: Shopify deletes a cart on order creation and exposes no
   * completion flag, so "the cart we sent them to pay for is gone" is the
   * nearest thing to a receipt the storefront can observe. Persisted, because
   * the customer leaves the site entirely to pay and comes back on a new page
   * load — an in-memory flag would be gone exactly when it is needed.
   */
  pendingCheckoutCartId: string | null
  /**
   * True once a completed order has been detected, until the customer acts.
   *
   * Drives the on-site confirmation. Shopify sends the actual receipt by email;
   * this exists so the last thing the site says to someone who just paid is not
   * "Preparing checkout…".
   */
  justCompleted: boolean
  /**
   * The bag total as Shopify calculates it, in minor-unit-free string form.
   *
   * Preferred over `totalPrice()` wherever a total is shown. `totalPrice()`
   * sums prices captured in `localStorage` when each item was added; this is
   * the number that will actually be charged.
   */
  shopifyTotal: string | null
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
  removeItem: (variantId: string) => void
  /**
   * Set a checkout error *and* count it. Internal: the five refusal paths call
   * this instead of `set({ checkoutError })`, so a failure can never be shown to
   * a customer without also being reportable.
   */
  failCheckout: (reason: CheckoutError) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void

  // Drawer controls
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void

  // Shopify sync
  syncWithShopify: () => Promise<void>

  /** Records that the customer is being sent to Shopify to pay. */
  beginCheckout: () => void
  /** Dismisses the on-site order confirmation. */
  acknowledgeCompletion: () => void

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
      pendingCheckoutCartId: null,
      justCompleted: false,
      shopifyTotal: null,

      setHasHydrated: (value) => set({ hasHydrated: value }),

      /**
       * Record a checkout failure, and count it.
       *
       * Not exported on the store's public interface — it exists so the five
       * places that can refuse a checkout cannot set the error without also
       * reporting it. Until now the only evidence a customer had hit
       * "Online checkout is temporarily unavailable" was them emailing to say so,
       * and `not-configured` (this deployment cannot sell anything) reads
       * identically to `lines-unavailable` (one piece sold out) on screen while
       * being a completely different problem.
       */
      failCheckout: (reason: CheckoutError) => {
        set({ checkoutError: reason })
        track({ name: 'checkout_failed', reason, itemCount: get().items.length })
      },

      addItem: (product, quantity = 1, variantId) => {
        const resolvedVariantId = variantId ?? product.defaultVariantId
        set((state) => {
          // Matched by variant, not product: size 7 and size 9 of the same
          // ring are two different SKUs and must stay two separate lines.
          // Matching by product id merged them into one line carrying
          // whichever size was added first — the quantity went up, the size
          // silently did not, and the customer received the wrong ring.
          const existing = state.items.find((item) => item.variantId === resolvedVariantId)
          if (existing) {
            // Same variant already in the bag — merge quantity.
            return {
              items: state.items.map((item) =>
                item.variantId === resolvedVariantId
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
              // A cart-content change invalidates any previously-synced
              // checkout URL so the checkout page never redirects to a stale
              // cart — and clears any error from the previous attempt, which
              // may no longer apply to these lines. Shopify's total is scoped
              // to the lines that produced it, so it goes too.
              checkoutUrl: null,
              checkoutError: null,
              shopifyTotal: null,
              // Shopping again dismisses the previous order's confirmation.
              justCompleted: false,
            }
          }
          return {
            items: [...state.items, { product, quantity, variantId: resolvedVariantId }],
            checkoutUrl: null,
            checkoutError: null,
            shopifyTotal: null,
            justCompleted: false,
          }
        })

        // After the set, so a throw inside the reducer can never be misreported
        // as a successful add — and outside it, because `set` reducers must stay
        // pure.
        track({
          name: 'add_to_bag',
          handle: product.handle,
          collection: product.collection,
          material: product.material,
          value: product.price,
          currency: product.currencyCode,
          quantity,
        })
      },

      removeItem: (variantId) => {
        // Read before the filter: after it, there is nothing left to describe.
        const removed = get().items.find((item) => item.variantId === variantId)?.product
        if (removed) {
          track({
            name: 'remove_from_bag',
            handle: removed.handle,
            collection: removed.collection,
            material: removed.material,
          })
        }
        set((state) => ({
          items: state.items.filter((item) => item.variantId !== variantId),
          checkoutUrl: null,
          checkoutError: null,
          shopifyTotal: null,
        }))
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.variantId === variantId ? { ...item, quantity } : item
          ),
          checkoutUrl: null,
          checkoutError: null,
          shopifyTotal: null,
        }))
      },

      clearCart: () =>
        set({
          items: [],
          shopifyCartId: null,
          checkoutUrl: null,
          checkoutError: null,
          pendingCheckoutCartId: null,
          shopifyTotal: null,
        }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      syncWithShopify: async () => {
        if (!shopifyPublicConfig.storeDomain) {
          // NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN is inlined at build time, so an
          // empty value here means it was absent when this deployment was
          // built — setting it in the dashboard afterwards changes nothing
          // until a rebuild.
          get().failCheckout('not-configured')
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
          get().failCheckout('placeholder-catalog')
          return
        }

        set({ isLoading: true, checkoutError: null })

        try {
          const lines: SyncLine[] = items.map((item) => ({
            merchandiseId: item.variantId,
            quantity: item.quantity,
          }))

          // Reuse the existing Shopify cart (same id, so abandoned-checkout
          // tracking stays coherent) when one exists.
          let outcome: SyncOutcome = shopifyCartId
            ? await syncExistingCart(shopifyCartId, lines)
            : await createShopifyCart(lines)

          if (outcome.kind === 'cart-gone') {
            // Shopify deletes a cart when an order is created from it, and
            // offers no way to ask whether that is what happened. The only
            // discriminator available is whether *we* sent this customer to pay
            // for this exact cart.
            if (shopifyCartId && shopifyCartId === get().pendingCheckoutCartId) {
              console.info('[HJ] checkout cart no longer exists — treating as a completed order')
              set({
                items: [],
                shopifyCartId: null,
                checkoutUrl: null,
                pendingCheckoutCartId: null,
                shopifyTotal: null,
                checkoutError: null,
                justCompleted: true,
              })
              return
            }
            // Never sent to checkout, so this is an expired or pruned cart.
            // Rebuilding it silently is correct and is the long-standing
            // behaviour — it must not regress into an error the customer sees.
            outcome = await createShopifyCart(lines)
          }

          if (outcome.kind !== 'cart') {
            // 'failed', or a freshly-created cart that came back gone too —
            // both leave nothing to hand the customer.
            get().failCheckout(outcome.kind === 'failed' ? outcome.error : 'shopify-error')
            return
          }

          const { cart } = outcome
          const truth = readCartTruth(cart)

          // **Both directions, and the second one is new.**
          //
          // Shopify may accept a cart and silently omit a line it can no longer
          // sell. Handing the customer to a checkout containing less than the bag
          // they were looking at is worse than saying so — that was always
          // checked.
          //
          // The extra check is what makes the reconciliation reordering safe.
          // `syncExistingCart` now issues removals *last*, so a mid-flight failure
          // leaves a superset rather than an empty cart. A superset is the better
          // failure, but only if something notices: an unremoved line is an item
          // the customer took out of their bag and would still be charged for.
          // Asserting only that everything sent came back would have traded an
          // empty cart for an over-charged one.
          const sentVariantIds = lines.map((l) => l.merchandiseId)
          const missing = sentVariantIds.filter((id) => !truth.returnedVariantIds.includes(id))
          const unexpected = truth.returnedVariantIds.filter((id) => !sentVariantIds.includes(id))

          if (missing.length > 0 && truth.returnedVariantIds.length > 0) {
            console.warn('[HJ] Shopify dropped cart lines:', missing)
            get().failCheckout('lines-unavailable')
            return
          }

          if (unexpected.length > 0) {
            console.warn('[HJ] Shopify cart holds lines the bag does not:', unexpected)
            get().failCheckout('lines-unavailable')
            return
          }

          set((state) => ({
            shopifyCartId: cart.id,
            checkoutUrl: cart.checkoutUrl,
            checkoutError: null,
            shopifyTotal: truth.total,
            // Adopt Shopify's price for every line it priced. The bag has been
            // carrying whatever the price was when the item was added, which
            // for a persisted cart can be arbitrarily stale.
            items: state.items.map((item) => {
              const authoritative = truth.priceByVariantId[item.variantId]
              if (!authoritative || authoritative === item.product.price) return item
              console.info('[HJ] adopting Shopify price', {
                handle: item.product.handle,
                was: item.product.price,
                now: authoritative,
              })
              return { ...item, product: { ...item.product, price: authoritative } }
            }),
          }))
        } catch (err) {
          console.warn('[HJ] Shopify cart sync failed — local cart still active', err)
          get().failCheckout('network')
        } finally {
          set({ isLoading: false })
        }
      },

      beginCheckout: () => {
        const { shopifyCartId, items } = get()
        track({
          name: 'checkout_started',
          itemCount: items.length,
          value: String(get().totalPrice()),
          currency: cartCurrencyCode(items),
        })
        if (shopifyCartId) {
          set({ pendingCheckoutCartId: shopifyCartId })
        }
      },

      acknowledgeCompletion: () => set({ justCompleted: false }),

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
      //
      // `pendingCheckoutCartId` and `justCompleted` *must* persist. Paying
      // takes the customer off this origin entirely and they return on a fresh
      // page load, so anything held only in memory is gone at precisely the
      // moment it is needed — which is the whole point of these two.
      partialize: (state) => ({
        items: state.items,
        shopifyCartId: state.shopifyCartId,
        checkoutUrl: state.checkoutUrl,
        pendingCheckoutCartId: state.pendingCheckoutCartId,
        justCompleted: state.justCompleted,
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
