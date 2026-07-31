# Shopify Admin Runbook — Healthy Jewelry

Everything in this document happens in the Shopify admin, not in this
repository. The code changes that pair with it are already merged; these are
the settings that have to exist on the Shopify side for the storefront to
behave correctly.

Store: `y0k9ve-q1` · admin at <https://admin.shopify.com/store/y0k9ve-q1>

> Admin navigation labels move between Shopify releases. Where a path has
> changed, the setting is still findable by searching its name in the admin
> search bar (`/` opens it).

---

## 0. Before anything else — the five that break orders

Work through these first. Each one corresponds to a defect the storefront code
now guards against, but a guard is not a fix: the data still has to be right.

| # | Setting | Why it matters | Where |
|---|---------|----------------|-------|
| 1 | Every sized product has real **Size** variants | The size picker renders from Shopify's option values. A ring with no Size option shows no picker and cannot be added to the bag. | Products → *product* → Variants |
| 2 | Option is named exactly **Size** | The picker recognises `Size`, `Ring Size`, `Kích cỡ`, `Cỡ`. Anything else renders no picker. | Products → *product* → Variants → option name |
| 3 | **Inventory tracking on**, "continue selling when out of stock" **off** | Drives `availableForSale`. With tracking off, everything reads as in stock forever and sold-out items reach checkout. | Products → *product* → Inventory |
| 4 | **Storefront API access scopes** granted | Missing scopes make the catalog fall back to static demo data with demo prices. | Settings → Apps and sales channels → Develop apps |
| 5 | **Store currency matches what customers are charged** | The storefront renders whatever currency Shopify reports. A mismatch here misstates every price on the site. | Settings → Store details → Store currency |

---

## 1. Storefront API access

The site talks to Shopify through a private app token, proxied server-side so
the token never reaches the browser.

**Settings → Apps and sales channels → Develop apps → Create an app**

Name it `Healthy Jewelry Storefront`.

### Storefront API scopes

Configure → Storefront API integration → tick:

- `unauthenticated_read_product_listings`
- `unauthenticated_read_product_inventory`
- `unauthenticated_read_product_tags`
- `unauthenticated_read_collection_listings`
- `unauthenticated_write_checkouts`
- `unauthenticated_read_checkouts`
- `unauthenticated_read_selling_plans` — only if subscriptions are ever added

Do **not** grant Admin API scopes. Nothing in this codebase consumes the Admin
API, and an unused Admin token is pure blast radius.

### Install and copy the token

Install app → API credentials → copy the **Storefront API access token**.

Set it in Vercel (Project → Settings → Environment Variables), for Production,
Preview and Development:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` | `y0k9ve-q1.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | the token you just copied |
| `SHOPIFY_WEBHOOK_SECRET` | from §5 below |
| `SHOPIFY_REVALIDATION_SECRET` | any long random string you generate |
| `NEXT_PUBLIC_SITE_URL` | `https://healthyjewellery.com` |

`SHOPIFY_STOREFRONT_ACCESS_TOKEN` deliberately has no `NEXT_PUBLIC_` prefix.
Adding one would ship the token in the client bundle.

### Verifying it worked

With the variables set and the site redeployed, a product page shows Shopify's
prices and sizes. If it still shows the 17 demo products at demo prices, the
token or the domain is wrong — the code falls back to the static catalog by
design rather than showing an error page, so a silent fallback is the symptom
of a bad token.

---

## 2. Products, variants and options

### Options

Each sized product needs one option named **Size**, with one variant per value
you actually stock.

The storefront reads option values from Shopify and renders exactly those.
A value with no variant behind it is hidden entirely; a variant that is out of
stock renders struck through and disabled. Neither state can be produced by
editing the site — they follow the catalog.

Bracelet values should carry the measurement, e.g. `M (175mm)`. The picker
shows `M` on the swatch and the full value in the accessible label and in the
bag, so the customer sees the measurement where it matters.

### Inventory

Per variant: **Track quantity** on, **Continue selling when out of stock** off.

This is what makes `availableForSale` meaningful. Without it every variant
reports as purchasable, the sold-out treatment never appears, and customers
reach Shopify's checkout before discovering the problem.

### Tags

The storefront reads these tags:

| Tag | Effect |
|---|---|
| `bestseller` | Bestseller badge; appears in the homepage BESTSELLING strip |
| `new` | New badge; appears in the NEW ARRIVALS strip |
| `titanium` / `niobium` / `surgical-steel` | Material shown on the card and detail page |
| `svg:ring-dome` etc. | Overrides the generated illustration |

A product with no material tag falls back to `titanium`. A product in no
collection falls back to `rings` and logs a warning — check the server logs
after a catalog import.

### Collections

Create collections with these exact handles: `rings`, `necklaces`, `earrings`,
`bracelets`, `charms`. They back `/shop/[collection]`, and a product's first
collection determines where it files on the site.

---

## 3. Markets, currency and pricing

**Settings → Markets**

The storefront renders prices in whatever currency Shopify reports for the
product — it no longer assumes USD. What that currency *is* remains a merchant
decision, and it needs to be a deliberate one.

For a Vietnam-based store selling domestically:

- Primary market: Vietnam, currency **VND**
- Zero-decimal rendering is automatic: `2.450.000 ₫`, not `₫2,450,000.00`

If you sell internationally, add the markets and let Shopify handle
presentment currencies. The cart sends the buyer's country to Shopify
(`cartBuyerIdentityUpdate`), so prices and duties resolve per market.

**Rounding**: Settings → Markets → *market* → Pricing → currency rounding. For
VND, round to whole units; a price of `2.450.001 ₫` looks like a bug.

---

## 4. Checkout

**Settings → Checkout**

| Setting | Recommended | Why |
|---|---|---|
| Customer accounts | Optional | Requiring an account before purchase is the single largest avoidable drop-off in a jewelry funnel |
| Customer contact method | Email | Needed for the order and shipping notifications |
| Full name | First and last name | Required for shipping labels |
| Company name | Hidden | Noise for a consumer brand |
| Address line 2 | Optional | |
| Shipping address phone | Required | Vietnamese couriers phone before delivery; a missing number is a failed delivery |
| Tipping | Off | |
| Abandoned checkout emails | On, first send 1 hour | The cart id persists across visits, so returning customers land back on their own cart |

### Post-purchase redirect — required for the bag to clear

Shopify hosts the checkout, so the browser leaves this site to pay and comes
back with the local bag exactly as it was. Without this step a customer who has
just paid returns to a full bag, which reads as a failed payment and invites a
duplicate order.

**Settings → Checkout → Order status page → Additional scripts**, add:

```html
<script>
  // Send the buyer back to the storefront's confirmation page, which clears
  // the locally persisted bag. Runs once, on the order status page only.
  (function () {
    var params = new URLSearchParams({ order: '{{ order.order_number }}' });
    window.location.replace('https://healthyjewellery.com/order-confirmed?' + params);
  })();
</script>
```

If you would rather keep customers on Shopify's order status page, use a
**Continue shopping** button pointing at
`https://healthyjewellery.com/order-confirmed?order={{ order.order_number }}`
instead. The bag then clears when they choose to return, rather than
automatically.

> Checkout Extensibility note: stores migrated to checkout extensibility no
> longer expose "Additional scripts". Use **Settings → Checkout → Order status
> page → Customize** and add a custom **Post-purchase** UI extension, or fall
> back to the "Continue shopping" link above, which needs no scripting.

### Discount codes

The cart page now has a promotion code field that validates against Shopify
before checkout. Codes created under **Discounts** work there with no further
configuration. Shopify distinguishes "no such code" from "valid but not
applicable to this bag", and the field reports the difference.

---

## 5. Webhooks

**Settings → Notifications → Webhooks → Create webhook**

Endpoint for every one of them:

```
https://healthyjewellery.com/api/webhooks/shopify
```

Format **JSON**, API version **2026-07** (match `shopifyConfig.apiVersion`).

Subscribe to:

| Topic | What it keeps correct |
|---|---|
| `products/create` | New products appear without waiting an hour |
| `products/update` | Price and copy edits go live immediately |
| `products/delete` | Deleted products stop being reachable |
| `collections/update` | Collection pages reflect membership changes |
| `inventory_levels/update` | **Sold-out state.** Without this, a sold-out item stays purchasable on the site for up to an hour |
| `orders/create` | Revalidates the products just bought, closing the window where the last unit still shows as available |
| `orders/paid` | Same, after payment capture |
| `orders/cancelled` | Returns stock to the catalog promptly |

Copy the **webhook signing secret** shown after creating the first one into
`SHOPIFY_WEBHOOK_SECRET`. Every request is HMAC-verified with a timing-safe
comparison; an unsigned or missigned request gets a 401 and changes nothing.

Unrecognised topics return 200 with `handled: false`. That is deliberate — a
non-2xx makes Shopify retry and eventually disable the endpoint, which would
take the working topics down with it.

### Verifying

Create a webhook, then use **Send test notification**. A success looks like
`200` in Shopify's delivery log and a `[webhooks/shopify] Processed topic:` line
in the Vercel function logs.

---

## 6. Shipping and taxes

**Settings → Shipping and delivery**

The cart says "Shipping and taxes calculated at checkout" and shows no shipping
figure, because an anonymous cart has no address and therefore no honest number
to give. Shopify computes both at checkout from the zones you configure here.

Set up at minimum:

- A domestic Vietnam zone with your real rates
- A free-shipping threshold if you want one — create it as a **Discount** of
  type "Free shipping" with a minimum purchase amount, so it appears in the
  checkout breakdown rather than being an unenforced claim in site copy

**Settings → Taxes and duties** — set VAT for Vietnam. If prices are
tax-inclusive (normal for VN retail), tick "All prices include tax", otherwise
the checkout total will exceed the site's displayed price.

---

## 7. Quarterly maintenance

Shopify ships a new API version each quarter and supports each for roughly
twelve months. Past that, requests are silently served by the oldest supported
version — the API keeps working, but against a version nobody chose, and
behaviour can change without warning. This storefront was pinned to `2025-01`
well past its window before the July 2026 audit.

There is now a unit test that fails when the pinned version comes within a
month of end of support, so this surfaces as a red build rather than a silent
drift.

**When it fails:**

1. Read the [version release notes](https://shopify.dev/docs/api/release-notes)
   for every version between the pinned one and the current one.
2. Bump `apiVersion` in `src/config/shopify.ts`.
3. Update the API version on every webhook in the admin to match.
4. `pnpm test && pnpm build`, then verify a real product page and a real
   add-to-bag against the live store.

---

## 8. What this runbook cannot cover

Two things were deliberately left out because they need Admin API access, which
this storefront does not have and should not be given without a reason:

- **Order status lookup on the site.** Customers currently track orders through
  Shopify's own order status page and the emails. Building an on-site lookup
  needs an Admin API token or Shopify's Customer Account API, and a token with
  order-read scope is a meaningful liability — worth doing deliberately, not as
  a side effect.
- **Live inventory counts** ("only 2 left"). `quantityAvailable` requires the
  `unauthenticated_read_product_inventory` scope and only reports usefully when
  every variant tracks inventory. The scope is listed in §1; the UI for it is
  not built, because showing a stale count is worse than showing none.
