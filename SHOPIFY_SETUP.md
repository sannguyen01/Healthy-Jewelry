# Shopify Activation Runbook

This site builds and runs completely without Shopify — `src/lib/data/hj-data.ts` is a
full static catalog and every fetch in `src/lib/shopify/index.ts` falls back to it. That
is a feature: it's why the site is always deployable. It also means an unconfigured
production deploy looks completely healthy right up until a customer clicks Checkout.

`src/lib/shopify/env-check.ts` prints a build-time warning naming exactly what's missing;
this doc is the runbook for fixing it. See `STATE.md` for the live status of each item
below — this file explains *how*, `STATE.md` tracks *whether it's done*.

## 1. Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Scope | Inlined at build? |
|---|---|---|
| `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` | Production **and** Preview | Yes |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Production **and** Preview | No |
| `SHOPIFY_WEBHOOK_SECRET` | Production **and** Preview | No |
| `SHOPIFY_REVALIDATION_SECRET` | Production **and** Preview | No |

See `.env.local.example` for what each variable is used for locally.

### Two traps that have already cost real time on this project

1. **Vercel scopes variables per environment.** Setting them for Production only leaves
   every Preview deployment broken in the exact same way, with no error telling you the
   two differ.
2. **`NEXT_PUBLIC_*` values are inlined into the client bundle at build time.** Setting
   the variable and then hitting "Redeploy" on an existing deployment does nothing — a
   redeploy can reuse the cached build. You need a **fresh build** (push a new commit, or
   use "Redeploy" with the cache-reuse option turned off).

## 2. Shopify webhook registration

**Shopify Admin → Settings → Notifications → Webhooks → Create webhook**

- URL: `https://<your-domain>/api/webhooks/shopify`
- Format: JSON
- Topics to register:
  - `products/create`, `products/update`, `products/delete`
  - `collections/create`, `collections/update`
  - `orders/create`, `orders/paid`

The signing secret Shopify gives you when you create the webhook is
`SHOPIFY_WEBHOOK_SECRET` above. Full verification/logging detail: `docs/webhooks.md`.

## 3. Catalog conventions on the real store

Before the real catalog goes live, confirm every product has:

- An `svg:` tag (e.g. `svg:ring-dome`) — see `docs/catalog-conventions.md` for the full
  list and what happens when it's missing (nothing loud; the wrong illustration renders
  silently).
- The store's currency configured correctly — prices now carry
  `priceRange.minVariantPrice.currencyCode` end to end (`src/lib/utils/formatPrice.ts`,
  guarded by `src/tests/unit/currency-consistency.test.tsx`), so whatever currency
  Shopify Admin is set to is what the site will display *and* what checkout will charge.
  Confirm they match your intent before launch.

## 4. Verify checkout is actually live

Do not consider Shopify "connected" until you've completed this sequence on the real
deployed URL, in a normal browser (not a sandboxed/agent session — the network policy in
CI and most agent sandboxes blocks external hosts, so this cannot be verified from here):

1. Add an item to the bag.
2. Click Checkout.
3. Confirm the browser lands on `*.myshopify.com` — not an error state, not `/checkout`
   stuck on a spinner.
4. Confirm the price and currency symbol shown on `*.myshopify.com` **match what the
   site displayed** before the redirect.
5. Complete one real purchase (use a discount code or Shopify's test mode if available).
6. Confirm Shopify's own order-confirmation email arrives. (The site deliberately sends
   no confirmation of its own — see `docs/webhooks.md`.)
7. Check Vercel function logs for `[webhooks/shopify] order event` — confirms the
   `orders/create` webhook fired and was verified.
8. Check Vercel function logs for `[webhooks/shopify] order event` a second time after
   the order is marked paid in Shopify Admin — confirms `orders/paid` fired.

If step 2 or 3 fails, the site's own error state will now name the specific cause
(`not-configured`, `placeholder-catalog`, `network`, or `shopify-error` —
`src/lib/utils/checkoutMessages.ts`) instead of showing a spinner forever.

## Related docs

- `STATE.md` — live status of every item above (loop-maintained; check before assuming
  anything here is still pending)
- `docs/webhooks.md` — HMAC verification, topics, logging
- `docs/catalog-conventions.md` — `svg:` tags, handle naming, variant/pricing rules
- `.env.local.example` — full variable list with inline comments
