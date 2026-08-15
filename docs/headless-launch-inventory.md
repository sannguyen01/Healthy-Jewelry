# Headless launch inventory

**The direct answer to "what am I still missing to run a Shopify headless storefront on
a Vercel-hosted domain."**

Every component, marked **present / missing / unknown / not needed**, with the evidence
it was marked from. Compiled 2026-08-12 by querying the live store
(`y0k9ve-q1.myshopify.com`) through the Admin API, not by reading the codebase — because
every commerce outage this project has had lived in the gap between the two.

> **Read [go-live-runbook.md](go-live-runbook.md) Step 0 first.** This document says what
> exists. The runbook says what order to do the remaining things in, and its Step 0 says
> how to be sure the deployment you are testing is the one you think it is.

---

## The short version

Seven things stand between this store and a customer completing a purchase. Two were
code, and both are done.

| # | Blocker | Whose |
|---|---|---|
| 1 | **No payment provider confirmed.** Not machine-checkable; Shopify Payments does not serve Vietnam. | Yours, in Shopify Admin |
| 2 | **The store is called "My Store 2".** That name is shown to customers at checkout. | Yours, one field |
| 3 | **No product photography.** 0 images on all 22 products. The code is now ready for them. | Yours, an upload |
| 4 | **Upstash unset**, so rate limits count per Lambda instance. | Yours, two env vars |
| 5 | **No order has ever been placed**, so the webhook path is unproven end to end. | Yours, one real order |
| 6 | **Shopify has 1 of 4 checkout policies**, and it is a stock template. Drafts ready to paste. | Yours, in Shopify Admin |
| 7 | **Shopify's own storefront analytics not wired.** | A deliberate, separate decision |

Everything else is present and verified.

---

## Shopify

| Component | State | Evidence |
|---|---|---|
| Store, plan, currency | **Present** | `y0k9ve-q1.myshopify.com` · Basic · VND · Vietnam · `taxesIncluded: true` |
| Storefront API + headless publication | **Present** | Publication `Healthy Jewellery Store` exists; **all 22 products published to it** |
| Products | **Present** | 22, all `ACTIVE` |
| Variants sellable | **Present** | Every variant `availableForSale: true`, `tracksInventory: false` |
| Collections | **Present** | rings 5 · necklaces 4 · earrings 4 · bracelets 5 · charms 4, all published to the headless channel |
| Shipping rates | **Present** | 1 delivery profile, **3 active method definitions across 29 countries** including VN |
| Locales | **Present** | `en` only, primary and published — ADR 005's premise still holds |
| Checkout profile | **Present** | One published (`My Store 2 configuration 2`) — default branding, see below |
| **Store name** | **Missing** | `shop.name` is **"My Store 2"**. Shopify shows this to customers at checkout. |
| **Contact email** | **Attention** | `thesean2007@gmail.com` — a personal Gmail on customer-facing mail |
| **Product photography** | **Missing** | `media: []` on **all 22 products** |
| `custom.spec` metafield | **Missing (by choice)** | 0/22 set. The detail page correctly hides the line. Tracked as a premise. |
| **Payment provider** | **Unknown** | Not exposed by the Admin API at all — see below |
| Orders ever | **0** | `ordersCount: 0` |
| Webhooks | **Unverifiable, now named** | `webhookSubscriptions: []` proves nothing — the query returns only the *querying app's* own. And `verify:webhook` tests the route, not the subscription: a store with no webhook passes it identically. Tracked as the `SHOPIFY-WEBHOOK-DELIVERY` premise, which expires once an order exists. |
| Currencies | **Single** | `enabledPresentmentCurrencies: ["VND"]` — a German customer sees dong |
| **Shop policies** | **Missing — 1 of 4** | Only `PRIVACY_POLICY` exists, and it is Shopify's **unedited template**, still carrying `{{ shop_name }}` and `{{ email }}`. No refund, no terms of service, no shipping policy. See below. |

### Why the payment provider cannot be checked for you

Admin GraphQL exposes no field for "which providers are enabled". `PaymentSettings`
carries only `supportedDigitalWallets`, and `shopifyPaymentsAccount` is scope-denied and
would be null here anyway — **Shopify Payments does not serve Vietnam.** The other route,
reading `paymentGatewayNames` off an order, needs an order to exist, which is the very
thing this unblocks.

So: **Shopify Admin → Settings → Payments**, and do not proceed to a test order until it
shows an active provider. Expect a manual method (bank transfer / COD) or a third-party
gateway. `paymentsPremise` upgrades itself from a reminder into a real assertion the
moment the first order exists.

### The checkout has one policy, and it is a stock template

Shopify's hosted checkout links whichever policies the store has. This store has
`PRIVACY_POLICY` and nothing else — no refund policy, no terms of service, no shipping
policy — while `/shipping` on the site states real terms (30 days, unworn, prepaid label,
refund in 5–7 business days). **The checkout is the surface the customer reads**, and it
is the one page in the purchase journey this codebase does not control.

The policy that does exist is Shopify's template, unedited. `{{ shop_name }}` and
`{{ email }}` interpolate at render time, so the published page currently names the
business **"My Store 2"** and gives the owner's personal Gmail as the data-controller
contact. Presence checks pass that; it looks finished.

You ship to fourteen EU countries, where information about the right of withdrawal has to
be given before the order is placed.

**Drafts are in [`docs/shopify-policies/`](shopify-policies/)** — reconciled from the
site's own pages, not invented — for you to review and paste into **Settings → Policies**.
Two items are left as explicit `[ ]` rather than guessed: the business identity and postal
address EU terms require, and the governing-law jurisdiction (the site currently says
"applicable law", which is not a choice of law).

`pnpm verify:production` now fails when any of the four is absent *or* still contains
Liquid.

### "My Store 2" is a launch blocker, not a cosmetic issue

`shop.name` is the store's identity everywhere Shopify renders it for a customer — most
importantly the hosted checkout, which is the one page in the purchase journey this
codebase does not control. A customer who has spent the whole session on
*Healthy Jewellery* clicks Checkout and lands on a page belonging to *My Store 2*.

That is the single highest-value one-field fix on this list.
**Settings → Store details → Store name.** While there, the contact email is a personal
Gmail address; a customer replying to their order confirmation replies to it.

---

## The storefront (this repository)

| Component | State | Notes |
|---|---|---|
| Catalogue, collections, detail pages | **Present** | Shopify-backed, with the static catalogue as a fallback ([ADR 004](adr/004-static-fallback-is-not-a-data-source.md)) |
| Cart → Shopify → hosted checkout | **Present** | `cartCreate`, typed `CheckoutError`, and a completion state ([ADR 002](adr/002-cart-completion-discriminator.md)) |
| Currency correctness | **Present** | `HJProduct.currencyCode` end to end; VND renders `vi-VN`, zero-decimal |
| SEO, metadata, OG, JSON-LD | **Present** | All read Shopify, not the static catalogue |
| Webhooks → cache revalidation | **Present in code** | Signature verified, cache tags contract-tested. Delivery unproven: zero orders. |
| Rate limiting | **Code present, unconfigured** | Falls back to a per-instance map without Upstash — see below |
| **API version** | **Fixed this round** | Was `2025-01`, retired ~7 months ago and silently falling forward. Now `2026-07`, asserted against Shopify's own header ([ADR 009](adr/009-api-version-must-be-asserted-not-declared.md)) |
| **Deployment identity** | **Added this round** | `/api/version`, a `<meta name="hj-build">` stamp, and `pnpm diagnose:deployment` |
| **Product imagery pipeline** | **Added this round** | Photos appear the moment they are uploaded — no code change |
| **Analytics** | **Added this round** | Consent-gated, first-party, seven typed events ([analytics.md](analytics.md)) |
| **Customer accounts** | **Added this round, unconfigured** | `/account` exists and explains itself. Set the three `SHOPIFY_CUSTOMER_ACCOUNT_*` vars to switch it on — see `.env.local.example`. Not required to sell. |
| Contact form | **Present** | Resend, with a mailto fallback |
| Legal pages | **Present** | `/privacy`, `/terms`, `/legal`, `/shipping`, `/faq` |

### Rate limiting is the one code-side gap left

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset. Without them
`src/lib/utils/rateLimit.ts` falls back to an in-memory map that counts per Lambda
instance, so the effective limit is `limit × concurrent instances`. `/api/shopify` is
unauthenticated and creates real carts, which makes it the endpoint that most wants a
real limiter.

Set them **for Production and Preview** — scoping to Production alone is how this gets
"fixed" and stays broken. Then:

```bash
curl -s https://healthyjewellery.com/api/health
```

---

## Vercel

| Component | State | Notes |
|---|---|---|
| Project + Git deploys | **Present** | `healthy-jewellery`, deploying on push |
| Custom domain | **Unverifiable from here** | Network egress to the live domains is blocked in the session that compiled this. `pnpm diagnose:deployment https://healthyjewellery.com --expect-production` answers it. |
| Environment variables | **Unverifiable from here** | Same. `/api/version` reports whether Shopify is configured *on the deployment you are looking at*. |
| Build-cache staleness | **Now detectable** | `/api/version` compares the fingerprint inlined into the bundle against the live environment. Different means the cache served stale `NEXT_PUBLIC_*` values. |
| Security headers | **Present** | HSTS, `X-Frame-Options`, `nosniff`, referrer policy, permissions policy |
| Image optimisation | **Present** | `cdn.shopify.com` allowlisted |

---

## Not needed

| Thing | Why not |
|---|---|
| Shopify theme | Headless. The Online Store channel exists but no customer is sent to it. |
| Hydrogen / Oxygen | This is Next.js on Vercel, which is a supported headless target. |
| Storefront API rate-limit handling | Storefront API is generous and this catalogue is 22 products behind a 1-hour cache. |
| A CMS | Copy lives in the repo, versioned with the code that renders it. |
| Multi-currency | One market, VND. Adding markets later is a Shopify-side change. |

---

## Deliberately deferred, with reasons

These are real gaps. Each is deferred on a stated tradeoff, not forgotten.

**Open Graph product photography.** The share card renders the product name and price,
not the photograph. Adding one means a CDN fetch inside a route with a hard 2500 ms
cold-start budget, where a timed-out unfurl renders *no* card at all — worse than a plain
one. Do it once photos exist and the budget can be re-measured against a real image.

**Shopify's own storefront analytics.** Needs `@shopify/hydrogen-react`, a `storefrontId`
that is a Hydrogen sales-channel concept this store does not use, and Shopify's Customer
Privacy API — which would leave two consent mechanisms that can disagree. See
[analytics.md](analytics.md).

**Customer accounts — built, not switched on.** `/account`, the OAuth flow, an encrypted
session cookie and order history all exist. They stay dormant until three env vars are
set, because the client ID and secret come from **Shopify Admin → Headless → Customer
Account API settings**, and the callback URL has to be registered there (which is what
stops the redirect being open). Choose the **Confidential** client type: this app has a
server-side session, so the refresh token never reaches a browser.

With `ordersCount: 0` it would ship as an empty state anyway, and that empty state is the
only branch testable until a real order exists — a reason to have it in place *before*
launch rather than after.

**Checkout branding.** A checkout profile is published but carries Shopify defaults. It
is the one page in the purchase journey this repository does not control, and the
"My Store 2" fix above is the highest-value part of it.

**Shop policies — now measured, and the answer was worse than "unverified".** They are
readable after all, via `shopPolicies`. One of four exists and it is a stock template. See
the Shopify section above; drafts are in [`docs/shopify-policies/`](shopify-policies/).

---

## Verifying all of it

```bash
# Which deployment am I even looking at? (Always first.)
pnpm diagnose:deployment https://healthyjewellery.com --expect-production

# The live store and the live site, together.
pnpm verify:production

# Is the webhook secret the right one of the two?
pnpm verify:webhook https://healthyjewellery.com

# Are rate limits real?
curl -s https://healthyjewellery.com/api/health
```

`.github/workflows/production-smoke.yml` runs the second of these every six hours and
opens a labelled issue on failure. It is deliberately **not** part of the merge gate: it
is meant to fail for reasons unrelated to the commit under review, and a Shopify incident
must not become a merge freeze.

## What no automation here can tell you

- Whether a card is actually charged. Only a real order proves that.
- Whether the site *looks* right. Automated coverage asserts legibility and rendered
  pixels; no test has taste.
- Whether the mobile checkout hand-off works on a real phone. Both mobile-only defects
  this project has shipped passed every desktop check.
