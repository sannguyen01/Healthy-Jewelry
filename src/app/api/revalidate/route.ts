import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'crypto'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.SHOPIFY_REVALIDATION_SECRET

  if (!expectedSecret) {
    console.error('[revalidate/route] SHOPIFY_REVALIDATION_SECRET is not set')
    return NextResponse.json({ error: 'Revalidation not configured' }, { status: 503 })
  }

  // Accept secret only via header — never via query param (query params appear in logs)
  const providedSecret = request.headers.get('x-revalidate-secret')

  // Timing-safe comparison prevents byte-by-byte secret recovery via timing attacks
  const secretsMatch =
    providedSecret !== null &&
    providedSecret.length === expectedSecret.length &&
    timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret))

  if (!secretsMatch) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidatePath('/shop/rings', 'page')
    revalidatePath('/shop/necklaces', 'page')
    revalidatePath('/shop/earrings', 'page')
    revalidatePath('/shop/bracelets', 'page')
    revalidatePath('/shop/charms', 'page')
    revalidatePath('/products/[handle]', 'page')

    revalidateTag('products')
    revalidateTag('collections')

    console.info('[revalidate/route] Revalidation triggered at', new Date().toISOString())

    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('[revalidate/route] Revalidation failed:', err)
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 })
  }
}
