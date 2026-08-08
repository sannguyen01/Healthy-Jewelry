# Shopify Webhooks

Handler: `src/app/api/webhooks/shopify/route.ts`. Endpoint: `POST /api/webhooks/shopify`.

## Verification

Every request is HMAC-verified before any part of the body is parsed:

1. Read the **raw** body via `req.arrayBuffer()` — not `req.json()`. Shopify signs the
   exact bytes sent; parsing first and re-serializing would not reliably reproduce them.
2. Compute `createHmac('sha256', SHOPIFY_WEBHOOK_SECRET).update(rawBody).digest('base64')`.
3. Compare against the `x-shopify-hmac-sha256` header using `timingSafeEqual`, behind a
   length guard (`timingSafeEqual` throws on mismatched buffer lengths rather than
   returning `false`).
4. Return `401` on any mismatch, `503` if `SHOPIFY_WEBHOOK_SECRET` isn't configured at
   all — both **before** `JSON.parse` ever runs on the body.

Then, separately: the `x-shopify-shop-domain` header is checked against the configured
store. The signature proves the sender holds our secret; this proves the payload is about
*our* store, and rejects cross-shop deliveries with `401`. Only enforced when a store
domain is configured, so an unconfigured preview deployment does not reject everything.

## The two-secret trap

There are **two different signing secrets**, and they are not interchangeable:

- a webhook created in **Settings → Notifications** is signed with the **signing secret
  shown on that page**;
- a webhook created **by an app** (Admin API `webhookSubscriptionCreate`) is signed with
  that **app's client secret**.

The wrong one produces identical, permanent `401`s with zero diagnostic signal. A wrong
secret and a forgery are cryptographically indistinguishable, so the route never changes
its *response* — it stays a bare `401` — it only names the trap in the log line.

**Verify the secret without placing an order:**

```bash
SHOPIFY_WEBHOOK_SECRET=... pnpm verify:webhook https://healthyjewellery.com
```

`scripts/verify-webhook-secret.mjs` signs a synthetic `products/update` payload and reads
the status back: `200` correct, `202` correct but unhandled topic, `401` wrong secret,
`503` not set. See `docs/go-live-runbook.md`.

> **The Admin API cannot tell you whether webhooks exist.** `webhookSubscriptions` returns
> only webhooks owned by the *querying app*, so Admin-UI webhooks are invisible to it. An
> empty result is **not** evidence of absence — a previous session concluded "zero
> webhooks" from exactly that signal and was wrong.

## Topics subscribed

Registered in Shopify Admin per `SHOPIFY_SETUP.md`. Only these prefixes are handled:

| Topic prefix | Effect |
|---|---|
| `products/*` | `revalidatePath('/')`, `revalidatePath('/shop')`, `revalidateTag('products')`, plus `revalidateTag('product:<handle>')` when the payload includes a handle |
| `collections/*` | `revalidatePath('/shop/[collection]')`, `revalidateTag('collections')` |
| `orders/create`, `orders/paid` | Logged only (see below) — no revalidation |

Anything else is **allowlisted out** and answered `202 {ok:true, handled:false, topic}`.

The status code is the point. A `200` would claim work that never happened, lying to
Shopify's delivery log; a non-2xx would make Shopify retry a topic that will never be
handled. `202` says *received and authenticated, deliberately not acted on* — which is
the truth.

## Order events

`orders/*` events are **logged, not acted on**. The site takes no part in payment —
Shopify's hosted checkout charges the card and sends the confirmation email — so this
exists only to give the storefront operator a record that a sale happened.

Logged fields: order id, order name (`#1001`), total, currency, financial status, and
line-item count. **Deliberately excludes** customer name, email, and address — Vercel
function logs are visible to every project member, and this repo already had to fix a
PII-in-logs issue once (the contact route; see `STATE.md`).

**No confirmation email is sent from this codebase.** Shopify already sends one; a
second would carry worse data and no way to stay in sync with refunds or fulfilment
changes made in Shopify Admin.

## Known tradeoff: no cross-invocation dedupe

There is no dedupe map for webhook deliveries. Shopify retries on any non-2xx response,
which can produce duplicate log lines for the same order. This is accepted rather than
fixed because:

- The handler only logs for `orders/*` — a duplicate log line is harmless.
- An in-memory dedupe map would not work across serverless invocations anyway. This
  project already hit that exact failure mode once, when an in-memory rate limiter was
  replaced with Upstash Redis for the contact route (see `STATE.md`). Adding a second
  in-memory map here would reintroduce the same bug in a new place.

If order-event volume grows enough that duplicate log lines become a real cost, the fix
is a shared store (Upstash Redis, same as the contact route), not an in-memory map.

## Testing

Route logic is covered by `src/tests/unit/api-webhooks-shopify-route.test.ts`, and
`src/tests/unit/webhook-signature-script.test.ts` proves `scripts/verify-webhook-secret.mjs`
signs bodies the route accepts — by feeding the script's own bytes and headers into the real
`POST` handler rather than comparing against a fixture, so the two cannot drift apart. E2E
coverage lives in `e2e/checkout.spec.ts`.

Against the live deployment, `.github/workflows/production-smoke.yml` re-runs the secret
check daily.
