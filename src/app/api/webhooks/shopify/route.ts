import { createHmac, timingSafeEqual } from 'crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

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

  if (topic.startsWith('products/')) {
    // Broad tag covers shop/homepage listings; a product-specific tag (when
    // the payload includes one) scopes the detail-page revalidation to just
    // the product that changed instead of every generated product page.
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidateTag('products')

    let handle: string | undefined
    try {
      const payload = JSON.parse(rawBody.toString('utf-8')) as { handle?: unknown }
      if (typeof payload.handle === 'string' && payload.handle) {
        handle = payload.handle
      }
    } catch {
      // Payload shape varies by topic / Shopify API version — fall back to
      // the broad 'products' tag above rather than failing the webhook.
    }

    if (handle) {
      revalidateTag(`product:${handle}`)
    }
  }

  if (topic.startsWith('collections/')) {
    revalidatePath('/shop/[collection]', 'page')
    revalidateTag('collections')
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
