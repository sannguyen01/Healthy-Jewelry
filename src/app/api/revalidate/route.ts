import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { PRODUCTS_TAG, collectionTag } from '@/lib/shopify/cacheTags'
import { hjCollections } from '@/lib/data/hj-data'
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
    revalidatePath('/products/[handle]', 'page')

    // Derived, not five hardcoded paths. `hjCollections` is site structure — the same
    // fixed set `/shop/[collection]` prerenders — so a sixth collection is covered here
    // automatically instead of being silently skipped.
    for (const collection of hjCollections) {
      revalidatePath(`/shop/${collection.handle}`, 'page')
    }

    // Shared builders, never string literals.
    //
    // This route used to call `revalidateTag('collections')` — a tag **no fetch anywhere
    // registers**, so the call did nothing. That orphan was removed from the webhook route
    // in an earlier change, but this file was outside the contract test's reach (it read
    // two named files), so the bug survived here. `'products'` was a literal too, correct
    // only by coincidence.
    revalidateTag(PRODUCTS_TAG)
    for (const collection of hjCollections) {
      revalidateTag(collectionTag(collection.handle))
    }

    console.info('[revalidate/route] Revalidation triggered at', new Date().toISOString())

    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('[revalidate/route] Revalidation failed:', err)
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 })
  }
}
