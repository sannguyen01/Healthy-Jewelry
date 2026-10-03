import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAnalyticsEventName, type AnalyticsEvent, type AnalyticsEventName } from '@/lib/analytics/events'
import { getAllProducts } from '@/lib/catalog'
import { COLLECTION_HANDLES, MATERIAL_HANDLES } from '@/lib/catalog/schema'
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
 * session, and — since 2026-09-27 — no text anybody typed. Every value this route can
 * write is one the catalogue already publishes (a product, collection or material
 * handle) or a count no larger than the catalogue, so a log line cannot carry a word the
 * site did not already contain. `clientIp` is read for rate limiting and never written.
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

/**
 * **One strict schema per event — the exact fields that event defines, and nothing else.**
 *
 * Until 2026-09-27 this was one allowlist over the *union's* fields, so a direct POST could
 * attach one event's field to another: `product_viewed` carrying `query`, the one free-text
 * field, was logged with it. Lower-casing and cutting to 64 characters bounded how much of a
 * pasted email address, phone number or order reference got written, not whether it did. And
 * the other fields were open too — `handle` took any string, `productCount` any finite
 * number, so a phone number was a valid count.
 *
 * Now every value is enumerated or bounded by the catalogue, and `.strict()` rejects any key
 * the event does not define. **A payload that fails drops the whole event**: a record that is
 * partly forged is not partly true, and keeping its valid half would tell an attacker which
 * half got through. `search_performed` carries no text at all (see `SearchFacet`).
 */
const PRODUCT_HANDLES = new Set(getAllProducts().map((p) => p.handle))

/** The largest count the catalogue can produce: no collection or search holds more products than exist. */
const MAX_COUNT = getAllProducts().length

const count = z.number().int().min(0).max(MAX_COUNT)
const collection = z.enum(COLLECTION_HANDLES)
const material = z.enum(MATERIAL_HANDLES)

const EVENT_SCHEMAS = {
  product_viewed: z
    .object({
      name: z.literal('product_viewed'),
      handle: z.string().refine((handle) => PRODUCT_HANDLES.has(handle)),
      collection,
      material,
    })
    .strict(),
  collection_viewed: z.object({ name: z.literal('collection_viewed'), collection, productCount: count }).strict(),
  search_performed: z
    .object({
      name: z.literal('search_performed'),
      resultCount: count,
      facets: z
        .array(z.union([collection, material]))
        .max(COLLECTION_HANDLES.length + MATERIAL_HANDLES.length)
        .refine((facets) => new Set(facets).size === facets.length),
    })
    .strict(),
} satisfies { [N in AnalyticsEventName]: z.ZodType<Extract<AnalyticsEvent, { name: N }>> }

/**
 * The other direction of that `satisfies`: each schema's output is *exactly* its event, not
 * merely assignable to it. A field added to an event without a line in its schema — or a
 * schema accepting a field no event defines — is a type error, in the gate, before a beacon
 * can carry it.
 */
type Flat<T> = { [K in keyof T]: T[K] }
type Same<A, B> = (<T>() => T extends Flat<A> ? 1 : 2) extends <T>() => T extends Flat<B> ? 1 : 2 ? true : false
const exact: { [N in AnalyticsEventName]: Same<z.infer<(typeof EVENT_SCHEMAS)[N]>, Extract<AnalyticsEvent, { name: N }>> } = {
  product_viewed: true,
  collection_viewed: true,
  search_performed: true,
}
void exact

/** The event exactly as its schema admits it, or `null` — never a partial record. */
function parseEvent(body: unknown): AnalyticsEvent | null {
  if (typeof body !== 'object' || body === null || !('name' in body)) return null
  const name = typeof body.name === 'string' ? body.name : ''
  if (!isAnalyticsEventName(name)) return null
  const parsed = EVENT_SCHEMAS[name].safeParse(body)
  return parsed.success ? parsed.data : null
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

  const event = parseEvent(parsed)
  if (!event) return new NextResponse(null, { status: 204 })

  // `console.log`, deliberately, not `error` or `warn`. These are routine and
  // high-volume; putting them in Vercel's error view would drown the lines that
  // mean something is wrong — the same reasoning that made the API-version
  // mismatch an error and the fallback catalogue an error, and this not.
  console.log('[analytics]', JSON.stringify(event))

  return new NextResponse(null, { status: 204 })
}
