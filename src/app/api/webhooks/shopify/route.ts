import { createHmac, timingSafeEqual } from 'crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { shopifyConfig } from '@/config/shopify'
import { PRODUCTS_TAG, productTag, collectionTag } from '@/lib/shopify/cacheTags'
import { HANDLED_TOPIC_PREFIXES } from '@/lib/webhooks/retrySafety'

/**
 * Topics this endpoint is built to handle, and why re-delivery of each is harmless, live in
 * `@/lib/webhooks/retrySafety`. Two reasons they are not here:
 *
 * 1. A Next.js `route.ts` may only export route handlers and a fixed set of config keys, so a
 *    table exported from this file is a type error.
 * 2. Shopify retries on any non-2xx and re-delivers on its own schedule. Every handler below
 *    is safe to run twice — but that was true *by accident* until something said so. See
 *    `RETRY_SAFE`, which a unit test holds against this list in both directions.
 *
 * The unhandled-topic branch stands as it was: previously any topic at all was answered
 * `200 {ok:true}`, including topics never subscribed to and anything an attacker holding the
 * signing secret chose to send. Answering 200 to work you did not do is a lie to Shopify's
 * delivery log.
 */


/**
 * Why a signature check failed, in a form the operator can act on.
 *
 * There are **two different secrets** depending on how the webhook was created,
 * and picking the wrong one produces an endless stream of silent 401s with no
 * clue anywhere:
 *
 *   - a webhook created **by an app** (Admin API `webhookSubscriptionCreate`)
 *     is signed with that app's **client secret**;
 *   - a webhook created in **Settings → Notifications** is signed with the
 *     **signing secret shown on that page**, which is a different value.
 *
 * A wrong secret and a forged request are indistinguishable from the signature
 * alone, so this never changes the *response* — always 401 — it only changes
 * what gets logged, and only for requests that carry a plausibly-shaped header.
 */
function explainSignatureFailure(hmacHeader: string): string {
  if (!hmacHeader) {
    return 'no x-shopify-hmac-sha256 header — not a Shopify delivery'
  }
  return (
    'signature mismatch. If deliveries are failing consistently, SHOPIFY_WEBHOOK_SECRET is ' +
    'probably the wrong one of the two: webhooks created in Shopify Admin (Settings → ' +
    'Notifications) are signed with the signing secret shown on that page, while webhooks ' +
    'created by an app are signed with the app client secret. They are not interchangeable.'
  )
}

/**
 * The `handle` from a webhook payload, or undefined.
 *
 * Both the products and collections branches need exactly this, and both had their own
 * copy of the parse plus an identically-worded `try/catch`. Two copies of one idea is how
 * the collections cache tag drifted in the first place — one branch was corrected and the
 * other was not — so the idea now exists once.
 *
 * Swallowing the parse error is deliberate and unchanged: payload shape varies by topic and
 * API version, and Shopify retries on a non-2xx. A body that cannot be parsed will not
 * parse on the retry either, so failing the delivery would trade a scoped invalidation for
 * an infinite redelivery loop. The broad invalidation each branch already performed stands.
 *
 * `orders/*` keeps its own parse: it reads a different shape for a different purpose, and
 * folding it in here would couple two things that only look alike.
 */
function readHandle(rawBody: Buffer): string | undefined {
  try {
    const payload = JSON.parse(rawBody.toString('utf-8')) as { handle?: unknown }
    return typeof payload.handle === 'string' && payload.handle ? payload.handle : undefined
  } catch {
    return undefined
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = Buffer.from(await req.arrayBuffer())
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? ''
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET

  if (!secret) {
    console.error('[webhooks/shopify] SHOPIFY_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const computed = createHmac('sha256', secret).update(rawBody).digest('base64')

  // Use timingSafeEqual to prevent timing attacks
  try {
    const computedBuf = Buffer.from(computed)
    const headerBuf = Buffer.from(hmacHeader)
    if (computedBuf.length !== headerBuf.length || !timingSafeEqual(computedBuf, headerBuf)) {
      console.warn(`[webhooks/shopify] rejected: ${explainSignatureFailure(hmacHeader)}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    console.warn(`[webhooks/shopify] rejected: ${explainSignatureFailure(hmacHeader)}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The signature proves the sender holds our secret; this proves the payload
  // is about *our* store. Only enforced when a store domain is configured, so
  // an unconfigured preview deployment does not reject everything.
  const shopDomain = req.headers.get('x-shopify-shop-domain')
  const expectedDomain = shopifyConfig.storeDomain
  if (expectedDomain && shopDomain && shopDomain !== expectedDomain) {
    console.warn('[webhooks/shopify] rejected: delivery for a different shop', {
      received: shopDomain,
      expected: expectedDomain,
    })
    return NextResponse.json({ error: 'Unknown shop' }, { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') ?? ''

  if (!HANDLED_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))) {
    // 202: received and authenticated, deliberately not acted on. A 200 here
    // would claim work that never happened; a non-2xx would make Shopify retry
    // a topic we will never handle.
    console.info(`[webhooks/shopify] unhandled topic, ignoring: ${topic || '(none)'}`)
    return NextResponse.json({ ok: true, handled: false, topic }, { status: 202 })
  }

  if (topic.startsWith('products/')) {
    // Broad tag covers shop/homepage listings; a product-specific tag (when
    // the payload includes one) scopes the detail-page revalidation to just
    // the product that changed instead of every generated product page.
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidateTag(PRODUCTS_TAG)

    const handle = readHandle(rawBody)
    if (handle) {
      revalidateTag(productTag(handle))
    }
  }

  if (topic.startsWith('collections/')) {
    revalidatePath('/shop/[collection]', 'page')
    // Collection listings are fetched with `collectionTag(handle)`. This branch
    // used to revalidate a bare 'collections' string that no fetch ever
    // registered, so the call did nothing at all and collection pages stayed
    // stale for the full 3600s regardless of what changed in Shopify Admin.
    // `cache-tag-contract.test.ts` now fails on any tag only one side knows.
    //
    // Deliberately not PRODUCTS_TAG: that is every product cache in the store,
    // and a collection changing does not invalidate the products themselves.
    // Scoping was an explicit decision the previous tests already guarded.
    const handle = readHandle(rawBody)
    if (handle) {
      revalidateTag(collectionTag(handle))
    }
  }

  // Orders. The site takes no part in payment — Shopify's hosted checkout
  // charges the card and sends the confirmation email — so this exists to give
  // the storefront a record that a sale happened, and a place to hang future
  // fulfilment work.
  //
  // Deliberately does not send its own confirmation email: Shopify already
  // sends one, and a second would be worse than none.
  if (topic.startsWith('orders/')) {
    try {
      const order = JSON.parse(rawBody.toString('utf-8')) as {
        id?: unknown
        name?: unknown
        total_price?: unknown
        currency?: unknown
        financial_status?: unknown
        line_items?: unknown
      }
      const lineCount = Array.isArray(order.line_items) ? order.line_items.length : 0
      // Order name (e.g. "#1001") and totals only — no customer name, email or
      // address. Vercel function logs are visible to every project member, and
      // the contact route already had to be fixed for logging PII.
      console.info('[webhooks/shopify] order event', {
        topic,
        id: typeof order.id === 'number' || typeof order.id === 'string' ? order.id : null,
        name: typeof order.name === 'string' ? order.name : null,
        total: typeof order.total_price === 'string' ? order.total_price : null,
        currency: typeof order.currency === 'string' ? order.currency : null,
        financialStatus:
          typeof order.financial_status === 'string' ? order.financial_status : null,
        lineCount,
      })
    } catch {
      // A malformed body must not fail the webhook — Shopify retries on a
      // non-2xx, and repeated retries of an unparseable payload help nobody.
      console.warn(`[webhooks/shopify] order event with unparseable payload: ${topic}`)
    }
  }

  console.info(`[webhooks/shopify] Processed topic: ${topic}`)
  return NextResponse.json({ ok: true })
}
