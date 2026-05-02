import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let query: unknown
  let variables: unknown

  // Parse and validate request body
  try {
    const body = (await request.json()) as Record<string, unknown>
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

  // Read env vars server-side — never exposed in response
  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
  const accessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN

  if (!storeDomain || !accessToken) {
    console.error('[shopify/route] Missing Shopify environment variables')
    return NextResponse.json(
      { error: 'Shopify integration is not configured' },
      { status: 503 }
    )
  }

  const endpoint = `https://${storeDomain}/api/2024-01/graphql.json`

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
    return NextResponse.json(
      { error: 'Failed to reach Shopify API' },
      { status: 502 }
    )
  }

  if (!shopifyResponse.ok) {
    console.error(
      '[shopify/route] Shopify returned non-OK status:',
      shopifyResponse.status
    )
    return NextResponse.json(
      { error: 'Shopify API returned an error' },
      { status: shopifyResponse.status }
    )
  }

  let data: unknown
  try {
    data = await shopifyResponse.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid response from Shopify API' },
      { status: 502 }
    )
  }

  return NextResponse.json(data)
}
