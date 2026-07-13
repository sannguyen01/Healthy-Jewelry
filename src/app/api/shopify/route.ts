import { NextRequest, NextResponse } from 'next/server'
import { shopifyConfig } from '@/config/shopify'
// Allowlist of permitted Storefront GraphQL operation names.
// Reject any request whose operation is not in this set.
const ALLOWED_OPERATIONS = new Set([
  // Queries — names match src/lib/shopify/queries/products.ts
  'GetProductByHandle',
  'GetProducts',
  'GetProductsByCollection',
  'SearchProducts',
  'GetCollections',
  // Cart queries — src/lib/shopify/queries/cart.ts
  'GetCart',
  // Cart mutations — names match src/lib/shopify/mutations/cart.ts
  'CreateCart',
  'AddToCart',
  'UpdateCartLines',
  'RemoveFromCart',
])

// 16 KB covers all legitimate Storefront queries
const MAX_BODY_BYTES = 16_384

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Enforce payload size limit before parsing
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
  }

  let query: unknown
  let variables: unknown

  // Parse body with size guard
  try {
    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    }
    const body = JSON.parse(rawBody) as Record<string, unknown>
    query = body.query
    variables = body.variables
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'Missing required field: query' }, { status: 400 })
  }

  if (variables === undefined || variables === null) {
    return NextResponse.json({ error: 'Missing required field: variables' }, { status: 400 })
  }

  // Enforce operation allowlist — reject unknown or anonymous operations.
  // Not anchored to the start of the string: every query/mutation constant in
  // this codebase interpolates its GraphQL fragment(s) before the operation
  // keyword (see lib/shopify/queries|mutations/*.ts), so an anchored match
  // would never find the operation name. Requiring exactly one match still
  // rejects documents that smuggle a second, unlisted operation alongside an
  // allowed one.
  const operationMatches = [...query.matchAll(/\b(?:query|mutation)\s+(\w+)\s*[({]/g)]
  const operationName = operationMatches.length === 1 ? operationMatches[0][1] : null
  if (!operationName || !ALLOWED_OPERATIONS.has(operationName)) {
    return NextResponse.json({ error: 'Operation not permitted' }, { status: 403 })
  }

  // Read env vars server-side via the shared config — never exposed in response
  const storeDomain = shopifyConfig.storeDomain
  const accessToken = shopifyConfig.storefrontAccessToken

  if (!storeDomain || !accessToken) {
    console.error('[shopify/route] Missing Shopify environment variables')
    return NextResponse.json({ error: 'Shopify integration is not configured' }, { status: 503 })
  }

  // Use shared apiVersion from config (2025-01) to stay in sync
  const endpoint = `https://${storeDomain}/api/${shopifyConfig.apiVersion}/graphql.json`

  let shopifyResponse: Response
  try {
    shopifyResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    })
  } catch (err) {
    console.error('[shopify/route] Network error reaching Shopify:', err)
    return NextResponse.json({ error: 'Failed to reach Shopify API' }, { status: 502 })
  }

  if (!shopifyResponse.ok) {
    console.error('[shopify/route] Shopify returned non-OK status:', shopifyResponse.status)
    return NextResponse.json(
      { error: 'Shopify API returned an error' },
      { status: shopifyResponse.status }
    )
  }

  let data: unknown
  try {
    data = await shopifyResponse.json()
  } catch {
    return NextResponse.json({ error: 'Invalid response from Shopify API' }, { status: 502 })
  }

  return NextResponse.json(data)
}
