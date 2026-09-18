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
 * How long a discovery round-trip may take before it is abandoned.
 *
 * ## What "no timeout" actually costs here
 *
 * These two `fetch` calls sit directly in the path of `/api/auth/login` and
 * `/api/auth/logout`, and they had neither a timeout nor a status check. A
 * Shopify well-known endpoint that accepts the connection and then stops
 * answering therefore hung the route until the *platform's* limit — on Vercel,
 * tens of seconds — with no log line and no error, for every customer trying to
 * sign in during the window. `fetch` has no default timeout; the absence of one
 * here was not a choice to rely on a default, because there is no default.
 *
 * Five seconds is well past a healthy response from a CDN-served static document
 * and well short of a page a customer will wait through. Exceeding it redirects
 * to `/account?status=unavailable`, which both routes already do for a discovery
 * failure — the difference is that it now happens in five seconds rather than at
 * the platform's discretion.
 */
const DISCOVERY_TIMEOUT_MS = 5_000

/**
 * One well-known document, fetched with a deadline and checked before parsing.
 *
 * `.then((r) => r.json())` was the whole of the old implementation, and it made
 * two mistakes that produce the same unhelpful outcome. A non-2xx — a 404 from a
 * store with the Headless channel uninstalled is the likely one — returns an
 * HTML error page, so `r.json()` throws `Unexpected token '<'`, an error naming
 * neither the URL nor the status. And an unconsumed body on the sibling request
 * when one of the two rejects leaks a socket in Node.
 */
async function fetchWellKnown(url: string): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    // `AbortSignal.timeout` rejects with a TimeoutError; anything else is a
    // genuine network failure. Both are reported by name, because "discovery
    // failed" without one is the log line that sends somebody to check their
    // credentials for an hour.
    const name = err instanceof Error ? err.name : 'Error'
    throw new Error(
      `Customer Account discovery could not reach ${url} (${name}` +
        `${name === 'TimeoutError' ? ` after ${DISCOVERY_TIMEOUT_MS}ms` : ''}).`
    )
  }

  if (!response.ok) {
    // Drain the body so the connection can be reused rather than left open.
    await response.text().catch(() => {})
    throw new Error(`Customer Account discovery: ${url} returned ${response.status}.`)
  }

  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    throw new Error(`Customer Account discovery: ${url} did not return JSON.`)
  }
}

/**
 * Fetch and cache the endpoints for the process's lifetime.
 *
 * Cached because they change on the order of never, and a discovery round-trip
 * on every login would put a third-party latency spike between a customer and
 * their account page. **Only a successful result is cached** — a failure is not
 * memoised, so a transient outage does not disable accounts until the next
 * deploy.
 */
export async function discoverEndpoints(): Promise<CustomerAccountEndpoints> {
  if (cached) return cached

  const domain = customerAccountConfig.storeDomain
  if (!domain) throw new Error('Cannot discover Customer Account endpoints: no store domain.')

  // `allSettled` rather than `all`: `all` rejects on the first failure and leaves
  // the other response's body unread, which in Node holds the socket open. Both
  // outcomes are collected, then the first failure is rethrown.
  const [openidResult, apiResult] = await Promise.allSettled([
    fetchWellKnown(`https://${domain}/.well-known/openid-configuration`),
    fetchWellKnown(`https://${domain}/.well-known/customer-account-api`),
  ])
  if (openidResult.status === 'rejected') throw openidResult.reason
  if (apiResult.status === 'rejected') throw apiResult.reason
  const openid = openidResult.value
  const api = apiResult.value

  const endpoints: CustomerAccountEndpoints = {
    authorization: String(openid.authorization_endpoint ?? ''),
    token: String(openid.token_endpoint ?? ''),
    logout: String(openid.end_session_endpoint ?? ''),
    graphql: String(api.graphql_api ?? api.graphql ?? ''),
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
