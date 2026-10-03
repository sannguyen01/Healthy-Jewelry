// Healthy Jewelry — read at most N bytes of a response body, and say whether that was all of it.
//
// ## Why this exists
//
// `probe-live-surface.mjs` called `response.text()` and then `.slice(0, MAX_BODY_BYTES)`. That
// bounds the string it *kept*, not the bytes it *received*: the whole body was downloaded and
// decoded into memory first, however large, and only then cut. A two-megabyte "maximum" was a
// retention limit wearing the name of a read limit.
//
// It also lost a fact the probe needs. A page whose first two megabytes were clean and whose
// price sat at byte three million read as clean, and nothing in the evidence said that part of
// the page had never been looked at. An absence finding is only as good as the coverage behind
// it, so the coverage is now part of the answer: `truncated` says the verdict is about a prefix.
//
// Streamed through `response.body.getReader()`, stopped at the cap, and the stream cancelled so
// the connection stops sending. Never `text()`, `arrayBuffer()` or `json()` — each of those
// reads the whole body before returning.

/**
 * @typedef {object} BoundedText
 * @property {string} text          the decoded prefix — the whole body when `truncated` is false
 * @property {number} bytesRead     bytes kept, never more than the cap
 * @property {boolean} truncated    true when bytes past the cap existed, or the read failed part-way
 * @property {'complete' | 'byte-cap' | 'no-body' | 'read-error'} reason
 * @property {number | null} declaredLength  `content-length`, when the server sent one
 */

/**
 * @param {{ body?: ReadableStream<Uint8Array> | null, headers?: { get: (name: string) => string | null } }} response
 * @param {number} maxBytes
 * @returns {Promise<BoundedText>}
 */
export async function readBoundedText(response, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new Error(`maxBytes must be a non-negative integer, got ${maxBytes}`)
  // `Number(null)` is 0, so an absent header must be told apart before converting: a response
  // that declares nothing has not declared zero bytes.
  const header = response?.headers?.get?.('content-length')
  const declared = typeof header === 'string' && header.trim() !== '' ? Number(header) : NaN
  const declaredLength = Number.isInteger(declared) && declared >= 0 ? declared : null

  const body = response?.body
  if (!body || typeof body.getReader !== 'function') {
    return { text: '', bytesRead: 0, truncated: false, reason: 'no-body', declaredLength }
  }

  const reader = body.getReader()
  // Streaming decode, so a multi-byte character split across two chunks is joined rather than
  // replaced — and one split by the cap itself is dropped at the final flush, not invented.
  const decoder = new TextDecoder('utf-8')
  const parts = []
  let bytesRead = 0
  let reason = /** @type {BoundedText['reason']} */ ('complete')

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      const room = maxBytes - bytesRead
      if (value.byteLength > room) {
        if (room > 0) {
          parts.push(decoder.decode(value.subarray(0, room), { stream: true }))
          bytesRead += room
        }
        reason = 'byte-cap'
        break
      }
      parts.push(decoder.decode(value, { stream: true }))
      bytesRead += value.byteLength
    }
  } catch {
    reason = 'read-error'
  }

  if (reason !== 'complete') {
    try {
      await reader.cancel()
    } catch {
      // the stream is already errored or closed; nothing more will arrive either way
    }
  } else {
    reader.releaseLock?.()
  }

  // A truncated prefix may end inside a character; its final flush yields a replacement
  // character that no server sent, so it is not appended.
  if (reason === 'complete') parts.push(decoder.decode())
  return { text: parts.join(''), bytesRead, truncated: reason !== 'complete', reason, declaredLength }
}

/**
 * Release a body nobody will read — a redirect hop's — so its connection is not held open
 * waiting for a consumer. Never throws.
 *
 * @param {{ body?: ReadableStream<Uint8Array> | null }} response
 */
export async function discardBody(response) {
  try {
    await response?.body?.cancel?.()
  } catch {
    // locked, already consumed, or never there — none of it matters to a hop being skipped
  }
}
