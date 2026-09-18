// Healthy Jewelry — the OAuth exchange, with the decidable parts kept pure
//
// Server-only.

import { randomBytes } from 'node:crypto'
import {
  customerAccountConfig,
  discoverEndpoints,
  CUSTOMER_ACCOUNT_SCOPES,
} from './config'
import { safeEquals, type CustomerSession } from './session'

/** Unguessable, URL-safe, and long enough that guessing is not a strategy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export const STATE_COOKIE = 'hj_customer_oauth_state'

/**
 * Where the login attempt's `nonce` is kept until the callback can check it.
 *
 * ## Why this cookie did not exist
 *
 * `/api/auth/login` generated a nonce, put it in the authorization URL, and
 * discarded it. Nothing stored it, the callback never read an ID token, and no
 * comparison was ever made — while `buildAuthorizationUrl`'s own doc comment
 * said, in as many words, that the nonce "ties the returned ID token to it".
 *
 * It tied nothing to anything. That is the shape
 * [ADR 018](../../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)
 * names: a claim about a control, written where a control should be, with the
 * security property asserted in prose and absent from the code. Two paths were
 * open — delete the parameter and the sentence, or make the sentence true. The
 * second one also pays for itself at logout, below.
 */
export const NONCE_COOKIE = 'hj_customer_oauth_nonce'

/** One login attempt. Long enough to read Shopify's form, short enough to expire. */
export const STATE_MAX_AGE_SECONDS = 10 * 60

/**
 * Build the URL that sends a customer to Shopify to sign in.
 *
 * Pure apart from its arguments, so the parameter set is testable without a
 * network call — and the parameter set is the whole security surface. `state`
 * ties the callback to this browser's login attempt; `nonce` ties the returned
 * ID token to it, which is now true: the callback stores it, `verifyIdToken`
 * compares it, and a mismatch fails the login.
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
  /**
   * Present on an `authorization_code` exchange because `openid` is in the
   * requested scopes. Absent on a `refresh_token` grant, which is why it is
   * optional here and why `requestToken` does not demand it.
   */
  id_token?: string
}

function toSession(token: TokenResponse, now = Date.now()): CustomerSession {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    // Absolute, computed once. Storing `expires_in` and re-deriving later would
    // reset the clock on every read and produce a token that never expires.
    expiresAt: now + token.expires_in * 1000,
    idToken: token.id_token,
  }
}

/** What an ID token check concluded, and — when it failed — why. */
export type IdTokenVerdict =
  | { ok: true; claims: Record<string, unknown> }
  | {
      ok: false
      reason: 'malformed' | 'nonce-mismatch' | 'audience-mismatch' | 'expired'
    }

/**
 * Check the ID token returned by the token endpoint.
 *
 * ## Why the signature is not verified, deliberately
 *
 * This token does not arrive through the browser. It comes back on the direct,
 * server-to-server TLS response to a token request authenticated with the client
 * secret — the confidential-client code flow `config.ts` explains this project
 * chose. OpenID Connect Core §3.1.3.7 addresses exactly that case: when the ID
 * token is received via direct communication between the client and the token
 * endpoint, TLS server validation *may* be used in place of checking the token
 * signature, and in place of validating the issuer.
 *
 * So the checks here are the ones TLS does **not** already make: that this token
 * answers *this* login attempt (`nonce`), that it was minted for *this* client
 * (`aud`), and that it has not expired. Fetching Shopify's JWKS and verifying
 * RS256 would add a network dependency and a second cryptographic surface to
 * re-derive a guarantee the transport already provides — and a JWT verifier
 * written to look thorough is a worse outcome than one that states its boundary.
 *
 * Pure, and takes its clock as an argument, so every branch is reachable from a
 * test without mocking time.
 */
export function verifyIdToken(params: {
  idToken: string
  expectedNonce: string
  clientId: string
  now?: number
}): IdTokenVerdict {
  const segments = params.idToken.split('.')
  if (segments.length !== 3) return { ok: false, reason: 'malformed' }

  let claims: Record<string, unknown>
  try {
    const decoded: unknown = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf-8'))
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      return { ok: false, reason: 'malformed' }
    }
    claims = decoded as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const { nonce, aud, exp } = claims

  // Constant-time, for the same reason `state` is: a `===` on a secret leaks its
  // prefix through timing, and the cost of not doing it properly is an argument
  // about whether the leak is exploitable.
  if (typeof nonce !== 'string' || !safeEquals(nonce, params.expectedNonce)) {
    return { ok: false, reason: 'nonce-mismatch' }
  }

  // `aud` is a string or an array of strings in the spec, and a token minted for
  // a different client is exactly what this check is for.
  const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : []
  if (!audiences.some((a) => a === params.clientId)) {
    return { ok: false, reason: 'audience-mismatch' }
  }

  // Seconds, per the spec — not milliseconds. Treating a missing or non-numeric
  // `exp` as expired rather than as absent: an unbounded token is the one thing
  // this check exists to refuse.
  const nowSeconds = Math.floor((params.now ?? Date.now()) / 1000)
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= nowSeconds) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, claims }
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

/**
 * Exchange the one-time code from the callback for a session.
 *
 * `expectedNonce` is the value this browser's login attempt sent to Shopify, read
 * back out of `NONCE_COOKIE`. A token whose `nonce` claim does not match it is
 * refused here rather than in the route, so the check cannot be forgotten by a
 * second caller.
 *
 * A response with **no** `id_token` at all is refused too. `openid` is in the
 * requested scopes, so its absence means the response is not the one this flow
 * asked for — and accepting it would restore exactly the state this change
 * removes, where a nonce is sent and nothing ever compares it.
 */
export async function exchangeCodeForSession(
  code: string,
  redirectUri: string,
  expectedNonce: string
): Promise<CustomerSession> {
  const session = await requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  )

  if (!session.idToken) {
    throw new Error('Customer Account token response carried no id_token')
  }

  const verdict = verifyIdToken({
    idToken: session.idToken,
    expectedNonce,
    clientId: customerAccountConfig.clientId,
  })
  if (!verdict.ok) {
    // The reason is named for the log and never for the customer: the callback
    // route redirects every failure to the same page on purpose.
    throw new Error(`Customer Account id_token rejected: ${verdict.reason}`)
  }

  return session
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
export async function buildLogoutUrl(
  idTokenHint: string | null | undefined,
  postLogoutUri: string
): Promise<string> {
  const { logout } = await discoverEndpoints()
  const url = new URL(logout)
  if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint)
  url.searchParams.set('post_logout_redirect_uri', postLogoutUri)
  return url.toString()
}
