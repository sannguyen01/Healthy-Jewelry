# Go-live runbook

The ordered path from "architecturally operational" to "verified operational."

**The order matters and is not arbitrary.** The remaining work is a dependency
chain, not a checklist:

```
know which deployment you are looking at
   └─> payment provider ──> a real order can exist ──> a webhook can fire ──> the secret can be tested
```

Step 0 sits outside the chain because it is not a step *towards* anything — it is
the precondition for any of the others meaning what you think they mean.

Each step removes a way the next one could fail for an uninteresting reason. Done
out of order, step 3 spends a real transaction discovering something steps 1–2
would have told you for free.

---

## Step 0 — Confirm which deployment you are looking at

```bash
pnpm diagnose:deployment https://healthyjewellery.com --expect-production
```

**Do this before every other step, including the ones you have run before.** Every
step below draws a conclusion from a page. If that page came from a different
commit, a different Vercel environment, or a build carrying stale inlined
variables, the conclusion is about something else entirely — and nothing on the
page says so.

This has cost real time repeatedly. A session once diagnosed a checkout failure at
length from a screenshot of a `.vercel.app` alias, reasoning about code that alias
had never been built from.

One command answers all of it:

| Verdict | Means |
|---|---|
| `Production deployment` | These are the Production environment variables. A Preview alias has its own, and can be unconfigured while Production is fine. |
| `Serving the tip of the default branch` | The merge you are checking is actually live here. |
| `Frozen alias` | This URL is stuck on a commit that predates the branch tip and **will never update**. A branch-preview alias after its branch merged: it renders, the cart works, and it is a snapshot of an app that no longer exists. |
| `This build carries stale inlined NEXT_PUBLIC_* values` | The `NEXT_PUBLIC_*` values compiled into the JavaScript differ from the ones the environment now holds. A redeploy reused the build cache. **Redeploy with "Use existing Build Cache" unchecked** — setting the variable again and redeploying normally will not fix it. |
| `The store domain is NOT in the served JavaScript` | `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` was absent when this bundle was built. The cart cannot sync and Checkout can never produce a `checkoutUrl`, whatever the variable is set to now. |
| `The page is serving the static fallback catalogue` | The page is rendering `src/lib/data/hj-data.ts` — "Dome Ring" and friends, products that have never existed in Shopify. Nothing on it can be bought. |

Exits non-zero on any of the failure verdicts, so it can gate a script.

**Always test the production domain, or the canonical project alias — never a
hashed preview alias.** A preview alias is the single most reliable way to spend an
afternoon debugging a snapshot.

Two facts are also readable without any tooling, which matters on the phone that
step 5 requires:

- **`view-source:` → `<meta name="hj-build">`** carries the commit, environment,
  build time and config fingerprint of the page in front of you.
- **`/api/version`** returns the same, plus `bundleIsStale` and whether Shopify is
  configured at all on this deployment.

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

> **What this does not prove: that Shopify sends any.**
>
> The probe is a request *this project signed itself* and POSTed at the route. It
> confirms the deployment recomputes the same signature — nothing more. A store with
> **no webhook configured at all** passes it identically, because the probe never
> involves Shopify.
>
> There is no way to close that from here. `webhookSubscriptions` returns only the
> *querying app's* own subscriptions, so an Admin-UI webhook is invisible to it and an
> empty list is not evidence of absence. Delivery becomes checkable only once a real
> order exists, which is Step 4.
>
> Tracked as the `SHOPIFY-WEBHOOK-DELIVERY` premise, which expires by itself the moment
> `ordersCount > 0` — the same shape as the payments blocker.

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

## Step 5 — Verify the mobile checkout hand-off by hand

Desktop parity is not a safe assumption here. Both mobile-only defects this
project has shipped — the hero crop that discarded 75% of the frame at 390px,
and the collection tiles that rendered at `opacity: 0.12` — passed every desktop
check. That is why `hero-legibility.spec.ts` samples six widths.

On a real phone, not an emulator: add to bag → open the bag → Checkout, and
confirm the redirect lands on Shopify's hosted checkout with the right items and
a VND total. This is the half of `VISUAL-QA-LIVE` that automation cannot reach.

## Step 6 — Make rate limiting durable

Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel, for
**Production and Preview**. Scoping them to Production alone is how this gets
"fixed" and stays broken.

Without them, `src/lib/utils/rateLimit.ts` falls back to an in-memory map that
counts per Lambda instance — so the effective limit is `limit × concurrent
instances`. `/api/shopify` is unauthenticated and creates carts, which makes it
the endpoint that most wants a real limiter. This project already fixed this
exact weakness once for `/api/contact`.

Check it with one call:

```bash
curl -s https://healthyjewellery.com/api/health
```

| Response | Meaning |
|---|---|
| `{"rateLimitDistributed":true,"redis":"ok","healthy":true}` (200) | Limits are shared across instances. |
| `"redis":"unreachable"` (503) | Configured, but Upstash is not answering — limits are failing open. |
| `"rateLimitDistributed":false` (503) | The env vars are unset in this environment. |

The endpoint spends a real Redis round-trip rather than just reading the env
vars, because a typo'd URL, a revoked token, or a paused database all leave the
flag `true` while every limit check silently fails open.

---

## Continuous verification

Once the secrets below are set, `.github/workflows/production-smoke.yml`
re-checks steps 2–4's preconditions **every 6 hours** and on demand
(**Actions → Production smoke → Run workflow**).

> **It cannot run until PR #17 is merged.** Scheduled runs execute only from the default
> branch, and `workflow_dispatch` needs the file there before the "Run workflow" button
> appears. While the workflow lives only on a feature branch it is not failing — it does
> not exist as far as the Actions API is concerned. Merge first, then configure.

**On failure it opens a GitHub issue** labelled `production-smoke` (and closes it on
recovery), because a non-blocking scheduled job nobody watches will rot silently.

### First, create the environment

**This repository is public and forkable**, so the smoke-test credentials live in a GitHub
Environment rather than as bare repository secrets — an environment can carry required
reviewers and a branch allowlist, so widening the credential set later is a visible action
rather than an unreviewed edit.

1. **Settings → Environments → `production-readonly`.** It may already exist: GitHub
   **creates an environment automatically** the first time a workflow names one. Its
   existence therefore proves nothing — an auto-created environment has **no protection
   rules and no secrets**.
2. Add the five secrets below **to that environment**, not to repository secrets.
3. Add an environment **variable** `SMOKE_SECRETS_SOURCE` = `environment`.

Step 3 is not decoration. A job with an `environment:` key **still receives repository
secrets**, so five repo-scoped secrets would turn this workflow green with no isolation and
no signal anywhere. `scripts/preflight-secrets.mjs` asserts that marker and fails the run
when it is absent, which is the only way the difference is observable. See
[ADR 006](adr/006-controls-must-fail-loudly.md).

> An earlier revision of this runbook claimed the workflow "fails at dispatch" until the
> environment is created. That was wrong, and wrong in the dangerous direction — it implied
> the setup step could not be skipped, when in fact skipping it produces a green run.

| Secret | Where to get it |
|---|---|
| `PRODUCTION_SITE_URL` | `https://healthyjewellery.com` |
| `SHOPIFY_STORE_DOMAIN` | `y0k9ve-q1.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Copy the value already working in Vercel — do not mint a second one |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Admin → Apps → your custom app. Read scopes only |
| `SHOPIFY_WEBHOOK_SECRET` | The same value as Vercel, once step 2 passes |

Every one is read-only by design. The Storefront token is public-safe by construction — it
is the same class of credential already shipped to browsers. The Admin token is used for a
single publication-count query. No workflow step echoes a secret or interpolates one into a
`run:` string; they reach the scripts through `env:`, where log masking applies.

It checks that the live site serves Shopify data rather than the static fallback,
that every product is still published to the headless publication, that a real
cart yields a real checkout URL, that product metadata and the Open Graph image
name the real product, that site search finds Shopify products, that rate
limiting is distributed, that the webhook secret still verifies, and that a
signed webhook **actually drops the cached page** — the one link in the
Shopify → Vercel direction that no hermetic test can prove, since a unit test can
only assert `revalidateTag` was called with some string, which is exactly the
assertion that stayed green while that string matched nothing.

It is deliberately **not** part of the merge gate and branch protection must not
require it — it is meant to fail for reasons unrelated to the commit under
review, and a Shopify incident must not become a merge freeze.

## What is still not covered

- **Payment provider status** — step 1, human-only, for the schema reason above.
- **Whether a card is actually charged** — only a real order proves that.
- **Visual QA in a real browser** — automated coverage asserts legibility and
  rendered pixels, but no test has opinions about whether the site looks right.
