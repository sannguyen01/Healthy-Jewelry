import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate secret — check query param first, then header
  const secretParam = request.nextUrl.searchParams.get('secret')
  const secretHeader = request.headers.get('x-shopify-hmac-sha256')
  const expectedSecret = process.env.SHOPIFY_REVALIDATION_SECRET

  if (!expectedSecret) {
    console.error('[revalidate/route] SHOPIFY_REVALIDATION_SECRET is not set')
    return NextResponse.json({ error: 'Revalidation not configured' }, { status: 503 })
  }

  const providedSecret = secretParam ?? secretHeader

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Revalidate all relevant paths and tags
  try {
    revalidatePath('/', 'page')
    revalidatePath('/shop', 'page')
    revalidatePath('/shop/rings', 'page')
    revalidatePath('/shop/necklaces', 'page')
    revalidatePath('/shop/earrings', 'page')
    revalidatePath('/shop/bracelets', 'page')
    revalidatePath('/products/[handle]', 'page')

    // Tag-based revalidation for fine-grained control
    revalidateTag('products')
    revalidateTag('collections')

    console.info('[revalidate/route] Revalidation triggered at', new Date().toISOString())

    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('[revalidate/route] Revalidation failed:', err)
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 })
  }
}
