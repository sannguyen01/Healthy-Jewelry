import { NextRequest, NextResponse } from 'next/server'
import { isAnalyticsEventName, sanitiseQuery, MAX_QUERY_LENGTH } from '@/lib/analytics/events'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'

/**
 * Where storefront events land.
 *
 * ## Why first-party and not a vendor tag
 *
 * No third-party script means nothing to load, nothing that can block rendering,
 * nothing that can be blocked by an extension, and no data leaving the origin the
 * customer is already talking to. It also means the storefront never has to change
 * when the destination does — the client posts here, and here decides.
 *
 * Today "decides" means a structured log line. On Vercel those are queryable and
 * retained, which is enough to answer the questions this store cannot currently
 * answer at all: how many people reach a product page, how many add to the bag,
 * and — the one that started this — how often checkout refuses and for which
 * typed reason. Piping the same events onward to a warehouse later is a change to
 * this file only.
 *
 * ## What is deliberately not recorded
 *
 * No cookies, no identifiers, no IP address, no user agent, no referrer, no
 * session. Nothing here can be joined back to a person, which is why the payload
 * is a fixed shape rather than an open bag: an open bag is how PII arrives by
 * accident. `clientIp` is read for rate limiting and never written.
 *
 * The client only reaches this route after explicit consent
 * (`src/lib/analytics/consent.ts`); the validation below is the second line, for
 * anything that posts directly.
 */

// Never prerendered, and never cached: it exists to be written to.
export const dynamic = 'force-dynamic'

// Generous. A browsing session legitimately fires an event every few seconds, and
// this bucket exists to stop abuse rather than to budget real use — the same
// posture as /api/shopify, which is unauthenticated for the same reason.
const limiter = createRateLimiter({ limit: 120, window: '1 m', prefix: 'hj:analytics' })

/** Small by design. A legitimate event is a few hundred bytes. */
const MAX_BODY_BYTES = 2_048

/**
 * Copy across only the fields the event union defines, coercing each.
 *
 * An allowlist, never a spread: spreading the request body would let anything a
 * caller invents reach the logs, which is precisely how a field carrying an email
 * address ends up in a log retention policy nobody wrote it into.
 */
function sanitiseEvent(body: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof body.name === 'string' ? body.name : ''
  if (!isAnalyticsEventName(name)) return null

  const str = (value: unknown, max = 128): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  return {
    name,
    handle: str(body.handle),
    collection: str(body.collection, 64),
    material: str(body.material, 64),
    value: str(body.value, 32),
    currency: str(body.currency, 8),
    quantity: num(body.quantity),
    itemCount: num(body.itemCount),
    productCount: num(body.productCount),
    resultCount: num(body.resultCount),
    reason: str(body.reason, 32),
    // Sanitised again server-side. The client already truncates, but a route that
    // trusts its client for the one free-text field is not validating anything.
    query: typeof body.query === 'string' ? sanitiseQuery(body.query.slice(0, MAX_QUERY_LENGTH)) : undefined,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await limiter.isLimited(clientIp(request.headers))) {
    // 204 rather than 429. The client is a fire-and-forget beacon that ignores the
    // response, and a rate-limited *measurement* is not something a customer's
    // browser should hear about or retry.
    return new NextResponse(null, { status: 204 })
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 })
  }

  let parsed: unknown
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })
    parsed = JSON.parse(raw)
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return new NextResponse(null, { status: 204 })
  }

  const event = sanitiseEvent(parsed as Record<string, unknown>)
  if (!event) return new NextResponse(null, { status: 204 })

  // `console.log`, deliberately, not `error` or `warn`. These are routine and
  // high-volume; putting them in Vercel's error view would drown the lines that
  // mean something is wrong — the same reasoning that made the API-version
  // mismatch an error and the fallback catalogue an error, and this not.
  console.log('[analytics]', JSON.stringify(event))

  return new NextResponse(null, { status: 204 })
}
