import { describe, it, expect } from 'vitest'
import { readBoundedBody } from '@/lib/http/readBoundedBody'

/**
 * **A budget named in bytes, measured in bytes.**
 *
 * Two routes declared `MAX_BODY_BYTES` and compared it against
 * `String.prototype.length`, which counts UTF-16 code units. A third parsed JSON
 * and called a paid email API with no guard at all.
 *
 * The unit mismatch is not academic here. This storefront trades in VND to a
 * Vietnam market: Vietnamese text is 2-3 bytes per character in UTF-8 and 1 code
 * unit, and the dong sign `₫` — which appears in every price the site renders —
 * is three bytes and one unit. So the budget was up to **3x** its stated value
 * precisely for the input this site receives most.
 *
 * The cases below are ordered by what they protect:
 *
 *   · the unit itself, asserted against text that makes the two disagree;
 *   · the boundary, from both sides, because an off-by-one in a size guard is
 *     the whole guard;
 *   · the ordering — refusing *before* allocating, which the `await text()`
 *     version could not do by construction;
 *   · the header, which is a courtesy and not a control, in both directions.
 */

/** A request whose body is a real stream, as a route handler receives. */
function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('the budget is measured in bytes, not code units', () => {
  it('accepts ASCII up to the limit', async () => {
    const result = await readBoundedBody(post('a'.repeat(100)), 100)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bytes).toBe(100)
  })

  it('refuses multi-byte text that the old .length check would have allowed', async () => {
    // 50 dong signs: 50 UTF-16 code units, 150 UTF-8 bytes. Against a 100-byte
    // budget the old check passed this (50 <= 100) and this one refuses it.
    const body = '₫'.repeat(50)
    expect(body.length).toBe(50)
    expect(new TextEncoder().encode(body).length).toBe(150)

    const result = await readBoundedBody(post(body), 100)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too-large')
  })

  it('counts an astral-plane character as its four bytes, not its two units', async () => {
    const body = '😀'.repeat(10) // 20 code units, 40 bytes
    expect(body.length).toBe(20)

    await expect(readBoundedBody(post(body), 39)).resolves.toMatchObject({ ok: false })
    await expect(readBoundedBody(post(body), 40)).resolves.toMatchObject({ ok: true })
  })

  it('decodes a multi-byte character split across chunk boundaries', async () => {
    // The streaming decoder is why `{ stream: true }` is passed. Without it, a
    // character straddling two chunks becomes U+FFFD — and on this site the most
    // likely character to straddle one is the currency symbol in every price.
    const encoder = new TextEncoder()
    const full = encoder.encode('giá 1.450.000₫ — miễn phí')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split deliberately mid-character: `₫` occupies three bytes and the cut
        // lands inside it.
        const cut = full.indexOf(0xe2) + 1
        controller.enqueue(full.slice(0, cut))
        controller.enqueue(full.slice(cut))
        controller.close()
      },
    })

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: stream,
      // @ts-expect-error — duplex is required by the spec for a stream body and
      // is not yet in the DOM lib types Node ships against.
      duplex: 'half',
    })

    const result = await readBoundedBody(request, 1_000)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('₫')
      expect(result.text).not.toContain('�')
    }
  })
})

describe('the boundary, from both sides', () => {
  it('accepts exactly maxBytes', async () => {
    await expect(readBoundedBody(post('x'.repeat(64)), 64)).resolves.toMatchObject({
      ok: true,
      bytes: 64,
    })
  })

  it('refuses maxBytes + 1', async () => {
    await expect(readBoundedBody(post('x'.repeat(65)), 64)).resolves.toMatchObject({
      ok: false,
      reason: 'too-large',
    })
  })

  it('accepts an empty body', async () => {
    await expect(readBoundedBody(post(''), 64)).resolves.toMatchObject({ ok: true, bytes: 0 })
  })
})

describe('content-length is a courtesy, never the authority', () => {
  it('refuses early when the header already declares too much', async () => {
    const result = await readBoundedBody(post('small', { 'content-length': '999999' }), 64)
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('still refuses an oversize body that UNDER-declares its length', async () => {
    // The header is set by the caller, so it can lie in both directions. This is
    // the direction that matters: a truthful-looking header must not buy a pass.
    const result = await readBoundedBody(post('x'.repeat(200), { 'content-length': '10' }), 64)
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('does not silently pass a malformed header', async () => {
    // `parseInt('junk', 10)` is NaN, and `NaN > max` is false — so the old
    // pre-check fell through by default rather than by decision. Harmless there
    // because a real check followed; this asserts the real check is still the
    // one that decides.
    const ok = await readBoundedBody(post('small', { 'content-length': 'junk' }), 64)
    expect(ok.ok).toBe(true)

    const tooBig = await readBoundedBody(post('x'.repeat(200), { 'content-length': 'junk' }), 64)
    expect(tooBig).toMatchObject({ ok: false, reason: 'too-large' })
  })
})

describe('an oversize body is refused before it is allocated', () => {
  it('cancels the stream instead of draining it', async () => {
    // The ordering defect: `await request.text()` materialised the entire body
    // and *then* checked its size, so the guard ran after the allocation it
    // exists to prevent. A caller sending 50 MB against a 2 KB budget got 50 MB
    // buffered first.
    //
    // `pulled` counts how many chunks the reader asked for. A draining
    // implementation reads all five; a cancelling one stops at the second, which
    // is where the running total first passes the budget.
    let pulled = 0
    const chunk = new TextEncoder().encode('x'.repeat(1_000))

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        if (pulled > 5) {
          controller.close()
          return
        }
        controller.enqueue(chunk)
      },
    })

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: stream,
      // @ts-expect-error — see above.
      duplex: 'half',
    })

    const result = await readBoundedBody(request, 1_500)
    expect(result).toMatchObject({ ok: false, reason: 'too-large' })
    expect(pulled, 'the reader kept pulling past the budget').toBeLessThan(5)
  })
})

describe('unreadable is not the same finding as too-large', () => {
  it('reports unreadable when the stream errors mid-read', async () => {
    // Two different facts: a client sending more than it may, and a transport
    // that failed. Collapsing them would tell the operator a caller misbehaved
    // when the network did.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'))
        controller.error(new Error('connection reset'))
      },
    })

    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body: stream,
      // @ts-expect-error — see above.
      duplex: 'half',
    })

    await expect(readBoundedBody(request, 1_000)).resolves.toMatchObject({
      ok: false,
      reason: 'unreadable',
    })
  })
})
