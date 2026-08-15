// Healthy Jewelry — turning a fetch failure back into evidence
//
// ## Why this exists
//
// `undici` — Node's built-in fetch — throws a `TypeError` whose message is the literal
// string `fetch failed` for every network-layer failure there is. DNS miss, connection
// refused, TLS chain rejected, connection reset, timeout: one message, no discrimination.
// The actual cause is nested in `err.cause`, sometimes two levels deep, and carries the
// `code` that names the problem.
//
// On 2026-08-13 the production smoke run reported:
//
//     ✗ Request failed before reaching the route: fetch failed
//
// and that was the entire record. `verify-production.mjs` had reached the same origin over
// GET seconds earlier, so the interesting question was what made *this* request different —
// and the answer had been caught, wrapped, and dropped on the floor by
// `console.error(err.message)`. The run cost a full six-hour cycle and produced one string
// that was true of every possible cause.
//
// Reporting `err.cause.code` costs one property read and is the difference between
// "the site is down" and "this host does not resolve from a GitHub runner".

/**
 * Walk the `cause` chain and describe what actually went wrong.
 *
 * Bounded rather than recursive-until-null: a cyclic `cause` is not something a diagnostic
 * script should hang on, and nothing real nests more than a couple of levels.
 *
 * @param {unknown} err
 * @returns {string} a single line, safe to append to a message
 */
export function describeFetchError(err) {
  const parts = []
  let current = err
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    // `code` and `errno` are not on the Error type but are what Node populates and what
    // the reader needs — ENOTFOUND, ECONNREFUSED, UNABLE_TO_VERIFY_LEAF_SIGNATURE.
    const code = /** @type {{ code?: string }} */ (current).code
    const label = code ? `${code}: ${current.message}` : current.message
    if (!parts.includes(label)) parts.push(label)
    current = /** @type {{ cause?: unknown }} */ (current).cause
  }
  if (parts.length === 0) return String(err)
  return parts.join(' ← ')
}

/**
 * The hints worth printing next to a network failure, keyed by what the code implies.
 *
 * Kept separate from `describeFetchError` so the description stays a fact and the guidance
 * stays a guess — the two should never be indistinguishable in a log that people act on.
 *
 * @param {string} description output of `describeFetchError`
 * @returns {string | null}
 */
export function hintForFetchError(description) {
  if (description.includes('ENOTFOUND') || description.includes('EAI_AGAIN')) {
    return 'The host does not resolve. Check PRODUCTION_SITE_URL for a typo, a missing scheme, or a domain that was never attached to the Vercel project.'
  }
  if (description.includes('ECONNREFUSED') || description.includes('ECONNRESET')) {
    return 'The host resolves but refused or dropped the connection. A platform-level block (Vercel Deployment Protection, a firewall rule, or bot mitigation) will do this to a POST while leaving GETs alone.'
  }
  if (description.includes('CERT') || description.includes('SELF_SIGNED')) {
    return 'TLS verification failed. Usually a domain pointed at Vercel before its certificate finished provisioning.'
  }
  if (description.includes('UND_ERR_CONNECT_TIMEOUT') || description.includes('timeout')) {
    return 'The connection timed out. The origin is reachable in DNS but not answering.'
  }
  return null
}
