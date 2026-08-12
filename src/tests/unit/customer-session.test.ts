import { describe, it, expect } from 'vitest'
import {
  sealSession,
  openSession,
  needsRefresh,
  safeEquals,
  sessionCookieOptions,
  REFRESH_MARGIN_MS,
  SESSION_MAX_AGE_SECONDS,
  type CustomerSession,
} from '@/lib/shopify/customer/session'
import { buildAuthorizationUrl, callbackUrl, randomToken } from '@/lib/shopify/customer/oauth'

/**
 * **The cookie is attacker-controlled by definition.**
 *
 * It holds a bearer credential for one customer's orders and addresses, it round-trips
 * through a browser, and anything that can reach it can edit it. So the tests here are
 * mostly about the *rejection* paths — tampering, truncation, a rotated secret, a payload
 * that decrypts to something that is not a session — because those are the branches that
 * never run in normal use and are therefore the ones most likely to be wrong.
 */

const SECRET = 'a-test-session-secret-of-reasonable-length'
const session: CustomerSession = {
  accessToken: 'shcat_access_token',
  refreshToken: 'shcrt_refresh_token',
  expiresAt: 1_800_000_000_000,
}

describe('sealSession / openSession', () => {
  it('round-trips a session unchanged', () => {
    expect(openSession(sealSession(session, SECRET), SECRET)).toEqual(session)
  })

  /**
   * Signing alone would prove the cookie was not tampered with while leaving the
   * access token readable by anything that can see the string. Authenticated
   * encryption gives both properties.
   */
  it('does not leave the tokens readable in the cookie', () => {
    const sealed = sealSession(session, SECRET)
    expect(sealed).not.toContain('shcat_access_token')
    expect(sealed).not.toContain('shcrt_refresh_token')
  })

  it('produces a different cookie each time, so two sessions are not comparable', () => {
    // A deterministic ciphertext would let an observer tell that two requests
    // carry the same session without decrypting anything.
    expect(sealSession(session, SECRET)).not.toBe(sealSession(session, SECRET))
  })

  it('rejects a cookie sealed with a different secret', () => {
    expect(openSession(sealSession(session, 'other-secret'), SECRET)).toBeNull()
  })

  /** Rotating the secret must sign everyone out, not fail open. */
  it('rejects every session after a secret rotation', () => {
    const sealed = sealSession(session, SECRET)
    expect(openSession(sealed, `${SECRET}-rotated`)).toBeNull()
  })

  it('rejects a tampered payload rather than returning partial data', () => {
    const [iv, tag, payload] = sealSession(session, SECRET).split('.')
    const flipped = Buffer.from(payload, 'base64url')
    flipped[0] ^= 0xff
    expect(openSession(`${iv}.${tag}.${flipped.toString('base64url')}`, SECRET)).toBeNull()
  })

  it('rejects a forged auth tag', () => {
    const [iv, , payload] = sealSession(session, SECRET).split('.')
    const forged = Buffer.alloc(16, 1).toString('base64url')
    expect(openSession(`${iv}.${forged}.${payload}`, SECRET)).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['undefined', undefined],
    ['not delimited', 'garbage'],
    ['two fields', 'aaaa.bbbb'],
    ['four fields', 'aaaa.bbbb.cccc.dddd'],
    ['wrong iv length', `${Buffer.alloc(8).toString('base64url')}.${Buffer.alloc(16).toString('base64url')}.zz`],
  ])('returns null for a %s cookie instead of throwing', (_label, value) => {
    expect(() => openSession(value, SECRET)).not.toThrow()
    expect(openSession(value, SECRET)).toBeNull()
  })

  it('returns null when no secret is configured, rather than accepting anything', () => {
    expect(openSession(sealSession(session, SECRET), '')).toBeNull()
  })

  /**
   * A cookie that decrypts cleanly but does not contain a session is the subtle
   * case: the crypto succeeded, so a naive implementation would hand a
   * half-built object to the caller and fail later, somewhere less obvious.
   */
  it.each([
    { accessToken: 'a', refreshToken: 'r' },
    { accessToken: 'a', expiresAt: 1 },
    { refreshToken: 'r', expiresAt: 1 },
    { accessToken: '', refreshToken: 'r', expiresAt: 1 },
    { accessToken: 'a', refreshToken: 'r', expiresAt: 'soon' },
    { accessToken: 'a', refreshToken: 'r', expiresAt: Number.NaN },
  ])('rejects a well-encrypted payload that is not a session (%o)', (payload) => {
    // Sealed through the real function, so this is a genuinely valid ciphertext.
    const sealed = sealSession(payload as unknown as CustomerSession, SECRET)
    expect(openSession(sealed, SECRET)).toBeNull()
  })
})

describe('needsRefresh', () => {
  const at = (expiresAt: number): CustomerSession => ({ ...session, expiresAt })

  it('is false while the token has comfortable life left', () => {
    expect(needsRefresh(at(Date.now() + 60 * 60 * 1000))).toBe(false)
  })

  it('is true once expired', () => {
    expect(needsRefresh(at(Date.now() - 1))).toBe(true)
  })

  /**
   * The margin exists because a token expiring between the check and the request
   * fails as a 401 the customer sees — a race that only happens under real
   * latency and therefore never in development.
   */
  it('refreshes early, inside the margin', () => {
    expect(needsRefresh(at(Date.now() + REFRESH_MARGIN_MS / 2))).toBe(true)
  })

  it('takes the clock as an argument, so the boundary is testable', () => {
    const now = 1_000_000
    expect(needsRefresh(at(now + REFRESH_MARGIN_MS + 1), now)).toBe(false)
    expect(needsRefresh(at(now + REFRESH_MARGIN_MS), now)).toBe(true)
  })
})

describe('safeEquals', () => {
  it('matches identical values', () => {
    expect(safeEquals('abc123', 'abc123')).toBe(true)
  })

  it('rejects different values, including a prefix', () => {
    expect(safeEquals('abc123', 'abc124')).toBe(false)
    expect(safeEquals('abc', 'abc123')).toBe(false)
    expect(safeEquals('', 'abc')).toBe(false)
  })

  it('does not throw on a length mismatch', () => {
    // node's timingSafeEqual throws on unequal lengths; the wrapper must not.
    expect(() => safeEquals('a', 'bbbbbbbb')).not.toThrow()
  })
})

describe('sessionCookieOptions', () => {
  it('is httpOnly, so no script can read the token', () => {
    expect(sessionCookieOptions(SESSION_MAX_AGE_SECONDS).httpOnly).toBe(true)
  })

  /**
   * `lax`, not `strict`. The OAuth callback is a top-level navigation *from
   * Shopify's domain*, and `strict` would withhold the cookie on exactly that
   * request — breaking login in a way that reads like a token problem.
   */
  it('is SameSite=Lax so the OAuth callback still carries it', () => {
    expect(sessionCookieOptions(60).sameSite).toBe('lax')
  })

  it('is scoped to the whole site and carries the given lifetime', () => {
    expect(sessionCookieOptions(600)).toMatchObject({ path: '/', maxAge: 600 })
  })
})

describe('buildAuthorizationUrl', () => {
  const url = () =>
    new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://shopify.com/authentication/1/oauth/authorize',
        clientId: 'client-abc',
        redirectUri: 'https://healthyjewellery.com/api/auth/callback',
        state: 'state-value',
        nonce: 'nonce-value',
      })
    )

  it('requests the scopes the account page needs', () => {
    expect(url().searchParams.get('scope')).toBe('openid email customer-account-api:full')
  })

  it('carries state and nonce — the whole security surface of this step', () => {
    expect(url().searchParams.get('state')).toBe('state-value')
    expect(url().searchParams.get('nonce')).toBe('nonce-value')
  })

  it('uses the authorization code flow', () => {
    expect(url().searchParams.get('response_type')).toBe('code')
  })

  it('keeps the discovered endpoint rather than reconstructing a URL', () => {
    expect(url().origin + url().pathname).toBe(
      'https://shopify.com/authentication/1/oauth/authorize'
    )
  })

  it('never leaks the client secret into a URL', () => {
    expect(url().toString()).not.toContain('client_secret')
  })
})

describe('callbackUrl', () => {
  /**
   * Derived from the request's own origin, so a preview deployment returns to
   * itself instead of bouncing a developer to production mid-login.
   */
  it('is built from the origin it was called with', () => {
    expect(callbackUrl('https://preview-abc.vercel.app')).toBe(
      'https://preview-abc.vercel.app/api/auth/callback'
    )
    expect(callbackUrl('https://healthyjewellery.com')).toBe(
      'https://healthyjewellery.com/api/auth/callback'
    )
  })
})

describe('randomToken', () => {
  it('is unguessable and URL-safe', () => {
    const token = randomToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(40)
  })

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()))
    expect(tokens.size).toBe(200)
  })
})
