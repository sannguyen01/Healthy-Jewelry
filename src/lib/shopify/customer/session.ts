// Healthy Jewelry — the signed-in customer's session
//
// Server-only. The tokens in here are bearer credentials for one customer's
// orders and addresses; nothing in this file may become reachable from the
// client import graph (`secret-exposure.test.ts` enforces that).

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * What a signed-in session holds.
 *
 * The refresh token is the part that matters. It is long-lived and can mint new
 * access tokens, so it never leaves the server — the cookie is `httpOnly`, and
 * even then it is encrypted, because a cookie is a string that travels through
 * logs, proxies and browser extensions.
 */
export interface CustomerSession {
  accessToken: string
  refreshToken: string
  /** Unix ms. Compared against a clock, never trusted as "probably still fine". */
  expiresAt: number
}

export const SESSION_COOKIE = 'hj_customer_session'

/**
 * Deliberately shorter than Shopify's refresh-token lifetime.
 *
 * The cookie expiring is a re-login; a stale one lingering is a credential with
 * no owner. Seven days is the usual shape for "remembered, but not forever" on a
 * store people visit occasionally.
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * Refresh this far before the access token actually expires.
 *
 * Without a margin, a token that expires between the check and the request fails
 * as a 401 the customer sees — a race that only happens under real latency and
 * therefore never in development.
 */
export const REFRESH_MARGIN_MS = 60_000

/** AES-256-GCM needs exactly 32 bytes; a passphrase of any length becomes one. */
function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

/**
 * Encrypt a session into a cookie value.
 *
 * AES-256-GCM rather than a signature alone: signing would prove the cookie was
 * not tampered with while leaving the customer's access token readable by
 * anything that can see the string. Authenticated encryption gives both, and the
 * GCM tag makes tampering a decrypt failure rather than a subtle one.
 *
 * Format: `iv.tag.ciphertext`, all base64url — three fields, so a truncated or
 * concatenated value fails structurally before any crypto runs.
 */
export function sealSession(session: CustomerSession, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), payload].map((b) => b.toString('base64url')).join('.')
}

/**
 * Decrypt a cookie back into a session, or `null`.
 *
 * **Always `null`, never a throw, and never a partial session.** This runs on
 * every authenticated request, and the inputs are attacker-controlled by
 * definition. A tampered cookie, a rotated secret, a truncated value, or a
 * payload that decrypts to something that is not a session all mean the same
 * thing to the caller: nobody is signed in.
 */
export function openSession(value: string | undefined, secret: string): CustomerSession | null {
  if (!value || !secret) return null

  const parts = value.split('.')
  if (parts.length !== 3) return null

  try {
    const [iv, tag, payload] = parts.map((p) => Buffer.from(p, 'base64url'))
    if (iv.length !== 12 || tag.length !== 16) return null

    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')

    const parsed: unknown = JSON.parse(plain)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { accessToken, refreshToken, expiresAt } = parsed as Record<string, unknown>
    if (typeof accessToken !== 'string' || accessToken.length === 0) return null
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null

    return { accessToken, refreshToken, expiresAt }
  } catch {
    // A bad auth tag throws here, which is the correct and expected path for a
    // tampered cookie. It is not an error worth logging on every request.
    return null
  }
}

/** Whether the access token needs refreshing before it is used. */
export function needsRefresh(session: CustomerSession, now = Date.now()): boolean {
  return session.expiresAt - REFRESH_MARGIN_MS <= now
}

/**
 * Constant-time comparison for the OAuth `state` parameter.
 *
 * `===` on a secret leaks its prefix through timing. The cost of doing this
 * properly is one function; the cost of not doing it is an argument about
 * whether the leak is exploitable.
 */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, which is itself a length oracle
  // — but length is not the secret here, the value is.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Cookie attributes shared by every set/clear, so they cannot drift apart. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // `lax`, not `strict`: the OAuth callback is a top-level navigation *from
    // Shopify's domain*, and `strict` would withhold the cookie on exactly that
    // request — breaking login in a way that looks like a token problem.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}
