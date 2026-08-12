import { createHmac } from 'crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// next/cache is server-only; mock before importing the route
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const { POST } = await import('@/app/api/webhooks/shopify/route')
const { revalidatePath, revalidateTag } = await import('next/cache')

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-webhook-secret'

function makeSignedReq(body: string, secret: string, topic = 'products/update'): NextRequest {
  const sig = createHmac('sha256', secret).update(Buffer.from(body)).digest('base64')
  return new NextRequest('http://localhost/api/webhooks/shopify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-hmac-sha256': sig,
      'x-shopify-topic': topic,
    },
    body,
  })
}

function makeReqWithSig(body: string, sig: string, topic = 'products/update'): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/shopify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-hmac-sha256': sig,
      'x-shopify-topic': topic,
    },
    body,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/shopify', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('configuration guard', () => {
    it('returns 503 when SHOPIFY_WEBHOOK_SECRET is not set', async () => {
      vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', '')
      const req = makeSignedReq('{}', TEST_SECRET)
      const res = await POST(req)
      expect(res.status).toBe(503)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/not configured/i)
    })
  })

  describe('HMAC validation', () => {
    beforeEach(() => {
      vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', TEST_SECRET)
    })

    it('returns 401 when HMAC signature is wrong', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeReqWithSig(body, 'definitely-wrong-signature')
      const res = await POST(req)
      expect(res.status).toBe(401)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/unauthorized/i)
    })

    it('returns 401 when HMAC header is empty', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeReqWithSig(body, '')
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('returns 401 when HMAC is tampered (length differs)', async () => {
      const body = JSON.stringify({ id: 1 })
      const validSig = createHmac('sha256', TEST_SECRET).update(Buffer.from(body)).digest('base64')
      const tamperedSig = validSig.slice(0, -4) // truncate — length mismatch
      const req = makeReqWithSig(body, tamperedSig)
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('returns 401 when secret is wrong even with correct format', async () => {
      const body = JSON.stringify({ id: 1 })
      const wrongSig = createHmac('sha256', 'wrong-secret')
        .update(Buffer.from(body))
        .digest('base64')
      const req = makeReqWithSig(body, wrongSig)
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('accepts a valid HMAC signature', async () => {
      const body = JSON.stringify({ id: 1, title: 'Arc Band' })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      const res = await POST(req)
      expect(res.status).toBe(200)
    })
  })

  describe('topic routing', () => {
    beforeEach(() => {
      vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', TEST_SECRET)
    })

    it('revalidates the broad product listing paths on products/update topic', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      await POST(req)
      expect(revalidatePath).toHaveBeenCalledWith('/', 'page')
      expect(revalidatePath).toHaveBeenCalledWith('/shop', 'page')
      expect(revalidateTag).toHaveBeenCalledWith('products')
    })

    it('scopes revalidation to the specific product when the payload includes a handle', async () => {
      const body = JSON.stringify({ id: 1, handle: 'arc-band-titanium' })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      await POST(req)
      expect(revalidateTag).toHaveBeenCalledWith('product:arc-band-titanium')
      // No longer invalidates every generated product detail page —
      // the scoped tag replaces the old blanket path revalidation.
      expect(revalidatePath).not.toHaveBeenCalledWith('/products/[handle]', 'page')
    })

    it('does not crash and still revalidates the broad tag when the payload has no handle', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(revalidateTag).toHaveBeenCalledWith('products')
      expect(revalidateTag).not.toHaveBeenCalledWith(expect.stringMatching(/^product:/))
    })

    it('does not crash on an unparseable webhook body', async () => {
      const body = 'not-json'
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(revalidateTag).toHaveBeenCalledWith('products')
    })

    it('revalidates product paths on products/create topic', async () => {
      const body = JSON.stringify({ id: 2 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/create')
      await POST(req)
      expect(revalidatePath).toHaveBeenCalledWith('/shop', 'page')
      expect(revalidateTag).toHaveBeenCalledWith('products')
    })

    it('revalidates product paths on products/delete topic', async () => {
      const body = JSON.stringify({ id: 3 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/delete')
      await POST(req)
      expect(revalidateTag).toHaveBeenCalledWith('products')
    })

    it('revalidates collection paths on collections/update topic', async () => {
      const body = JSON.stringify({ id: 10 })
      const req = makeSignedReq(body, TEST_SECRET, 'collections/update')
      await POST(req)
      expect(revalidatePath).toHaveBeenCalledWith('/shop/[collection]', 'page')
    })

    it('revalidates the specific collection tag the listing fetch registers', async () => {
      // Previously asserted `revalidateTag('collections')`. That string was
      // never registered by any fetch, so the call did nothing and collection
      // pages stayed stale for the full 3600s — the test passed throughout
      // because it asserted the same wrong string the route used.
      // `getProductsByCollection` registers `collection:<handle>`; that is what
      // has to be revalidated. See `cache-tag-contract.test.ts`.
      const body = JSON.stringify({ id: 10, handle: 'rings' })
      const req = makeSignedReq(body, TEST_SECRET, 'collections/update')
      await POST(req)

      expect(revalidateTag).toHaveBeenCalledWith('collection:rings')
      expect(revalidateTag).not.toHaveBeenCalledWith('collections')
    })

    it('a malformed body still yields the broad invalidation on the products topic', async () => {
      // What the duplicated try/catch was protecting, now that both branches share
      // `readHandle`. Shopify retries on a non-2xx, and a body that will not parse now
      // will not parse on the retry either — so failing the delivery would trade a scoped
      // invalidation for an infinite redelivery loop.
      const req = makeSignedReq('{not json', TEST_SECRET, 'products/update')
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(revalidateTag).toHaveBeenCalledWith('products')
      expect(revalidatePath).toHaveBeenCalledWith('/', 'page')
    })

    it('a malformed body is tolerated on the collections topic too', async () => {
      // Both branches, because the whole point of the extraction is that they cannot
      // diverge — and divergence between these two branches is the bug that started this.
      const req = makeSignedReq('{not json', TEST_SECRET, 'collections/update')
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(revalidatePath).toHaveBeenCalledWith('/shop/[collection]', 'page')
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('falls back to path revalidation when the collection payload has no handle', async () => {
      // Payload shape varies by topic and API version. Without a handle there
      // is no scoped tag to invalidate, so the path revalidation above is the
      // whole of the response — deliberately not a broad `products` sweep,
      // which would drop every product cache in the store.
      const body = JSON.stringify({ id: 10 })
      const req = makeSignedReq(body, TEST_SECRET, 'collections/update')
      await POST(req)

      expect(revalidatePath).toHaveBeenCalledWith('/shop/[collection]', 'page')
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('does not revalidate products for collections topic', async () => {
      const body = JSON.stringify({ id: 10 })
      const req = makeSignedReq(body, TEST_SECRET, 'collections/update')
      await POST(req)
      expect(revalidateTag).not.toHaveBeenCalledWith('products')
    })

    it('does not revalidate collections for products topic', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      await POST(req)
      expect(revalidateTag).not.toHaveBeenCalledWith('collections')
    })

    it('handles orders/* without revalidating the catalog', async () => {
      // Renamed: `orders/paid` is a *handled* topic — it is logged so the
      // storefront has a record of the sale. It simply does not invalidate any
      // cached page, which is a different thing from being unrecognised.
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'orders/paid')
      const res = await POST(req)
      expect(res.status).toBe(200)
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    it('returns { ok: true } in response body', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'products/update')
      const res = await POST(req)
      const json = (await res.json()) as { ok: boolean }
      expect(json.ok).toBe(true)
    })
  })
})

/**
 * Everything below hardens the endpoint against deliveries it should not act
 * on, and — more usefully in practice — makes the one failure that is
 * genuinely hard to diagnose say what it is.
 */
describe('webhook hardening', () => {
  beforeEach(() => {
    vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', TEST_SECRET)
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'y0k9ve-q1.myshopify.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function signedWith(headers: Record<string, string>, topic: string, body = '{"id":1}') {
    const sig = createHmac('sha256', TEST_SECRET).update(Buffer.from(body)).digest('base64')
    return new NextRequest('http://localhost/api/webhooks/shopify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shopify-hmac-sha256': sig,
        'x-shopify-topic': topic,
        ...headers,
      },
      body,
    })
  }

  describe('topic allowlist', () => {
    it('acknowledges an unhandled topic without claiming to have handled it', async () => {
      // A blanket 200 tells Shopify's delivery log the work was done. It was
      // not: nothing in this route acts on `customers/*`.
      const res = await POST(signedWith({}, 'customers/create'))
      expect(res.status).toBe(202)
      const json = (await res.json()) as { handled: boolean; topic: string }
      expect(json.handled).toBe(false)
      expect(json.topic).toBe('customers/create')
    })

    it('does not retry-bait Shopify with a non-2xx', async () => {
      // A 4xx/5xx would make Shopify redeliver a topic we will never handle,
      // forever.
      const res = await POST(signedWith({}, 'app/uninstalled'))
      expect(res.status).toBeGreaterThanOrEqual(200)
      expect(res.status).toBeLessThan(300)
    })

    it('a missing topic header is unhandled, not a crash', async () => {
      const body = '{"id":1}'
      const sig = createHmac('sha256', TEST_SECRET).update(Buffer.from(body)).digest('base64')
      const req = new NextRequest('http://localhost/api/webhooks/shopify', {
        method: 'POST',
        headers: { 'x-shopify-hmac-sha256': sig },
        body,
      })
      const res = await POST(req)
      expect(res.status).toBe(202)
    })

    it.each(['products/update', 'collections/update', 'orders/create', 'orders/paid'])(
      'still handles %s',
      async (topic) => {
        const res = await POST(signedWith({}, topic))
        expect(res.status).toBe(200)
      }
    )
  })

  describe('shop domain', () => {
    it('rejects a correctly-signed delivery for a different shop', async () => {
      const res = await POST(
        signedWith({ 'x-shopify-shop-domain': 'someone-else.myshopify.com' }, 'orders/create')
      )
      expect(res.status).toBe(401)
    })

    it('accepts a delivery for the configured shop', async () => {
      const res = await POST(
        signedWith({ 'x-shopify-shop-domain': 'y0k9ve-q1.myshopify.com' }, 'orders/create')
      )
      expect(res.status).toBe(200)
    })

    it('does not reject when no shop domain is configured', async () => {
      // A preview deployment without the env var must not 401 everything —
      // that would look identical to a wrong secret and send someone hunting
      // the wrong problem.
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
      const res = await POST(
        signedWith({ 'x-shopify-shop-domain': 'anything.myshopify.com' }, 'orders/create')
      )
      expect(res.status).toBe(200)
    })
  })

  describe('a wrong secret says which secret', () => {
    it('logs the two-secrets trap by name on a signature mismatch', async () => {
      // The trap: a webhook created in Shopify Admin (Settings → Notifications)
      // is signed with that page's signing secret, while one created by an app
      // is signed with the app client secret. Picking the wrong one produces an
      // endless stream of silent 401s. The response stays 401 — a wrong secret
      // and a forgery are indistinguishable — but the log has to be actionable.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const body = '{"id":1}'
      const wrongSig = createHmac('sha256', 'the-other-secret')
        .update(Buffer.from(body))
        .digest('base64')
      const req = new NextRequest('http://localhost/api/webhooks/shopify', {
        method: 'POST',
        headers: { 'x-shopify-hmac-sha256': wrongSig, 'x-shopify-topic': 'orders/create' },
        body,
      })

      const res = await POST(req)
      expect(res.status).toBe(401)

      const logged = warn.mock.calls.flat().join(' ')
      expect(logged).toMatch(/Notifications/)
      expect(logged).toMatch(/app client secret/)
    })

    it('distinguishes a missing header from a wrong secret', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const req = new NextRequest('http://localhost/api/webhooks/shopify', {
        method: 'POST',
        headers: { 'x-shopify-topic': 'orders/create' },
        body: '{"id":1}',
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
      expect(warn.mock.calls.flat().join(' ')).toMatch(/not a Shopify delivery/)
    })

    it('never reveals in the response which of the two it was', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const body = '{"id":1}'
      const wrongSig = createHmac('sha256', 'nope').update(Buffer.from(body)).digest('base64')
      const req = new NextRequest('http://localhost/api/webhooks/shopify', {
        method: 'POST',
        headers: { 'x-shopify-hmac-sha256': wrongSig, 'x-shopify-topic': 'orders/create' },
        body,
      })
      const res = await POST(req)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Unauthorized')
    })
  })
})
