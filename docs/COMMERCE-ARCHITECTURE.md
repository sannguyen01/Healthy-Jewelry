# Commerce Architecture — Healthy Jewelry

How a visitor becomes an order, and where each decision lives in the code.
Pair this with `docs/SHOPIFY-ADMIN-RUNBOOK.md`, which covers the settings on
the Shopify side that this code depends on.

---

## The path

```
Shopify catalog
      │  Storefront API (server-side, cached, tagged)
      ▼
  Product page ──► size picker ──► Add to Bag
      │                                │
      │                                ▼
      │                        Zustand cart (localStorage)
      │                                │  variant-keyed lines
      │                                ▼
      └──────────────────────► /api/shopify proxy ──► Shopify Cart API
                                       │
                                       ▼
                              checkoutUrl (freshly validated)
                                       │
                                       ▼
                          Shopify-hosted checkout ──► payment
                                       │
                                       ▼
                            /order-confirmed (bag cleared)
```

Two boundaries matter:

**The Storefront token never reaches the browser.** Server components call
Shopify directly through `lib/shopify/client.ts`. Client-side cart mutations go
through `/api/shopify`, which injects the token server-side and rejects any
GraphQL operation not on its allowlist.

**Shopify owns money.** The site never computes a total it presents as final.
Before a cart syncs, the summary shows a locally derived figure labelled
*Estimated Total*; after it syncs, it shows Shopify's `cart.cost`. Tax appears
only once Shopify has computed it, because an anonymous cart has no address and
therefore no honest tax figure.

---

## Cart line identity

**A cart line is a variant, not a product.**

This is the single most consequential rule in the codebase. Size 7 and size 9
of the same ring are two different SKUs, two different things to ship, and two
separate lines. Keying lines by product id — as the store originally did —
merged them into one line carrying whichever size was chosen first, and shipped
the wrong ring.

Everything follows from it:

- `CartItem.variantId` is the identity. `addItem`, `removeItem` and
  `updateQuantity` all take a variant id.
- React keys are `variantId`. Keying by product id made React reuse one row for
  two lines.
- Each line snapshots `variantTitle`, `selectedOptions` and `unitPrice` at add
  time, so the bag can show "Size 9" and the variant's own price without a
  refetch, and still renders correctly if the product is later edited.
- `useCartItem`/`useIsInCart`/`useCartItemQuantity` are keyed by variant.
  `useProductQuantityInCart` exists for the one place with no size context — a
  product card — and sums across variants.

The persisted bag is versioned. v1 stored product-keyed lines with no variant
metadata; the v2 migration drops them rather than guessing which size a
returning customer meant. An empty bag is recoverable. A wrong-size order is
not.

---

## Currency

`HJProduct.currencyCode` carries Shopify's ISO code from the `Money` object all
the way to the rendered price. Nothing assumes USD.

`formatPrice` handles zero-decimal currencies — VND, JPY, KRW render as
`2.450.000 ₫`, not `₫2,450,000.00` — and degrades to `CODE amount` rather than
throwing on a currency Intl does not recognise. A malformed amount formats as
zero, because a plausible `$0.00` beside a disabled buy button beats `$NaN` in
the middle of a product grid.

Prices follow the *selected variant*, not the product's "from" price. A size 12
band can legitimately cost more than a size 5, and charging a different number
at checkout than the one on the page is how a store earns chargebacks.

---

## Availability

Three independent signals, all from Shopify:

| Signal | Drives |
|---|---|
| `product.availableForSale` | Sold-out badge on the detail page; Add to Bag disabled |
| `variant.availableForSale` | Struck-through, disabled size swatch |
| Option value with no variant | Size hidden from the picker entirely |

`defaultVariantId` resolves to the first *purchasable* variant. Defaulting to
`variants[0]` regardless put an unbuyable merchandise id into the cart whenever
the first size was sold out, and the customer only found out when Shopify
refused the checkout.

The size picker is built from `product.options` — Shopify's own option
definitions — by `buildSizeOptions`. It was previously a hardcoded list of US
ring sizes 5–12 with no connection to the catalog, so a size the store did not
stock looked pickable but left Add to Bag permanently disabled with no
explanation, and a sold-out size looked identical to an in-stock one.

---

## Cart sync

`syncWithShopify` reconciles the local bag against the Shopify cart. The
interesting part is `diffCartLines`, which is a pure function and unit-tested
directly.

**What it replaced.** The original sync removed every remote line and re-added
the whole set on each call. That is destructive — a failure between the remove
and the add left the customer with an empty Shopify cart — it churned line ids
on every keystroke of the quantity stepper, and it discarded Shopify's own line
state.

**What it does now.** It computes the minimal mutation set:

- unchanged bag → zero mutations
- quantity changed → one `cartLinesUpdate` against the existing line
- size added → one `cartLinesAdd` for that line only
- duplicate remote lines for one variant → collapsed into the first

Mutations apply in the order update → add → remove, so a failure part-way
through never leaves the customer looking at an empty cart.

### Reading the answer back

Shopify silently caps a line to available stock and drops lines that sold out
mid-session. The sync reads the returned cart and reconciles local state to it,
recording a human-readable note per change — "Arc Band is limited to 2 — your
bag was updated." Those surface through `CartNotices`. Without this the bag
kept showing quantities the customer would never be charged for.

One guard: a cart that returns with **no lines at all** when we asked for
several is treated as a bad payload, not as everything selling out in the same
instant. Emptying a real bag is unrecoverable, so per-line absence is trusted
only when the cart clearly contains other lines.

### Failure handling

An empty bag is still pushed. Returning early — as the original did — left
removed items sitting in the Shopify cart, so a surviving checkout URL charged
for things the customer had already taken out.

A network error during `GetCart` re-throws rather than falling through to
`cartCreate`, so a blip cannot orphan the customer's existing cart by silently
creating a second one.

Failures produce a typed `CartError` with customer-facing copy, not a
`console.warn`. The original code logged and returned, so from the customer's
side the checkout button simply did nothing.

---

## Checkout hand-off

`prepareCheckout()` syncs, then returns a **freshly validated** checkout URL, or
`null`.

`checkoutUrl` is deliberately **not persisted**. Shopify carts expire, and a
checkout URL from a previous visit drops the customer out of the funnel with a
404. It is re-derived from a live sync every time.

Both the drawer and the cart page call `prepareCheckout` and, on `null`, show
the error in place with the bag still visible. The original fell through to
`window.location.href = '/checkout'`, where the same sync failed again and the
customer was left on a spinner reading "Connect your Shopify store to enable
checkout" — an instruction to the developer, shown to the buyer.

`/checkout` itself is the interstitial for a direct navigation. It retries, it
links back to the bag, and it offers `/contact` as a route to a human, because
a checkout that will not open is a lost order unless there is another way to
reach you.

---

## Post-purchase

Shopify hosts the checkout, so the browser leaves the site to pay and returns
with the local bag exactly as it was. `/order-confirmed` clears it, and says so.
Shopify has to be pointed at that URL — see §4 of the admin runbook. Without it
a customer who has just paid returns to a full bag, reads it as a failed
payment, and orders again.

---

## Caching and invalidation

Products and collections are cached for an hour and tagged (`products`,
`product:<handle>`, `collections`). Anything that changes what a customer can
buy, or at what price, invalidates that cache through
`/api/webhooks/shopify`:

- `products/*` → catalog, plus the specific handle
- `collections/*` → collection pages
- `inventory_levels/*` → catalog, because inventory drives `availableForSale`
- `orders/*` → catalog, plus every purchased handle, closing the window where
  the last unit still shows as available to the next visitor

Every request is HMAC-verified with a timing-safe comparison. Unrecognised
topics return 200 with `handled: false` — a non-2xx makes Shopify retry and
eventually disable the endpoint, taking the working topics down with it.

---

## Graceful degradation

When Shopify is unreachable or unconfigured, catalog reads fall back to the
static catalog in `lib/data/hj-data.ts` rather than erroring. That keeps the
site browsable, but it means **a silent fallback is the symptom of a bad
token** — if the site shows the 17 demo products, check the env vars before
looking anywhere else.

The cart does not fall back. It reports `not_configured` and says checkout is
unavailable, because a bag that cannot become an order should say so rather
than pretend.

---

## Testing

- `diffCartLines` and `buildSizeOptions` are pure and tested directly — they
  hold the two rules most expensive to get wrong.
- `src/test/factories.ts` builds every `HJProduct`/`CartItem` fixture. Adding a
  required field gets a default there and nowhere else; the fixtures used to be
  inline literals, so one new field broke a dozen unrelated test files.
- E2E covers the two-sizes-one-product case end to end, in a real browser, on
  desktop and mobile viewports — that is the bug that was shipping wrong rings.
- A unit test fails when the pinned Shopify API version approaches end of
  support, so the quarterly bump is a red build rather than silent drift.
