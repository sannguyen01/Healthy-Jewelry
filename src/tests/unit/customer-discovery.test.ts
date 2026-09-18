import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Endpoint discovery and the token exchange: the network half of the auth flow.**
 *
 * `config.ts` sat at 23.4% line coverage — the lowest file in the project — and
 * what was uncovered was the part that runs on every sign-in:
 *
 * ```ts
 * const [openid, api] = await Promise.all([
 *   fetch(`https://${domain}/.well-known/openid-configuration`).then((r) => r.json()),
 *   fetch(`https://${domain}/.well-known/customer-account-api`).then((r) => r.json()),
 * ])
 * ```
 *
 * Three things wrong with those two lines, and all three produce the same
 * unhelpful outcome for whoever has to diagnose it:
 *
 *   · **No timeout.** `fetch` has no default one, so a well-known endpoint that
 *     accepts the connection and then goes quiet hangs `/api/auth/login` until
 *     the platform gives up — tens of seconds on Vercel, for every customer
 *     trying to sign in during the window.
 *   · **No status check.** A 404 (a store without the Headless channel installed
 *     is the likely cause) returns an HTML error page, so `r.json()` throws
 *     `Unexpected token '<'` — an error naming neither the URL nor the status.
 *   · **`Promise.all`**, which rejects on the first failure and leaves the other
 *     response's body unread, holding a socket open in Node.
 */

const DOMAIN = 'test-store.myshopify.com'
const CLIENT_ID = 'shp_client_id_for_tests'

const OPENID = {
  authorization_endpoint: 'https://shopify.com/authentication/1/oauth/authorize',
  token_endpoint: 'https://shopify.com/authentication/1/oauth/token',
  end_session_endpoint: 'https://shopify.com/authentication/1/logout',
}
const API = { graphql_api: 'https://shopify.com/account/customer/api/graphql' }

function jsonOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** Answers each well-known URL with its own document. */
function discoveryFetch(overrides: { openid?: unknown; api?: unknown } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('openid-configuration')) return jsonOk(overrides.openid ?? OPENID)
    if (url.includes('customer-account-api')) return jsonOk(overrides.api ?? API)
    throw new Error(`unexpected fetch: ${url}`)
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET', 'shp_client_secret')
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET', 'a-session-secret-of-some-length')
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', DOMAIN)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isCustomerAccountsConfigured', () => {
  it('is true only when every one of the four values is present', async () => {
    const vars = [
      'SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID',
      'SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET',
      'SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET',
      'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN',
    ]

    const { isCustomerAccountsConfigured } = await import('@/lib/shopify/customer/config')
    expect(isCustomerAccountsConfigured()).toBe(true)

    // One at a time, so a single missing value is enough — an accounts feature
    // that is half-configured is the state that produces a 500 mid-login rather
    // than an honest "not set up".
    for (const name of vars) {
      vi.stubEnv(name, '')
      expect(isCustomerAccountsConfigured(), `${name} empty still read as configured`).toBe(false)
      vi.stubEnv(name, 'restored')
    }
  })
})

describe('discoverEndpoints', () => {
  it('maps both well-known documents onto the endpoint set', async () => {
    vi.stubGlobal('fetch', discoveryFetch())
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).resolves.toEqual({
      authorization: OPENID.authorization_endpoint,
      token: OPENID.token_endpoint,
      logout: OPENID.end_session_endpoint,
      graphql: API.graphql_api,
    })
  })

  it('accepts either spelling of the GraphQL field', async () => {
    vi.stubGlobal('fetch', discoveryFetch({ api: { graphql: 'https://shopify.com/alt/graphql' } }))
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).resolves.toMatchObject({
      graphql: 'https://shopify.com/alt/graphql',
    })
  })

  it('passes an abort signal to every well-known request', async () => {
    // The timeout is invisible from the outside until it fires, so the assertion
    // is on the wiring: a request issued without a signal has no deadline at all,
    // because `fetch` supplies no default.
    const mockFetch = discoveryFetch()
    vi.stubGlobal('fetch', mockFetch)
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()
    await discoverEndpoints()

    expect(mockFetch.mock.calls).toHaveLength(2)
    for (const [, init] of mockFetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(init?.signal, 'a well-known request went out with no deadline').toBeInstanceOf(
        AbortSignal
      )
      expect(init?.cache).toBe('no-store')
    }
  })

  it('names the timeout, the URL and the elapsed budget when one fires', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).rejects.toThrow(/TimeoutError after 5000ms/)
    await expect(discoverEndpoints()).rejects.toThrow(/well-known/)
  })

  it('names the status rather than failing inside JSON.parse on a 404', async () => {
    // A store with the Headless channel uninstalled answers 404 with HTML. The
    // old code went straight to `r.json()`, so the error read
    // `Unexpected token '<'` and named neither the URL nor the status.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'")
        },
        text: async () => '<!doctype html><title>Not found</title>',
      }))
    )
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).rejects.toThrow(/returned 404/)
  })

  it('reports a 200 that is not JSON as exactly that', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('not json')
        },
        text: async () => 'hello',
      }))
    )
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).rejects.toThrow(/did not return JSON/)
  })

  it('names every endpoint a well-formed response failed to supply', async () => {
    vi.stubGlobal(
      'fetch',
      discoveryFetch({ openid: { authorization_endpoint: OPENID.authorization_endpoint }, api: {} })
    )
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    // Missing, and named — not interpolated into a URL as `undefined`, which is
    // what produced a 404 from Shopify that read like a bug on this side.
    await expect(discoverEndpoints()).rejects.toThrow(/token, logout, graphql/)
  })

  it('reads the well-known documents once and caches the result', async () => {
    const mockFetch = discoveryFetch()
    vi.stubGlobal('fetch', mockFetch)
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await discoverEndpoints()
    await discoverEndpoints()
    await discoverEndpoints()

    expect(mockFetch.mock.calls).toHaveLength(2)
  })

  it('does not cache a failure, so an outage does not disable accounts until redeploy', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    vi.stubGlobal('fetch', failing)
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).rejects.toThrow()

    vi.stubGlobal('fetch', discoveryFetch())
    await expect(discoverEndpoints()).resolves.toMatchObject({ token: OPENID.token_endpoint })
  })

  it('refuses to guess a URL when no store domain is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    const { discoverEndpoints, resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(discoverEndpoints()).rejects.toThrow(/no store domain/)
  })
})

describe('exchangeCodeForSession', () => {
  /** Discovery, then a token endpoint answering with `body`. */
  function tokenFetch(body: unknown, ok = true, status = 200) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('openid-configuration')) return jsonOk(OPENID)
      if (url.includes('customer-account-api')) return jsonOk(API)
      return { ok, status, json: async () => body, text: async () => '' } as unknown as Response
    })
  }

  function idToken(claims: Record<string, unknown>) {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf-8').toString('base64url')
    return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`
  }

  const exp = Math.floor(Date.now() / 1000) + 3600

  it('returns a session with an absolute expiry and the id token', async () => {
    vi.stubGlobal(
      'fetch',
      tokenFetch({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 7200,
        id_token: idToken({ nonce: 'n-1', aud: CLIENT_ID, exp }),
      })
    )
    const { exchangeCodeForSession } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    const before = Date.now()
    const session = await exchangeCodeForSession('code', 'https://hj.example/api/auth/callback', 'n-1')

    expect(session.accessToken).toBe('at')
    expect(session.refreshToken).toBe('rt')
    expect(session.idToken).toBeTruthy()
    // Absolute, computed once. Storing `expires_in` and re-deriving on read is
    // how a token ends up never expiring.
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 7200 * 1000)
  })

  it('refuses a token whose nonce does not match this login attempt', async () => {
    vi.stubGlobal(
      'fetch',
      tokenFetch({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 7200,
        id_token: idToken({ nonce: 'a-different-attempt', aud: CLIENT_ID, exp }),
      })
    )
    const { exchangeCodeForSession } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(
      exchangeCodeForSession('code', 'https://hj.example/api/auth/callback', 'n-1')
    ).rejects.toThrow(/nonce-mismatch/)
  })

  it('refuses a response carrying no id_token at all', async () => {
    // `openid` is in the requested scopes, so its absence means this is not the
    // response the flow asked for. Accepting it would restore exactly the state
    // this change removes: a nonce sent and never compared.
    vi.stubGlobal('fetch', tokenFetch({ access_token: 'at', refresh_token: 'rt', expires_in: 7200 }))
    const { exchangeCodeForSession } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(
      exchangeCodeForSession('code', 'https://hj.example/api/auth/callback', 'n-1')
    ).rejects.toThrow(/no id_token/)
  })

  it('never echoes Shopify’s error body into the message', async () => {
    // That body can contain the authorization code or the client id, and this
    // message reaches a log.
    vi.stubGlobal('fetch', tokenFetch({ error_description: 'code SECRET-abc123 is invalid' }, false, 400))
    const { exchangeCodeForSession } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    await expect(
      exchangeCodeForSession('code', 'https://hj.example/api/auth/callback', 'n-1')
    ).rejects.toThrow(/returned 400/)
    await expect(
      exchangeCodeForSession('code', 'https://hj.example/api/auth/callback', 'n-1')
    ).rejects.not.toThrow(/SECRET-abc123/)
  })

  it('refuses a 200 that is missing any required field', async () => {
    for (const body of [
      { refresh_token: 'rt', expires_in: 1 },
      { access_token: 'at', expires_in: 1 },
      { access_token: 'at', refresh_token: 'rt' },
      { access_token: 'at', refresh_token: 'rt', expires_in: '7200' },
    ]) {
      vi.stubGlobal('fetch', tokenFetch(body))
      const { exchangeCodeForSession } = await import('@/lib/shopify/customer/oauth')
      const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
      resetEndpointCache()

      await expect(
        exchangeCodeForSession('c', 'https://hj.example/api/auth/callback', 'n-1'),
        `accepted ${JSON.stringify(body)}`
      ).rejects.toThrow(/missing required fields/)
    }
  })
})

describe('refreshSession', () => {
  it('does not require an id_token, because a refresh grant returns none', async () => {
    // The asymmetry with the code exchange is deliberate and is the reason
    // `idToken` is optional on the session rather than required.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('openid-configuration')) return jsonOk(OPENID)
        if (url.includes('customer-account-api')) return jsonOk(API)
        return jsonOk({ access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 })
      })
    )
    const { refreshSession } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    const session = await refreshSession('rt')
    expect(session.accessToken).toBe('at2')
    expect(session.idToken).toBeUndefined()
  })
})

describe('buildLogoutUrl', () => {
  it('sends the id_token_hint when there is one', async () => {
    vi.stubGlobal('fetch', discoveryFetch())
    const { buildLogoutUrl } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    const url = new URL(await buildLogoutUrl('the-id-token', 'https://hj.example/'))
    expect(url.searchParams.get('id_token_hint')).toBe('the-id-token')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://hj.example/')
  })

  it('omits the hint entirely rather than sending an empty one', async () => {
    // A session sealed before `idToken` existed has none, and `undefined` must
    // not become the string "undefined" in a query parameter.
    vi.stubGlobal('fetch', discoveryFetch())
    const { buildLogoutUrl } = await import('@/lib/shopify/customer/oauth')
    const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
    resetEndpointCache()

    for (const hint of [null, undefined, '']) {
      const url = new URL(await buildLogoutUrl(hint, 'https://hj.example/'))
      expect(url.searchParams.has('id_token_hint')).toBe(false)
    }
  })
})
