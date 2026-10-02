import { NextRequest, NextResponse } from 'next/server'
import {
  isAnalyticsEventName,
  sanitiseQuery,
  MAX_QUERY_LENGTH,
  type AnalyticsEvent,
} from '@/lib/analytics/events'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'
import { readBoundedBody } from '@/lib/http/readBoundedBody'

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
 * Today "decides" means a structured log line in Vercel's function logs — the
 * only place these events are kept. That is enough to answer the questions this
 * site actually has: which pieces and collections people look at, and what they
 * search for and fail to find. There is no conversion to measure; nothing here
 * can be bought (`docs/analytics.md`). Piping the same events onward to a
 * warehouse later is a change to this file only, and a change to the privacy page
 * and `docs/data-flow-record.md` in the same commit.
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
// this bucket exists to stop abuse rather than to budget real use. The route is
// unauthenticated by necessity — a beacon cannot carry a credential worth having.
// `onError: 'allow'`. This is measurement. Dropping a beacon because Redis is
// unreachable would lose the data *and* spend a 500 telling a customer's browser
// about it — and this route already answers 204 to everything by design.
const limiter = createRateLimiter({
  limit: 120,
  window: '1 m',
  prefix: 'hj:analytics',
  onError: 'allow',
})

/** Small by design. A legitimate event is a few hundred bytes. */
const MAX_BODY_BYTES = 2_048

const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** Every field any event in the union carries, other than its name. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never
type EventField = Exclude<KeysOfUnion<AnalyticsEvent>, 'name'>

/**
 * One coercion per field the event union defines — **exactly** those fields.
 *
 * `satisfies Record<EventField, …>` makes the set a compile-time equality with
 * `AnalyticsEvent`: a field added to the union without a line here is a type error,
 * and so is a line here for a field no event defines. That second direction is the
 * one that had failed. Until 2026-09-25 this allowlist still copied `value`,
 * `currency`, `quantity`, `itemCount` and `reason` into the log — the price and
 * cart fields of four events deleted with the commerce UI — so anything posting
 * `{ value: '89.00', currency: 'USD' }` directly to this route had it written to a
 * log on a site that publishes no prices. No client sent them; the sink simply
 * outlived the vocabulary it was written for.
 */
const FIELD_SANITISERS = {
  handle: (value: unknown) => str(value, 128),
  collection: (value: unknown) => str(value, 64),
  material: (value: unknown) => str(value, 64),
  productCount: num,
  resultCount: num,
  // Sanitised again server-side. The client already truncates, but a route that
  // trusts its client for the one free-text field is not validating anything.
  query: (value: unknown) =>
    typeof value === 'string' ? sanitiseQuery(value.slice(0, MAX_QUERY_LENGTH)) : undefined,
} satisfies Record<EventField, (value: unknown) => string | number | undefined>

/**
 * Copy across only the fields the event union defines, coercing each.
 *
 * An allowlist, never a spread: spreading the request body would let anything a
 * caller invents reach the logs, which is precisely how a field carrying an email
 * address ends up in a log retention policy nobody wrote it into.
 *
 * The allowlist is the union's field set, not each event's own: a direct POST of
 * `product_viewed` carrying a `query` is logged with it, sanitised. Every field is
 * bounded, and the one free-text field is lower-cased and truncated whichever
 * event carries it, so per-event narrowing would tidy the record without changing
 * what it can hold. Recorded as a known limit rather than implied away.
 */
function sanitiseEvent(body: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof body.name === 'string' ? body.name : ''
  if (!isAnalyticsEventName(name)) return null

  const event: Record<string, unknown> = { name }
  for (const [field, clean] of Object.entries(FIELD_SANITISERS)) {
    event[field] = clean(body[field])
  }
  return event
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await limiter.isLimited(clientIp(request.headers))) {
    // 204 rather than 429. The client is a fire-and-forget beacon that ignores the
    // response, and a rate-limited *measurement* is not something a customer's
    // browser should hear about or retry.
    return new NextResponse(null, { status: 204 })
  }

  // Same shared reader as /api/contact — real bytes, bounded before allocation. Every refusal here stays 204: this route answers a
  // fire-and-forget beacon, and an oversize payload is not something a
  // customer's browser should hear about or retry.
  const body = await readBoundedBody(request, MAX_BODY_BYTES)
  if (!body.ok) return new NextResponse(null, { status: 204 })

  let parsed: unknown
  try {
    parsed = JSON.parse(body.text)
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
