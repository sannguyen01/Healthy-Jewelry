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

## Topics subscribed

Registered in Shopify Admin per `SHOPIFY_SETUP.md`; handled by topic prefix:

| Topic prefix | Effect |
|---|---|
| `products/*` | `revalidatePath('/')`, `revalidatePath('/shop')`, `revalidateTag('products')`, plus `revalidateTag('product:<handle>')` when the payload includes a handle |
| `collections/*` | `revalidatePath('/shop/[collection]')`, `revalidateTag('collections')` |
| `orders/create`, `orders/paid` | Logged only (see below) — no revalidation |

Any other topic falls through with no action beyond the `Processed topic: <topic>` log
line.

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

Route logic is covered by `src/tests/unit/api-shopify-route.test.ts` and the HMAC/topic
handling paths in the webhook route itself. E2E coverage lives in `e2e/checkout.spec.ts`.
