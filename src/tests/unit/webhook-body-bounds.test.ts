import { createHmac } from 'crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * **The one route that must read before it can authenticate.**
 *
 * `/api/webhooks/shopify` computes an HMAC over the request body, so the body
 * has to be fully read before the sender is known. `await req.arrayBuffer()`
 * therefore let an unauthenticated caller — no secret, no signature, not even a
 * shop domain — decide how much memory a Lambda allocated. Every other public
 * route in this codebase rate-limits or authenticates first; this is the only
 * one where that ordering is impossible, which is why the ceiling has to be
 * stated rather than assumed.
 *
 * The second half of this file is about the *unit* of the read. The signature
 * covers the exact octets Shopify sent, so the body is collected as bytes and
 * never round-tripped through a JavaScript string. `readBoundedBody` would have
 * been the obvious reuse and would have been wrong: decoding and re-encoding is
 * lossless only while the body is well-formed UTF-8, and a signature quietly
 * dependent on that is precisely the accidental correctness this route's own
 * header comment was written to remove.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const { POST } = await import('@/app/api/webhooks/shopify/route')
const { revalidateTag } = await import('next/cache')

const TEST_SECRET = 'test-webhook-secret'

/** The ceiling the route declares, restated here so the boundary cases are exact. */
const MAX_WEBHOOK_BODY_BYTES = 1_048_576

function signed(body: string | Uint8Array, topic = 'products/update', extra: Record<string, string> = {}) {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf-8') : Buffer.from(body)
  const sig = createHmac('sha256', TEST_SECRET).update(buf).digest('base64')
  return new NextRequest('http://localhost/api/webhooks/shopify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-hmac-sha256': sig,
      'x-shopify-topic': topic,
      ...extra,
    },
    // `new Uint8Array(buf)` rather than the Buffer: a Node Buffer is a Uint8Array
    // view over a pooled ArrayBuffer, and passing it as BodyInit can carry
    // neighbouring bytes from the pool.
    body: new Uint8Array(buf),
  })
}

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let infoSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', TEST_SECRET)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  errorSpy.mockRestore()
  warnSpy.mockRestore()
  infoSpy.mockRestore()
})

describe('the body is bounded before the sender is known', () => {
  it('refuses a body past the ceiling with 413', async () => {
    const huge = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1)
    const res = await POST(signed(huge))

    expect(res.status).toBe(413)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('refused a body over'))
  })

  it('refuses before doing any work, even for a perfectly valid signature', async () => {
    // The point of the ordering. This request is genuinely from "Shopify" — the
    // HMAC is correct — and it is still refused on size alone, because the size
    // check is the only thing that can run before the body exists in memory.
    const huge = JSON.stringify({ handle: 'arc-band-titanium', pad: 'x'.repeat(MAX_WEBHOOK_BODY_BYTES) })
    const res = await POST(signed(huge))

    expect(res.status).toBe(413)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses on a content-length that declares too much, without reading the body', async () => {
    // The courtesy fast path: a caller announcing an oversize body is taken at
    // its word, because believing it costs nothing and disbelieving it costs the
    // allocation. It is never the authority — the case above proves the real
    // count still decides.
    const res = await POST(
      signed('{"handle":"arc-band-titanium"}', 'products/update', {
        'content-length': String(MAX_WEBHOOK_BODY_BYTES + 1),
      })
    )

    expect(res.status).toBe(413)
  })

  it('accepts a body at exactly the ceiling', async () => {
    // The boundary from the other side. An off-by-one here would reject real
    // deliveries into a retry loop, which is the expensive direction to be wrong
    // in: Shopify retries for 48 hours.
    const pad = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES - '{"handle":"a","p":""}'.length)
    const body = `{"handle":"a","p":"${pad}"}`
    expect(Buffer.byteLength(body, 'utf-8')).toBe(MAX_WEBHOOK_BODY_BYTES)

    const res = await POST(signed(body))
    expect(res.status).toBe(200)
  })

  it('accepts an ordinary delivery unchanged', async () => {
    const res = await POST(signed('{"handle":"arc-band-titanium"}'))

    expect(res.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalled()
  })
})

describe('the signature is computed over bytes, not over a decoded string', () => {
  it('verifies a body whose bytes are not valid UTF-8', async () => {
    // **The assertion that justifies `readBoundedBytes` over `readBoundedBody`.**
    // 0x80 is a UTF-8 continuation byte with no lead byte, so decoding this body
    // to a string yields U+FFFD and re-encoding yields three different bytes.
    // The HMAC would then be computed over something Shopify never sent, and the
    // delivery would 401 with a log line blaming the secret.
    const bytes = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0x80, 0x22, 0x7d]) // {"a":"\x80"}
    expect(() => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))).toThrow()

    const res = await POST(signed(bytes))

    // 200, not 401: the signature matched. The payload is not parseable JSON, so
    // no handle is found — which is the documented, deliberate behaviour of
    // `readHandle`, and separate from whether the sender was authentic.
    expect(res.status).toBe(200)
  })

  it('verifies a body with multi-byte characters', async () => {
    // Vietnamese copy and the dong sign are the ordinary case on this storefront,
    // and `₫` is the character most likely to straddle a chunk boundary in a
    // streamed read.
    const body = JSON.stringify({ handle: 'vong-tay-titanium', title: 'Giá 1.450.000₫ — miễn phí' })
    const res = await POST(signed(body))

    expect(res.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith(expect.stringContaining('vong-tay-titanium'))
  })

  it('still rejects a body whose bytes were altered after signing', async () => {
    // The bound and the byte-exactness must not have cost the check its teeth.
    const body = '{"handle":"arc-band-titanium"}'
    const sig = createHmac('sha256', TEST_SECRET).update(Buffer.from(body, 'utf-8')).digest('base64')
    const req = new NextRequest('http://localhost/api/webhooks/shopify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shopify-hmac-sha256': sig,
        'x-shopify-topic': 'products/update',
      },
      body: '{"handle":"arc-band-titaniuM"}',
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('a narrowed invalidation is reported rather than assumed complete', () => {
  it('warns when a product payload carries no handle', async () => {
    // The listing pages were invalidated, so `/` and `/shop` refresh. But
    // `/products/[handle]` is cached under its own tag and nothing here can name
    // it, so that page serves stale copy for the rest of its 3600s window. A
    // partial invalidation that says nothing looks exactly like a complete one.
    const res = await POST(signed('{"id":12345}'))

    expect(res.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('was not invalidated'))
  })

  it('warns when a collection payload carries no handle', async () => {
    const res = await POST(signed('{"id":999}', 'collections/update'))

    expect(res.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('will stay stale'))
  })

  it('warns when the payload is not parseable at all', async () => {
    const res = await POST(signed('not json at all'))

    expect(res.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no usable handle'))
  })

  it('stays silent when the handle is present', async () => {
    await POST(signed('{"handle":"arc-band-titanium"}'))

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('no usable handle'))
  })
})
