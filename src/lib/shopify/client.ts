import type { ShopifyResponse } from './types'

// ── Environment validation ─────────────────────────────────────────────────

function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Add it to your .env.local file.`
    )
  }
  return value
}

// ── Shopify fetch errors ───────────────────────────────────────────────────

export class ShopifyFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errors?: unknown[]
  ) {
    super(message)
    this.name = 'ShopifyFetchError'
  }
}

// ── Core GraphQL fetch ────────────────────────────────────────────────────

export async function shopifyFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: { cache?: RequestCache; revalidate?: number }
): Promise<ShopifyResponse<T>> {
  const storeDomain = getEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
  const accessToken = getEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN')
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2025-01'

  const endpoint = `https://${storeDomain}/api/${apiVersion}/graphql.json`

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': accessToken,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: variables ?? {},
    }),
  }

  if (options?.revalidate !== undefined) {
    fetchOptions.next = { revalidate: options.revalidate }
  } else if (options?.cache) {
    fetchOptions.cache = options.cache
  }

  let response: Response

  try {
    response = await fetch(endpoint, fetchOptions)
  } catch (cause) {
    throw new ShopifyFetchError(
      `Network error fetching from Shopify: ${cause instanceof Error ? cause.message : String(cause)}`,
      undefined,
      undefined
    )
  }

  if (!response.ok) {
    throw new ShopifyFetchError(
      `Shopify API returned HTTP ${response.status}: ${response.statusText}`,
      response.status
    )
  }

  let json: unknown

  try {
    json = await response.json()
  } catch {
    throw new ShopifyFetchError(
      'Shopify API returned non-JSON response',
      response.status
    )
  }

  const body = json as ShopifyResponse<T>

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join('; ')
    throw new ShopifyFetchError(
      `Shopify GraphQL errors: ${messages}`,
      response.status,
      body.errors
    )
  }

  return body
}

export default shopifyFetch
