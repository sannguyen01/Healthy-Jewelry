// Healthy Jewelry — reading a request body without trusting its size
//
// One implementation, three callers. The guard it replaces existed twice,
// verbatim, in `/api/shopify` and `/api/analytics` — and not at all in
// `/api/contact`, which parses JSON and then calls a paid email API.

/**
 * The outcome of a bounded read.
 *
 * Three states, not two. `'unreadable'` is kept distinct from `'too-large'`
 * because they mean different things to the caller and to whoever reads the
 * logs: one is a client sending more than it may, the other is a transport that
 * failed mid-stream. Collapsing them is the laundering
 * [ADR 010](../../../docs/adr/010-a-control-that-cannot-fail.md) is about,
 * applied to a request body.
 */
export type BoundedBody =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: 'too-large' | 'unreadable' }

/**
 * Read a request body, refusing anything past `maxBytes`.
 *
 * ## The defect this replaces
 *
 * Both call sites declared a constant named `MAX_BODY_BYTES` and then compared
 * it against `String.prototype.length`:
 *
 * ```ts
 * const rawBody = await request.text()
 * if (rawBody.length > MAX_BODY_BYTES) …
 * ```
 *
 * `.length` counts **UTF-16 code units, not bytes**. A body of Vietnamese or CJK
 * text is 3 bytes per character in UTF-8 and 1 unit; emoji and other astral-plane
 * characters are 4 bytes and 2 units. So the effective budget was up to **three
 * times** the number the constant named — on a storefront trading in VND to a
 * Vietnam market, where multi-byte input is the norm rather than the exception.
 *
 * ## Two further problems, both of them ordering
 *
 * `await request.text()` materialises the **entire** body before the guard runs,
 * so the check happened after the allocation it exists to prevent. A caller
 * sending 50 MB with no `content-length` got 50 MB buffered first, against a
 * 2 KB budget. This reads through the stream with a running byte count and
 * cancels the moment the budget is passed.
 *
 * And `parseInt(contentLength, 10)` returns `NaN` for a malformed header;
 * `NaN > maxBytes` is `false`, so it fell through silently. Benign, because a
 * real check followed — but a branch that reads as a guard and never fires is
 * how the next one gets trusted.
 *
 * ## What `content-length` is and is not
 *
 * It is a **courtesy fast-path**, never a control: the client sets it, so it can
 * lie in both directions. It is honoured only to avoid reading a body that has
 * already announced itself as oversize. The authority is the byte count below.
 *
 * @param request  the incoming request
 * @param maxBytes hard ceiling, in real UTF-8 bytes
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBody> {
  const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  // `Number.isFinite` rather than a bare comparison: NaN fails every comparison,
  // so a malformed header would otherwise take the "small enough" path by
  // default rather than by decision.
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too-large' }
  }

  const stream = request.body

  // No stream to read. Either there is genuinely no body, or this runtime does
  // not expose one — some fetch implementations and test doubles do not. Falling
  // back to `text()` keeps the byte accounting correct in both cases; what it
  // cannot do is refuse before allocating, which is why it is the fallback and
  // not the path.
  if (!stream) {
    try {
      const text = await request.text()
      const bytes = new TextEncoder().encode(text).length
      return bytes > maxBytes ? { ok: false, reason: 'too-large' } : { ok: true, text, bytes }
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let bytes = 0
  let text = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      bytes += value.byteLength
      if (bytes > maxBytes) {
        // Stop pulling. The rest of the body is never allocated, which is the
        // whole point of reading it this way.
        await reader.cancel().catch(() => {})
        return { ok: false, reason: 'too-large' }
      }

      // `stream: true` so a multi-byte character split across two chunks is
      // decoded correctly rather than becoming a replacement character. This is
      // not hypothetical on a VND storefront: `₫` is three bytes.
      text += decoder.decode(value, { stream: true })
    }

    // Flush whatever the streaming decoder was holding.
    text += decoder.decode()
    return { ok: true, text, bytes }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}
