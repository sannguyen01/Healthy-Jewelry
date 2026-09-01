/**
 * **Why re-delivering each handled Shopify topic is harmless.**
 *
 * Shopify retries on any non-2xx and re-delivers on its own schedule, so every handler in
 * `src/app/api/webhooks/shopify/route.ts` runs an unknown number of times per event. That
 * endpoint keeps no `X-Shopify-Webhook-Id` and no dedupe store, and it does not need one —
 * but only because of what the handlers happen to do, and *that* was true by accident until
 * this table existed.
 *
 * Nothing was wrong. Nothing was written down either, which is the same shape as
 * [ADR 027](../../../docs/adr/027-governance-and-execution-are-different-questions.md)'s
 * pattern: a property held, and no one had asked the question it depended on. The answer to
 * "is this endpoint safe under retry?" was yes — derived from the current handler bodies, by
 * a reader, once.
 *
 * ## The two labels
 *
 * `invalidation-only` — the handler calls `revalidatePath`/`revalidateTag` and nothing else.
 * Running it twice marks the same cache entries stale twice, which is the same state.
 *
 * `log-only` — the handler writes a `console.info` and nothing else. A duplicate line is
 * noise in the Vercel log, not corruption.
 *
 * ## What this forbids
 *
 * A handler that writes a record, sends mail, mints a discount, or moves stock is **not**
 * retry-safe, and filing one under either label would be false rather than merely untidy. At
 * that point the endpoint needs real idempotency — persist the `X-Shopify-Webhook-Id` header
 * and drop a repeat — and that is the change to make, instead of widening a label to fit.
 *
 * Building that store now would be speculative: the connected store has had zero orders ever,
 * and the orders branch deliberately sends no email because Shopify already sends one. So the
 * property is recorded and enforced rather than pre-solved.
 *
 * `src/tests/unit/api-webhooks-shopify-route.test.ts` fails when a topic prefix is handled
 * without an entry here — [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)'s
 * rule that an unclassified entry is an unverified one, applied to handlers instead of colour
 * tokens. There is no third state, because "nobody asked whether this is safe under retry" is
 * exactly how it would stop being safe.
 *
 * This module deliberately does not live under `src/lib/shopify/`, which `loop-constraints.md`
 * denylists for autonomous edits.
 */

/** Topics the webhook route acts on. The route imports this; the two cannot drift. */
export const HANDLED_TOPIC_PREFIXES = ['products/', 'collections/', 'orders/'] as const

export type HandledTopicPrefix = (typeof HANDLED_TOPIC_PREFIXES)[number]

export type RetrySafety = 'invalidation-only' | 'log-only'

export const RETRY_SAFE: Record<HandledTopicPrefix, { kind: RetrySafety; why: string }> = {
  'products/': {
    kind: 'invalidation-only',
    why: 'revalidatePath("/"), revalidatePath("/shop") and revalidateTag(PRODUCTS_TAG), plus a productTag when the payload carries a handle. No writes and no outbound calls, so a repeat marks the same entries stale again.',
  },
  'collections/': {
    kind: 'invalidation-only',
    why: 'revalidatePath("/shop/[collection]") and revalidateTag(collectionTag) when the payload carries a handle. Same reasoning; deliberately not PRODUCTS_TAG, which would be every product cache in the store.',
  },
  'orders/': {
    kind: 'log-only',
    why: 'One console.info of order name and totals, with no customer PII. Deliberately sends no email: Shopify already sends the confirmation, and a second would be worse than none. A duplicate log line is noise, not corruption.',
  },
}
