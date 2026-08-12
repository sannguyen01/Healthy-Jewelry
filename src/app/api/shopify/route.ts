import { NextRequest, NextResponse } from 'next/server'
import { shopifyConfig } from '@/config/shopify'
import {
  CREATE_CART,
  ADD_TO_CART,
  UPDATE_CART_LINES,
  REMOVE_FROM_CART,
} from '@/lib/shopify/mutations/cart'
import { GET_CART } from '@/lib/shopify/queries/cart'
import { reportApiVersionDrift } from '@/lib/shopify/api-version'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'

// Persisted queries: the browser sends an operation key, never GraphQL text.
// The server resolves the key to its own literal query string below, so a
// tampered/replayed request body can select a different persisted operation
// at most — it can never smuggle a different selection set or arguments
// shape onto an operation name it doesn't own (e.g. slipping `discountCodes`
// or `note` into `cartCreate`'s input). Only operations this client-facing
// proxy actually needs are listed; product/collection reads happen
// server-side via shopifyFetch and never reach this endpoint.
// Object.create(null): a plain {}-literal inherits from Object.prototype, so
// an operation key like "constructor" or "toString" would resolve to an
// inherited function (truthy) and slip past the `if (!query)` 403 check
// below instead of being rejected as an unknown operation.
const PERSISTED_QUERIES: Record<string, string> = Object.assign(Object.create(null), {
  GetCart: GET_CART,
  CreateCart: CREATE_CART,
  AddToCart: ADD_TO_CART,
  UpdateCartLines: UPDATE_CART_LINES,
  RemoveFromCart: REMOVE_FROM_CART,
})

// 16 KB covers all legitimate Storefront queries
const MAX_BODY_BYTES = 16_384

/**
 * This route spends the store's Shopify API quota and can create real carts,
 * and it is public and unauthenticated by necessity — the browser has to reach
 * it. Without a limiter, anyone could exhaust the Storefront rate limit for
 * every genuine shopper, and fill Shopify Admin's abandoned-checkout report
 * with carts nobody built.
 *
 * The window is far looser than the contact form's (5/hour): a real shopper
 * legitimately triggers several operations per checkout attempt, and each bag
 * edit re-syncs. This is a ceiling on abuse, not a budget for browsing.
 */
const limiter = createRateLimiter({ limit: 60, window: '1 m', prefix: 'hj:shopify' })

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await limiter.isLimited(clientIp(request.headers))) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  // Enforce payload size limit before parsing
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
  }

  let operation: unknown
  let variables: unknown

  // Parse body with size guard
  try {
    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 })
    }
    const body = JSON.parse(rawBody) as Record<string, unknown>
    operation = body.operation
    variables = body.variables
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof operation !== 'string' || !operation.trim()) {
    return NextResponse.json({ error: 'Missing required field: operation' }, { status: 400 })
  }

  if (variables === undefined || variables === null) {
    return NextResponse.json({ error: 'Missing required field: variables' }, { status: 400 })
  }

  // Resolve the operation key to our own literal query text — the client
  // never supplies GraphQL text, so it cannot alter an operation's selection
  // set or arguments regardless of what the request body contains.
  const query = PERSISTED_QUERIES[operation]
  if (!query) {
    return NextResponse.json({ error: 'Operation not permitted' }, { status: 403 })
  }

  // Read env vars server-side via the shared config — never exposed in response
  const storeDomain = shopifyConfig.storeDomain
  const accessToken = shopifyConfig.storefrontAccessToken

  if (!storeDomain || !accessToken) {
    console.error('[shopify/route] Missing Shopify environment variables')
    return NextResponse.json({ error: 'Shopify integration is not configured' }, { status: 503 })
  }

  // Shared apiVersion from config, never a literal — see ADR 009. The response's
  // own X-Shopify-API-Version is checked below, because naming a version and
  // being served it are different facts.
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

  // This route bypasses `shopifyFetch` and talks to Shopify itself, so it needs
  // its own version check — and it is the surface that most wants one. Cart
  // mutations are where a fall-forward turns into a failed checkout rather than
  // a slightly different product payload.
  reportApiVersionDrift(shopifyResponse.headers, `shopify/route:${operation}`)

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
