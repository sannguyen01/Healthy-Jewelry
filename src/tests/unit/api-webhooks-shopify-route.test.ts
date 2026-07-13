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
      expect(revalidateTag).toHaveBeenCalledWith('collections')
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

    it('returns 200 for an unrecognised topic (no revalidation needed)', async () => {
      const body = JSON.stringify({ id: 1 })
      const req = makeSignedReq(body, TEST_SECRET, 'orders/paid')
      const res = await POST(req)
      expect(res.status).toBe(200)
      // No product/collection revalidation expected
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
