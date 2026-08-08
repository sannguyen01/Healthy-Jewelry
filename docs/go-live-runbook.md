# Go-live runbook

The ordered path from "architecturally operational" to "verified operational."

**The order matters and is not arbitrary.** The remaining work is a dependency
chain, not a checklist:

```
payment provider ──> a real order can exist ──> a webhook can fire ──> the secret can be tested
```

Each step removes a way the next one could fail for an uninteresting reason. Done
out of order, step 3 spends a real transaction discovering something steps 1–2
would have told you for free.

---

## Step 1 — Confirm a payment provider is active

**Shopify Admin → Settings → Payments.**

**Do not proceed until this shows an active provider.** A store with none accepts a
checkout and then cannot take money — the order is never created, so the webhook
never fires, so step 4 tests nothing.

Shopify Payments **does not serve Vietnam**, so expect a manual method (bank
transfer / COD) or a third-party gateway. Do not assume it is configured because
the rest of the store is.

> **Why this is not automated.** It genuinely cannot be. Admin GraphQL's
> `PaymentSettings` type exposes only `supportedDigitalWallets` — there is no
> field for "which providers are enabled." The other route, reading
> `paymentGatewayNames` off an order, needs an order to exist, which is the very
> thing this step unblocks. Verified against the live schema on 2026-08-08; a
> query for `acceptedCardBrands` / `shopifyPaymentsAccountId` is rejected as
> non-existent.

`supportedDigitalWallets` being empty on this store is **not** evidence either
way — it only means no wallets (Apple Pay, Google Pay) are enabled, which is
independent of whether a card or manual provider is.

## Step 2 — Confirm the webhook signing secret

```bash
SHOPIFY_WEBHOOK_SECRET='<the secret from Vercel>' \
SHOPIFY_STORE_DOMAIN=y0k9ve-q1.myshopify.com \
pnpm verify:webhook https://healthyjewellery.com
```

Free, repeatable, and side-effect-free — run it as often as you like. It reports
one of:

| Output | Meaning |
|---|---|
| `✓ SECRET CORRECT` | Order webhooks signed with this secret will be accepted. |
| `✗ WRONG SECRET` | You have the wrong one of the two. See below. |
| `✗ SECRET NOT SET` | The deployment has no `SHOPIFY_WEBHOOK_SECRET` at all. |

**The two-secret trap.** There are two different signing secrets and they are not
interchangeable:

- a webhook created in **Settings → Notifications** is signed with the **signing
  secret shown on that page**;
- a webhook created **by an app** (Admin API `webhookSubscriptionCreate`) is
  signed with that **app's client secret**.

The wrong one produces identical, permanent 401s with no diagnostic signal. On
this store the Admin API reports **zero app-owned webhook subscriptions**, which
means the webhooks are almost certainly Admin-UI ones and want the Notifications
page secret.

> **Do not read that zero as "there are no webhooks."** The
> `webhookSubscriptions` query only returns webhooks owned by the *querying app*.
> Webhooks created in Settings → Notifications are invisible to it by design. An
> empty result is not evidence of absence — a previous session concluded "zero
> webhooks" from exactly this signal and was wrong.

## Step 3 — Place one real order

Only now is this worth doing. Steps 1 and 2 have removed both ways it could fail
for reasons that teach you nothing.

As of 2026-08-08 the store has had **zero orders ever** (`ordersCount: 0`), so
this is genuinely the first one.

## Step 4 — Confirm both ends recorded it

1. **On the site** — the bag empties and shows the completion state. This is the
   `justCompleted` path in `src/store/cart.tsx`. What must *not* happen is
   returning to a bag still holding what you just bought with a live Checkout
   button; that failure mode charges people twice.
2. **In Vercel function logs** — a line reading
   `[webhooks/shopify] order event` with the order name, total, currency, and
   line count. Customer name, email, and address are deliberately excluded.

If the order succeeded but no log line appears, the webhook is not reaching the
deployment at all — re-run step 2, which distinguishes "wrong secret" from "not
configured" from "never arrived."

## Step 5 — Make rate limiting durable

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel.

Without them, `src/lib/utils/rateLimit.ts` falls back to an in-memory map that
counts per Lambda instance — so the limit is effectively per-instance, not
per-user. `/api/shopify` is unauthenticated and creates carts, which makes it the
endpoint that most wants a real limiter. This project already fixed this exact
weakness once for `/api/contact`.

---

## Continuous verification

Once the GitHub secrets below are set, `.github/workflows/production-smoke.yml`
re-checks steps 2–4's preconditions daily and on demand
(**Actions → Production smoke → Run workflow**):

| Secret | Where to get it |
|---|---|
| `PRODUCTION_SITE_URL` | `https://healthyjewellery.com` |
| `SHOPIFY_STORE_DOMAIN` | `y0k9ve-q1.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Copy the value already working in Vercel — do not mint a second one |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Admin → Apps → your custom app |
| `SHOPIFY_WEBHOOK_SECRET` | The same value as Vercel, once step 2 passes |

It checks that the live site serves Shopify data rather than the static fallback,
that every product is still published to the headless publication, that a real
cart yields a real checkout URL, and that the webhook secret still verifies.

It is deliberately **not** part of the merge gate and branch protection must not
require it — it is meant to fail for reasons unrelated to the commit under
review, and a Shopify incident must not become a merge freeze.

## What is still not covered

- **Payment provider status** — step 1, human-only, for the schema reason above.
- **Whether a card is actually charged** — only a real order proves that.
- **Visual QA in a real browser** — automated coverage asserts legibility and
  rendered pixels, but no test has opinions about whether the site looks right.
