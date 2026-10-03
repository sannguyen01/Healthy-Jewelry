import { describe, it, expect } from 'vitest'

const { readBoundedText, discardBody } = await import('../../../scripts/lib/bounded-read.mjs')

/**
 * **A size bound that is a read bound.**
 *
 * The live-surface probe called `response.text()` and sliced the result, which bounds what it
 * kept and not what it downloaded — and reported a page as read in full when only a prefix had
 * been inspected. These drive the replacement with real `Response` objects over streams whose
 * size and timing the test controls, including one that never ends.
 */

const CHUNK = 256 * 1024

/** A body that never ends, counting what was pulled and whether it was cancelled. */
function endless() {
  const state = { pulled: 0, cancelled: false }
  const chunk = new Uint8Array(CHUNK).fill(0x61) // 'a'
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulled += 1
      controller.enqueue(chunk)
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { response: new Response(stream), state }
}

/** A body delivered in the given chunks, pulled one at a time. */
function chunked(parts: Uint8Array[], headers: Record<string, string> = {}) {
  const state = { cancelled: false }
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= parts.length) return controller.close()
      controller.enqueue(parts[i++])
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { response: new Response(stream, { headers }), state }
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe('readBoundedText', () => {
  it('returns from a body that never ends, having kept no more than the cap, and cancels it', async () => {
    const { response, state } = endless()
    const cap = 2_000_000
    const result = await readBoundedText(response, cap)
    expect(result.bytesRead).toBe(cap)
    expect(result.text.length).toBe(cap)
    expect(result).toMatchObject({ truncated: true, reason: 'byte-cap' })
    expect(state.cancelled, 'the stream was left sending').toBe(true)
    // It stopped pulling at the cap: eight 256 KiB chunks cover 2 MB, plus the read-ahead the
    // stream's queue performs. Reading on would pull without bound.
    expect(state.pulled).toBeLessThanOrEqual(Math.ceil(cap / CHUNK) + 2)
  })

  it('reads a body under the cap whole, and says so', async () => {
    const { response } = chunked([bytes('<html>'), bytes('<body>clean</body>'), bytes('</html>')])
    expect(await readBoundedText(response, 1024)).toEqual({
      text: '<html><body>clean</body></html>',
      bytesRead: 31,
      truncated: false,
      reason: 'complete',
      declaredLength: null,
    })
  })

  it('a body of exactly the cap is complete; one byte more is truncated', async () => {
    expect((await readBoundedText(chunked([bytes('abcd')]).response, 4)).truncated).toBe(false)
    const over = await readBoundedText(chunked([bytes('abcd'), bytes('e')]).response, 4)
    expect(over).toMatchObject({ text: 'abcd', bytesRead: 4, truncated: true, reason: 'byte-cap' })
  })

  it('joins a multi-byte character split across two chunks', async () => {
    const euro = bytes('€') // three bytes
    const { response } = chunked([bytes('price-free '), euro.subarray(0, 1), euro.subarray(1)])
    expect((await readBoundedText(response, 1024)).text).toBe('price-free €')
  })

  it('never invents a character the cap cut in half', async () => {
    const result = await readBoundedText(chunked([bytes('ab€cd')]).response, 3) // 'ab' + first byte of €
    expect(result.text).toBe('ab')
    expect(result.text).not.toContain('�')
    expect(result.truncated).toBe(true)
  })

  it('a stream that errors part-way is truncated, not complete', async () => {
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true
          controller.enqueue(bytes('partial'))
          return
        }
        controller.error(new Error('connection reset'))
      },
    })
    const result = await readBoundedText(new Response(stream), 1024)
    expect(result).toMatchObject({ text: 'partial', truncated: true, reason: 'read-error' })
  })

  it('a response with no body is empty and not truncated', async () => {
    expect(await readBoundedText(new Response(null, { status: 204 }), 10)).toMatchObject({
      text: '',
      bytesRead: 0,
      truncated: false,
      reason: 'no-body',
    })
  })

  it('records the declared length without trusting it', async () => {
    const { response } = chunked([bytes('short')], { 'content-length': '5' })
    expect((await readBoundedText(response, 100)).declaredLength).toBe(5)
  })

  it('refuses a cap that is not a non-negative integer', async () => {
    await expect(readBoundedText(new Response('x'), -1)).rejects.toThrow(/non-negative integer/)
    await expect(readBoundedText(new Response('x'), 1.5)).rejects.toThrow(/non-negative integer/)
  })
})

describe('discardBody', () => {
  it('cancels an unread body, and never throws on one that is gone', async () => {
    const { response, state } = endless()
    await discardBody(response)
    expect(state.cancelled).toBe(true)
    await expect(discardBody(new Response(null))).resolves.toBeUndefined()
    await expect(discardBody({})).resolves.toBeUndefined()
  })
})
