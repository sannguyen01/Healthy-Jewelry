// Healthy Jewelry — the OAuth exchange, with the decidable parts kept pure
//
// Server-only.

import { randomBytes } from 'node:crypto'
import {
  customerAccountConfig,
  discoverEndpoints,
  CUSTOMER_ACCOUNT_SCOPES,
} from './config'
import type { CustomerSession } from './session'

/** Unguessable, URL-safe, and long enough that guessing is not a strategy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export const STATE_COOKIE = 'hj_customer_oauth_state'
/** One login attempt. Long enough to read Shopify's form, short enough to expire. */
export const STATE_MAX_AGE_SECONDS = 10 * 60

/**
 * Build the URL that sends a customer to Shopify to sign in.
 *
 * Pure apart from its arguments, so the parameter set is testable without a
 * network call — and the parameter set is the whole security surface. `state`
 * ties the callback to this browser's login attempt; `nonce` ties the returned
 * ID token to it.
 */
export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  state: string
  nonce: string
}): string {
  const url = new URL(params.authorizationEndpoint)
  url.searchParams.set('scope', CUSTOMER_ACCOUNT_SCOPES)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  return url.toString()
}

/**
 * Where Shopify sends the customer back.
 *
 * Derived from the request's own origin rather than `SITE_URL`, so a preview
 * deployment redirects to itself instead of bouncing the developer to
 * production. Both must be registered as callback URLs in the Headless channel;
 * Shopify rejects any redirect_uri that is not on that list, which is what stops
 * this from being an open redirect.
 */
export function callbackUrl(origin: string): string {
  return new URL('/api/auth/callback', origin).toString()
}

/** Shopify's token response, as far as this code uses it. */
interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

function toSession(token: TokenResponse, now = Date.now()): CustomerSession {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    // Absolute, computed once. Storing `expires_in` and re-deriving later would
    // reset the clock on every read and produce a token that never expires.
    expiresAt: now + token.expires_in * 1000,
  }
}

/**
 * Confidential-client token request.
 *
 * The secret goes in the body over TLS to Shopify's token endpoint, which is the
 * confidential-client flow. There is no PKCE verifier because there is no public
 * client: every step of this runs server-side.
 */
async function requestToken(body: URLSearchParams): Promise<CustomerSession> {
  const { token } = await discoverEndpoints()

  body.set('client_id', customerAccountConfig.clientId)
  body.set('client_secret', customerAccountConfig.clientSecret)

  const response = await fetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!response.ok) {
    // Deliberately not echoing Shopify's body. It can contain the code or the
    // client_id, and this message reaches a log.
    throw new Error(`Customer Account token endpoint returned ${response.status}`)
  }

  const json = (await response.json()) as Partial<TokenResponse>
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error('Customer Account token response was missing required fields')
  }

  return toSession(json as TokenResponse)
}

/** Exchange the one-time code from the callback for a session. */
export function exchangeCodeForSession(code: string, redirectUri: string): Promise<CustomerSession> {
  return requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  )
}

/**
 * Trade a refresh token for a fresh access token.
 *
 * Shopify may or may not rotate the refresh token; `requestToken` takes whatever
 * comes back, so a rotated one is adopted and a reused one is preserved without
 * this code needing to know which happened.
 */
export function refreshSession(refreshToken: string): Promise<CustomerSession> {
  return requestToken(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  )
}

/**
 * Where to send a customer to end their Shopify session too.
 *
 * Clearing the local cookie alone would leave them signed in at Shopify, so the
 * next "Sign in" click would return them instantly with no prompt — which looks
 * exactly like logout being broken, and on a shared computer is worse than that.
 */
export async function buildLogoutUrl(idTokenHint: string | null, postLogoutUri: string): Promise<string> {
  const { logout } = await discoverEndpoints()
  const url = new URL(logout)
  if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint)
  url.searchParams.set('post_logout_redirect_uri', postLogoutUri)
  return url.toString()
}
