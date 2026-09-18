import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CustomerSession } from '@/lib/shopify/customer/session'

/**
 * **`customer/client.ts` — 0% line coverage, and it holds the session.**
 *
 * This file decides who is signed in, when a token is refreshed, and what happens
 * when Shopify refuses one. Nothing tested any of it. The aggregate gate never
 * noticed, because `src/lib` as a whole cleared 80% on the strength of the
 * modules that *are* well covered — which is the distribution problem the
 * per-file floor in `vitest.config.ts` now refuses.
 *
 * `next/headers` is mocked because `cookies()` has no meaning outside a request
 * scope; everything else runs for real.
 */

const SECRET = 'a-session-secret-of-some-length'

const cookieStore = {
  get: vi.fn<(name: string) => { value: string } | undefined>(),
  set: vi.fn(),
}
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

const OPENID = {
  authorization_endpoint: 'https://shopify.com/authentication/1/oauth/authorize',
  token_endpoint: 'https://shopify.com/authentication/1/oauth/token',
  end_session_endpoint: 'https://shopify.com/authentication/1/logout',
}
const API = { graphql_api: 'https://shopify.com/account/customer/api/graphql' }

function jsonOk(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => '' } as unknown as Response
}

/** Discovery answered normally; everything else routed to `handler`. */
function routedFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('openid-configuration')) return jsonOk(OPENID)
    if (url.includes('customer-account-api')) return jsonOk(API)
    return handler(url, init)
  })
}

async function loadClient() {
  const mod = await import('@/lib/shopify/customer/client')
  const { resetEndpointCache } = await import('@/lib/shopify/customer/config')
  resetEndpointCache()
  return mod
}

/** A sealed cookie for a session that is nowhere near expiry. */
async function sealedFresh(overrides: Partial<CustomerSession> = {}): Promise<string> {
  const { sealSession } = await import('@/lib/shopify/customer/session')
  return sealSession(
    { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, ...overrides },
    SECRET
  )
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  cookieStore.get.mockReset()
  cookieStore.set.mockReset()
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID', 'shp_client_id')
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET', 'shp_client_secret')
  vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'test-store.myshopify.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getCustomerSession — every "not signed in" case is the same answer', () => {
  it('returns null when accounts are not configured at all', async () => {
    vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID', '')
    const { getCustomerSession } = await loadClient()

    expect(await getCustomerSession()).toBeNull()
    // And it does not even look at the cookie, so an unconfigured preview never
    // touches a session secret it does not have.
    expect(cookieStore.get).not.toHaveBeenCalled()
  })

  it('returns null when there is no cookie', async () => {
    cookieStore.get.mockReturnValue(undefined)
    const { getCustomerSession } = await loadClient()
    expect(await getCustomerSession()).toBeNull()
  })

  it('returns null for a tampered cookie rather than throwing', async () => {
    const sealed = await sealedFresh()
    // Flip one character of the ciphertext. The GCM tag makes this a decrypt
    // failure, which must read as "nobody is signed in" and not as a 500.
    const broken = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A')
    cookieStore.get.mockReturnValue({ value: broken })

    const { getCustomerSession } = await loadClient()
    expect(await getCustomerSession()).toBeNull()
  })

  it('returns a fresh session untouched, without a refresh round-trip', async () => {
    cookieStore.get.mockReturnValue({ value: await sealedFresh() })
    const mockFetch = routedFetch(() => jsonOk({}))
    vi.stubGlobal('fetch', mockFetch)

    const { getCustomerSession } = await loadClient()
    const session = await getCustomerSession()

    expect(session?.accessToken).toBe('at')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })
})

describe('getCustomerSession — refreshing', () => {
  it('refreshes a session inside the expiry margin and rewrites the cookie', async () => {
    // `REFRESH_MARGIN_MS` is 60s, so a token expiring in 30s must be refreshed
    // *before* it is used — the race that only shows up under real latency.
    cookieStore.get.mockReturnValue({ value: await sealedFresh({ expiresAt: Date.now() + 30_000 }) })
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({ access_token: 'at2', refresh_token: 'rt2', expires_in: 7200 }))
    )

    const { getCustomerSession } = await loadClient()
    const session = await getCustomerSession()

    expect(session?.accessToken).toBe('at2')
    expect(session?.refreshToken).toBe('rt2')
    expect(cookieStore.set).toHaveBeenCalledWith(
      'hj_customer_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    )
  })

  it('still returns the refreshed session when the cookie cannot be written', async () => {
    // Writing a cookie from a Server Component throws in Next, and this function
    // is called from both Server Components and route handlers. The refreshed
    // token is used for *this* request either way; the cookie is rewritten by
    // the next route handler that runs. Swallowing that throw is the documented
    // behaviour, and this is what proves it.
    cookieStore.get.mockReturnValue({ value: await sealedFresh({ expiresAt: Date.now() + 1_000 }) })
    cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler')
    })
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({ access_token: 'at2', refresh_token: 'rt2', expires_in: 7200 }))
    )

    const { getCustomerSession } = await loadClient()
    expect((await getCustomerSession())?.accessToken).toBe('at2')
  })

  it('returns null when Shopify refuses the refresh token', async () => {
    // An expired login, not an error. Surfacing it as one would put a stack
    // trace in front of a customer whose session simply ran out.
    cookieStore.get.mockReturnValue({ value: await sealedFresh({ expiresAt: Date.now() - 1 }) })
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({ error: 'invalid_grant' }, 400))
    )

    const { getCustomerSession } = await loadClient()
    expect(await getCustomerSession()).toBeNull()
  })

  it('returns null when discovery itself fails during a refresh', async () => {
    cookieStore.get.mockReturnValue({ value: await sealedFresh({ expiresAt: Date.now() - 1 }) })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const { getCustomerSession } = await loadClient()
    expect(await getCustomerSession()).toBeNull()
  })
})

describe('customerFetch', () => {
  it('refuses with 401 when nobody is signed in', async () => {
    cookieStore.get.mockReturnValue(undefined)
    const { customerFetch, CustomerApiError } = await loadClient()

    await expect(customerFetch('query { customer { id } }')).rejects.toBeInstanceOf(CustomerApiError)
    await expect(customerFetch('query { customer { id } }')).rejects.toMatchObject({ status: 401 })
  })

  it('sends the access token and never caches the response', async () => {
    // `no-store` is the load-bearing option here: this is one person's orders,
    // and a cached response is a response that can be served to somebody else.
    const seen: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      routedFetch((_url, init) => {
        if (init) seen.push(init)
        return jsonOk({ data: { customer: { firstName: 'Sân' } } })
      })
    )
    const { customerFetch } = await loadClient()

    const data = await customerFetch<{ customer: { firstName: string } }>(
      'query { customer { firstName } }',
      { first: 5 },
      { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 }
    )

    expect(data.customer.firstName).toBe('Sân')
    expect(seen).toHaveLength(1)
    expect(seen[0].cache).toBe('no-store')
    expect((seen[0].headers as Record<string, string>).Authorization).toBe('at')
    expect(JSON.parse(String(seen[0].body)).variables).toEqual({ first: 5 })
  })

  it('accepts an explicitly passed session without reading the cookie', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({ data: { customer: null } }))
    )
    const { customerFetch } = await loadClient()

    await customerFetch(
      'query { customer { id } }',
      {},
      { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 }
    )
    expect(cookieStore.get).not.toHaveBeenCalled()
  })

  it('reports the HTTP status on a non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({}, 503))
    )
    const { customerFetch } = await loadClient()

    await expect(
      customerFetch('q', {}, { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 })
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('503') })
  })

  it('joins GraphQL errors rather than reporting only the first', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({ errors: [{ message: 'one' }, { message: 'two' }] }))
    )
    const { customerFetch } = await loadClient()

    await expect(
      customerFetch('q', {}, { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 })
    ).rejects.toThrow('one; two')
  })

  it('refuses a 200 that carried neither data nor errors', async () => {
    // The shape that arrives as a value rather than an exception, and the one
    // that becomes `undefined.customer` at the call site if it is not caught.
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonOk({}))
    )
    const { customerFetch } = await loadClient()

    await expect(
      customerFetch('q', {}, { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 })
    ).rejects.toThrow(/no data/)
  })

  it('falls back to the cookie session when none is passed', async () => {
    cookieStore.get.mockReturnValue({ value: await sealedFresh({ accessToken: 'cookie-token' }) })
    const seen: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      routedFetch((_url, init) => {
        if (init) seen.push(init)
        return jsonOk({ data: { customer: null } })
      })
    )
    const { customerFetch } = await loadClient()

    await customerFetch('query { customer { id } }')
    expect((seen[0].headers as Record<string, string>).Authorization).toBe('cookie-token')
  })
})

describe('CUSTOMER_OVERVIEW', () => {
  it('asks for orders newest-first, which is the only order a customer expects', async () => {
    const { CUSTOMER_OVERVIEW } = await loadClient()
    expect(CUSTOMER_OVERVIEW).toContain('sortKey: PROCESSED_AT')
    expect(CUSTOMER_OVERVIEW).toContain('reverse: true')
  })

  it('takes the page size as a variable rather than hardcoding it', async () => {
    const { CUSTOMER_OVERVIEW } = await loadClient()
    expect(CUSTOMER_OVERVIEW).toContain('$first: Int!')
    expect(CUSTOMER_OVERVIEW).toContain('orders(first: $first')
  })
})
