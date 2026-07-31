import { createHmac, timingSafeEqual } from 'crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

// Product and collection pages are cached for an hour (REVALIDATE.product).
// Anything that changes what a customer can buy, or at what price, has to
// invalidate that cache immediately — an hour of stale stock is an hour of
// overselling, and an hour of stale prices is an hour of orders taken at the
// wrong number.
const HANDLED_TOPIC_PREFIXES = [
  'products/',
  'collections/',
  'inventory_levels/',
  'inventory_items/',
  'orders/',
] as const

interface WebhookPayload {
  handle?: unknown
  line_items?: unknown
}

/** Product handles referenced by an order's line items, for targeted revalidation. */
function handlesFromOrder(payload: WebhookPayload): string[] {
  if (!Array.isArray(payload.line_items)) return []
  const handles = new Set<string>()
  for (const raw of payload.line_items) {
    if (raw && typeof raw === 'object') {
      const handle = (raw as { product_handle?: unknown }).product_handle
      if (typeof handle === 'string' && handle) handles.add(handle)
    }
  }
  return [...handles]
}

function revalidateCatalog(): void {
  revalidatePath('/', 'page')
  revalidatePath('/shop', 'page')
  revalidatePath('/shop/[collection]', 'page')
  revalidateTag('products')
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') ?? ''

  // Payload shape varies by topic and API version — parse once, defensively,
  // and fall back to broad revalidation rather than failing the webhook. A
  // non-2xx response makes Shopify retry and eventually disable the endpoint.
  let payload: WebhookPayload = {}
  try {
    payload = JSON.parse(rawBody.toString('utf-8')) as WebhookPayload
  } catch {
    payload = {}
  }

  if (topic.startsWith('products/')) {
    revalidateCatalog()
    if (typeof payload.handle === 'string' && payload.handle) {
      revalidateTag(`product:${payload.handle}`)
    }
  }

  if (topic.startsWith('collections/')) {
    revalidatePath('/shop/[collection]', 'page')
    revalidateTag('collections')
  }

  // Inventory movement changes `availableForSale`, which drives sold-out
  // badges, the disabled state on size swatches, and whether Add to Bag works
  // at all. The payload identifies an inventory item rather than a product, so
  // there is no handle to scope to — the catalog tag is the correct blast
  // radius here.
  if (topic.startsWith('inventory_levels/') || topic.startsWith('inventory_items/')) {
    revalidateCatalog()
  }

  // An order consumes stock. Revalidating the specific products just bought
  // closes the window where the last unit still shows as available to the next
  // visitor.
  if (topic.startsWith('orders/')) {
    revalidateCatalog()
    for (const handle of handlesFromOrder(payload)) {
      revalidateTag(`product:${handle}`)
    }
  }

  const handled = HANDLED_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))
  if (!handled) {
    // Still a 200: an unrecognised topic is a subscription we do not act on,
    // not an error. Returning non-2xx would make Shopify retry it forever.
    console.info(`[webhooks/shopify] Ignoring unhandled topic: ${topic}`)
    return NextResponse.json({ ok: true, handled: false })
  }

  console.info(`[webhooks/shopify] Processed topic: ${topic}`)
  return NextResponse.json({ ok: true, handled: true })
}
