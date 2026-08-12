import { shopifyConfig } from '@/config/shopify'
import { reportApiVersionDrift } from './api-version'
import type { ShopifyResponse } from './types'

// ── Environment validation ─────────────────────────────────────────────────

function requireEnv(value: string, key: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` + `Add it to your .env.local file.`
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
  options?: { cache?: RequestCache; revalidate?: number; tags?: string[] }
): Promise<ShopifyResponse<T>> {
  const storeDomain = requireEnv(shopifyConfig.storeDomain, 'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
  const accessToken = requireEnv(
    shopifyConfig.storefrontAccessToken,
    'SHOPIFY_STOREFRONT_ACCESS_TOKEN'
  )
  const apiVersion = shopifyConfig.apiVersion

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

  if (options?.revalidate !== undefined || options?.tags) {
    fetchOptions.next = {
      ...(options?.revalidate !== undefined ? { revalidate: options.revalidate } : {}),
      ...(options?.tags ? { tags: options.tags } : {}),
    }
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

  // Before the status check, deliberately. A fall-forward can *cause* the error
  // being thrown below — a query valid in the pinned version and removed in the
  // one actually serving it fails as a plain GraphQL error — so the version
  // mismatch has to be in the log next to it, not skipped because the request
  // failed.
  reportApiVersionDrift(response.headers, 'shopifyFetch')

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
    throw new ShopifyFetchError('Shopify API returned non-JSON response', response.status)
  }

  const body = json as ShopifyResponse<T>

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join('; ')
    throw new ShopifyFetchError(`Shopify GraphQL errors: ${messages}`, response.status, body.errors)
  }

  return body
}

export default shopifyFetch
