// Healthy Jewelry — Customer Account API configuration
//
// Server-only. Never import this from a client module: it reads the client
// secret and the session key. `secret-exposure.test.ts` walks the real client
// import graph and fails if it ever becomes reachable.

import { shopifyPublicConfig } from '@/config/shopify-public'

/**
 * A **confidential** OAuth client, not a public one.
 *
 * Shopify's own guidance splits on one question: does the application have a
 * back end with a server-side session to hold the refresh token? This one does —
 * every step of the flow runs in a Next.js route handler — so the confidential
 * profile applies, and the refresh token never reaches a browser.
 *
 * The public/PKCE profile exists for SPAs and mobile apps that cannot keep a
 * secret. Choosing it here would mean putting a long-lived refresh token in
 * `localStorage`, which is exactly what the cart store already refuses to do for
 * anything sensitive.
 */
export const customerAccountConfig = {
  get clientId(): string {
    return process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? ''
  },
  get clientSecret(): string {
    return process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET ?? ''
  },
  /** Keys the AES-GCM encryption of the session cookie. */
  get sessionSecret(): string {
    return process.env.SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET ?? ''
  },
  get storeDomain(): string {
    return shopifyPublicConfig.storeDomain
  },
} as const

/**
 * Whether accounts can work on this deployment at all.
 *
 * Same posture as `isShopifyConfigured()`: the feature is optional, its absence
 * is a configuration state rather than an error, and the site must build and
 * serve without it. `/account` says so plainly instead of throwing — a customer
 * seeing a stack trace because a merchant has not filled in a form is the worst
 * possible way to communicate "not set up yet".
 */
export function isCustomerAccountsConfigured(): boolean {
  const { clientId, clientSecret, sessionSecret, storeDomain } = customerAccountConfig
  return !!(clientId && clientSecret && sessionSecret && storeDomain)
}

/**
 * The OAuth and API endpoints, discovered rather than constructed.
 *
 * Shopify publishes these at well-known URLs and explicitly recommends discovery
 * over hardcoding, because the URLs are infrastructure that can move. This
 * project has already been burned by a hardcoded thing that Shopify changed
 * underneath it — a pinned API version that silently stopped existing (ADR 009) —
 * so where an endpoint can be asked for, it is asked for.
 */
export interface CustomerAccountEndpoints {
  authorization: string
  token: string
  logout: string
  graphql: string
}

let cached: CustomerAccountEndpoints | null = null

/** Test seam. Nothing in the app calls this. */
export function resetEndpointCache(): void {
  cached = null
}

/**
 * Fetch and cache the endpoints for the process's lifetime.
 *
 * Cached because they change on the order of never, and a discovery round-trip
 * on every login would put a third-party latency spike between a customer and
 * their account page.
 */
export async function discoverEndpoints(): Promise<CustomerAccountEndpoints> {
  if (cached) return cached

  const domain = customerAccountConfig.storeDomain
  if (!domain) throw new Error('Cannot discover Customer Account endpoints: no store domain.')

  const [openid, api] = await Promise.all([
    fetch(`https://${domain}/.well-known/openid-configuration`).then((r) => r.json()),
    fetch(`https://${domain}/.well-known/customer-account-api`).then((r) => r.json()),
  ])

  const endpoints: CustomerAccountEndpoints = {
    authorization: openid.authorization_endpoint,
    token: openid.token_endpoint,
    logout: openid.end_session_endpoint,
    graphql: api.graphql_api ?? api.graphql,
  }

  // A discovery response missing a field would otherwise surface as `undefined`
  // interpolated into a URL — a 404 from Shopify that reads like a bug here.
  const missing = Object.entries(endpoints)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`Customer Account discovery returned no ${missing.join(', ')} endpoint.`)
  }

  cached = endpoints
  return endpoints
}

/** Scopes this storefront needs: identity, email, and the customer's own data. */
export const CUSTOMER_ACCOUNT_SCOPES = 'openid email customer-account-api:full'
