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
    if (
      computedBuf.length !== headerBuf.length ||
      !timingSafeEqual(computedBuf, headerBuf)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') ?? ''

  if (topic.startsWith('products/')) {
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidatePath('/products/[handle]', 'page')
    revalidateTag('products')
  }

  if (topic.startsWith('collections/')) {
    revalidatePath('/shop/[collection]', 'page')
    revalidateTag('collections')
  }

  console.info(`[webhooks/shopify] Processed topic: ${topic}`)
  return NextResponse.json({ ok: true })
}
