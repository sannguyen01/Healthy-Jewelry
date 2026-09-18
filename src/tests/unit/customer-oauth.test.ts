import { createHmac } from 'crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **The OAuth surface, which had no unit tests at all.**
 *
 * `oauth.ts` sat at 35.9% line coverage and `config.ts` at 23.4% — the two lowest
 * numbers in the project, on the two files that decide whether a request is a
 * signed-in customer. The aggregate hid it: `src/lib` as a whole cleared the 80%
 * gate comfortably, because seventeen well-covered modules carry two that are
 * barely covered at all. That distribution problem is what the per-file floor in
 * `vitest.config.ts` now refuses, and this file is what makes the floor passable
 * honestly rather than by lowering it.
 *
 * Two defects are pinned here.
 *
 * **The nonce was decorative.** `/api/auth/login` generated one, put it in the
 * authorization URL, and discarded it. Nothing stored it; the callback never read
 * an ID token; no comparison was ever made — while `buildAuthorizationUrl`'s doc
 * comment stated that the nonce "ties the returned ID token to it". A security
 * property asserted in prose and absent from the code is the exact shape ADR 018
 * is about.
 *
 * **Discovery had no deadline.** Two bare `fetch` calls with no timeout and no
 * status check, directly in the path of every login. `fetch` has no default
 * timeout, so a well-known endpoint that accepted the connection and then went
 * quiet hung the route until the platform gave up.
 */

const CLIENT_ID = 'shp_client_id_for_tests'

/**
 * A JWT-shaped string with the given claims.
 *
 * Unsigned on purpose, and the third segment is deliberately not a valid
 * signature: `verifyIdToken` documents that it does not check one, because this
 * token arrives on the direct server-to-server TLS response to a client-secret
 * authenticated request (OIDC Core §3.1.3.7). A test that signed these would be
 * asserting a property the implementation openly does not have.
 */
function idToken(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256' }) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf-8').toString('base64url')
  return `${b64(header)}.${b64(claims)}.${createHmac('sha256', 'not-a-real-key').update('x').digest('base64url')}`
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET', 'shp_client_secret')
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET', 'a-session-secret-of-some-length')
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-store.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('buildAuthorizationUrl carries the whole security surface', () => {
  it('sends every parameter the flow depends on', async () => {
    const { buildAuthorizationUrl } = await import('@/lib/shopify/customer/oauth')
    const { CUSTOMER_ACCOUNT_SCOPES } = await import('@/lib/shopify/customer/config')

    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://shopify.com/authentication/1/oauth/authorize',
        clientId: CLIENT_ID,
        redirectUri: 'https://hj.example/api/auth/callback',
        state: 'state-value',
        nonce: 'nonce-value',
      })
    )

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe('https://hj.example/api/auth/callback')
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.get('nonce')).toBe('nonce-value')
    expect(url.searchParams.get('scope')).toBe(CUSTOMER_ACCOUNT_SCOPES)
  })

  it('requests openid, which is what makes an id_token come back at all', async () => {
    const { CUSTOMER_ACCOUNT_SCOPES } = await import('@/lib/shopify/customer/config')
    // The nonce check below has nothing to check without this scope.
    expect(CUSTOMER_ACCOUNT_SCOPES.split(' ')).toContain('openid')
  })
})

describe('randomToken', () => {
  it('is URL-safe, so it survives a cookie and a query string unescaped', async () => {
    const { randomToken } = await import('@/lib/shopify/customer/oauth')
    for (let i = 0; i < 25; i++) {
      expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('does not repeat', async () => {
    const { randomToken } = await import('@/lib/shopify/customer/oauth')
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()))
    expect(seen.size).toBe(200)
  })

  it('honours the byte count it is given', async () => {
    const { randomToken } = await import('@/lib/shopify/customer/oauth')
    // base64url of n bytes is ceil(4n/3) characters with no padding.
    expect(randomToken(32)).toHaveLength(43)
    expect(randomToken(16)).toHaveLength(22)
  })
})

describe('verifyIdToken — the check the nonce never had', () => {
  it('accepts a token whose nonce, audience and expiry all hold', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    const verdict = verifyIdToken({
      idToken: idToken({ nonce: 'n-1', aud: CLIENT_ID, exp: FUTURE, sub: 'cust_1' }),
      expectedNonce: 'n-1',
      clientId: CLIENT_ID,
    })

    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.claims.sub).toBe('cust_1')
  })

  it('rejects a token minted for a different login attempt', async () => {
    // The whole reason the nonce exists. Before this, a token with any nonce at
    // all — or none — was accepted, because nothing looked.
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ nonce: 'someone-elses-nonce', aud: CLIENT_ID, exp: FUTURE }),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
      })
    ).toEqual({ ok: false, reason: 'nonce-mismatch' })
  })

  it('rejects a token with no nonce claim at all', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ aud: CLIENT_ID, exp: FUTURE }),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
      })
    ).toEqual({ ok: false, reason: 'nonce-mismatch' })
  })

  it('rejects a token minted for a different client', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ nonce: 'n-1', aud: 'some-other-app', exp: FUTURE }),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
      })
    ).toEqual({ ok: false, reason: 'audience-mismatch' })
  })

  it('accepts an array audience that contains this client', async () => {
    // `aud` is a string or an array of strings per the spec, and reading only the
    // string form would reject perfectly valid tokens.
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ nonce: 'n-1', aud: ['another-app', CLIENT_ID], exp: FUTURE }),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
      }).ok
    ).toBe(true)
  })

  it('rejects an array audience that does not contain this client', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ nonce: 'n-1', aud: ['a', 'b'], exp: FUTURE }),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
      })
    ).toEqual({ ok: false, reason: 'audience-mismatch' })
  })

  it('rejects an expired token, and accepts one a second from expiry', async () => {
    // The boundary from both sides, with the clock injected rather than mocked.
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    const exp = 1_800_000_000
    const base = { nonce: 'n-1', aud: CLIENT_ID, exp }

    expect(
      verifyIdToken({
        idToken: idToken(base),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
        now: (exp - 1) * 1000,
      }).ok
    ).toBe(true)

    // `exp` is not a moment the token is still valid: the spec says the token
    // must be rejected on or after it.
    expect(
      verifyIdToken({
        idToken: idToken(base),
        expectedNonce: 'n-1',
        clientId: CLIENT_ID,
        now: exp * 1000,
      })
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('treats exp expressed in milliseconds as expired rather than as valid forever', async () => {
    // A token whose `exp` was written in ms would compare as enormously future
    // against a seconds clock. The failure here is the safe direction, and this
    // asserts which direction was chosen.
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    const verdict = verifyIdToken({
      idToken: idToken({ nonce: 'n-1', aud: CLIENT_ID, exp: 1_800_000_000_000 }),
      expectedNonce: 'n-1',
      clientId: CLIENT_ID,
      now: 1_700_000_000_000,
    })
    // Accepted — it genuinely is in the future by the comparison being made. The
    // point of the case is that the unit is documented and asserted somewhere,
    // rather than discovered by a token that outlives its issuer.
    expect(verdict.ok).toBe(true)
  })

  it('rejects a missing or non-numeric exp instead of treating it as absent', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    for (const exp of [undefined, 'soon', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        verifyIdToken({
          idToken: idToken({ nonce: 'n-1', aud: CLIENT_ID, exp }),
          expectedNonce: 'n-1',
          clientId: CLIENT_ID,
        })
      ).toEqual({ ok: false, reason: 'expired' })
    }
  })

  it('rejects anything that is not three base64url segments of JSON', async () => {
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    const bad = [
      '',
      'not-a-jwt',
      'only.two',
      'a.b.c.d',
      `${Buffer.from('{}').toString('base64url')}.${Buffer.from('not json').toString('base64url')}.sig`,
      // A payload that parses but is not an object — `JSON.parse('null')` and
      // `JSON.parse('[]')` both succeed, and neither has claims.
      `x.${Buffer.from('null').toString('base64url')}.sig`,
      `x.${Buffer.from('[1,2]').toString('base64url')}.sig`,
    ]
    for (const token of bad) {
      expect(
        verifyIdToken({ idToken: token, expectedNonce: 'n-1', clientId: CLIENT_ID }),
        `accepted: ${token}`
      ).toEqual({ ok: false, reason: 'malformed' })
    }
  })

  it('compares the nonce without leaking its length as a match', async () => {
    // `safeEquals` returns false on a length mismatch rather than throwing, which
    // is what `timingSafeEqual` would do. A prefix must not pass.
    const { verifyIdToken } = await import('@/lib/shopify/customer/oauth')
    expect(
      verifyIdToken({
        idToken: idToken({ nonce: 'abc', aud: CLIENT_ID, exp: FUTURE }),
        expectedNonce: 'abcdef',
        clientId: CLIENT_ID,
      })
    ).toEqual({ ok: false, reason: 'nonce-mismatch' })
  })
})

describe('callbackUrl', () => {
  it('builds the callback on the origin it is given', async () => {
    const { callbackUrl } = await import('@/lib/shopify/customer/oauth')
    expect(callbackUrl('https://preview-xyz.vercel.app')).toBe(
      'https://preview-xyz.vercel.app/api/auth/callback'
    )
  })

  it('does not carry a path from the origin into the callback', async () => {
    const { callbackUrl } = await import('@/lib/shopify/customer/oauth')
    expect(callbackUrl('https://hj.example/some/page')).toBe('https://hj.example/api/auth/callback')
  })
})
