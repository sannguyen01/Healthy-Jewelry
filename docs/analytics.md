# Analytics

What this website measures, what it deliberately does not, and where every record goes.
Rewritten on 2026-09-25 (WS-G). Read it before adding an event.

## What the measurement is for

This site sells nothing. `COMMERCE-ELIMINATION-CONTRACT.md` §1 gives it five jobs:
explain three metals accurately, present the geometric collection language, carry the
travel-memory story, offer low-pressure ways to continue with an ambassador, and stay
technically sound. There is no transaction at the end of a visit, so there is no funnel to
measure and no conversion rate to compute. §2 forbids conversion analytics outright.

The previous version of this document framed everything around that funnel: views as the
denominator, add-to-bag as intent, a failed checkout as "the one that started this". All
four commerce events were deleted with the commerce UI, and a funnel with no end is a
chart of how many people did not do something the site cannot offer.

What the site *can* learn is whether it is doing its five jobs for the people an
ambassador sends to it. These are **relationship-quality signals**. The honest state of
each is recorded below, including the ones nothing measures yet. A signal listed as
measured when it is not is a claim about a control ([ADR 018](adr/018-a-claim-about-a-control-is-not-a-control.md)).

| Signal | The question it answers | Source today | Status |
|---|---|---|---|
| Visits from ambassador QR links | Do encounters continue online, and from which ambassador or event? | None. No event carries an entry source, and request logs are not analytics | **Not instrumented.** Needs a consented, bounded `entry_source` field read from a link parameter, plus a privacy-page change in the same commit |
| Return visits to material pages | Does the materials explanation bring people back? | None | **Not measured, by design.** A return visit can only be recognised with a persistent identifier, and this site sets none. Aggregate page-request counts from the host are the ceiling |
| Reading depth on `/materials` and `/products/[handle]` | Is the explanation read, or opened and left? | `product_viewed` counts opens of a piece page only | **Not instrumented.** A scroll-depth or dwell signal would be a new event with bounded, non-identifying fields |
| Verified contact completions, with consent | Does the contact path work for people who try it? | `/api/contact` logs failures by `{ name, statusCode }`. Successes are not logged | **Partly.** Failures are observable. A consented, content-free completion count does not exist yet |
| Which pieces, collections and searches draw attention | What do people come to look at, and what do they fail to find? | `product_viewed`, `collection_viewed`, `search_performed` | **Measured**, with consent. The only first-party records the site keeps |
| Content quality, performance, accessibility | Is the site fit to be sent to? | CI, not visitors: axe, hero legibility, visual assets and header fit in `e2e/` | **Measured by tests**, deliberately not by watching visitors |
| Qualitative ambassador feedback | What did the conversation after the visit sound like? | People, outside this repository | **Out of scope for code.** Recorded by whoever owns the ambassador relationship |

## The shape

```
component → track(event) → consent gate → sendBeacon → POST /api/analytics → one log line
```

- **`src/lib/analytics/events.ts`** is a closed union of event names with typed payloads.
  They are not free strings, because a typo'd event name is a metric that silently does not exist.
- **`src/lib/analytics/consent.ts`** holds pure functions over a stored choice. The default is off.
- **`src/lib/analytics/index.ts`** holds `track()`: one gate, one sink, one place to change.
  It sanitises the search query at the boundary, never throws, and never becomes
  load-bearing.
- **`src/app/api/analytics/route.ts`** is the same-origin sink. It rejects any name outside the
  union, copies an allowlist of fields that is a compile-time equality with the union
  (`satisfies Record<EventField, …>`), rate-limits, and writes one structured log line.

## The event schema, as implemented

Three events. `ANALYTICS_EVENT_NAMES` is the runtime list and the only place to add one.

| Event | Fired from | Fields |
|---|---|---|
| `product_viewed` | `ProductDetail`, once on mount | `handle` (string), `collection` (string), `material` (string) |
| `collection_viewed` | `/shop/[collection]`, via `TrackView` | `collection` (string), `productCount` (number) |
| `search_performed` | `/search`, via `TrackView` | `query` (string), `resultCount` (number) |

What the sink does to each field before writing it:

| Field | Bound at the route |
|---|---|
| `handle` | string, first 128 characters, empty dropped |
| `collection`, `material` | string, first 64 characters, empty dropped |
| `productCount`, `resultCount` | finite number, otherwise dropped |
| `query` | first 64 characters (`MAX_QUERY_LENGTH`), trimmed and lower-cased. This is done at the client **and** again at the route |
| anything else | **dropped**. That includes `value`, `currency`, `quantity`, `itemCount` and `reason`, which the sink still copied until 2026-09-25 after the events that carried them were gone |

The allowlist is the union's field set, not each event's own, so a direct POST of
`product_viewed` carrying a `query` is logged with that query, sanitised. That is a known
limit. Every field is bounded, and the one free-text field is sanitised whichever event
carries it. Enforced by `src/tests/unit/analytics.test.ts` (the gate, the names and the
client-side sanitising) and `src/tests/unit/api-analytics-route.test.ts` (what reaches the
log line).

## Where a record goes, and nowhere else

**Destination: Vercel function logs.** The route calls `console.log('[analytics]',
JSON.stringify(event))`, and that line is the whole of the storage. No database, no
warehouse, no analytics vendor, no third-party script, and no pixel. Retention is whatever
the Vercel plan keeps function logs for. The repository cannot know that, and
`docs/data-flow-record.md` records it as undecided rather than guessing.

```bash
vercel logs <deployment-url> | grep '\[analytics\]'
```

Each line reads `[analytics] {json}`: one event, already validated and field-limited.

Piping events onward to a store would change this route, the privacy page and
`docs/data-flow-record.md`, all in the same commit. A destination the privacy page does
not name is a processor nobody consented to.

## Consent

**The default is off, and nothing is recorded until someone answers.**

Every ambiguous state resolves to *do not track*: unset, corrupted, hand-edited, or storage
entirely unavailable. "We could not tell" has to mean no.

The answer is **one `localStorage` entry**, `hj-analytics-consent`, holding `granted` or
`denied`. It is not a cookie, because a cookie would travel with every request and change
how the edge cache treats it. It persists until the visitor clears the site's data, which is
also, today, the only way to change the answer: the banner does not return once answered.
Both buttons are real buttons of equal weight, because a "reject" hidden behind a link is a
dark pattern whatever the copy says.

The banner names what is counted: which pieces and collections are viewed, and what is
searched for. A new event changes that sentence in the same commit.

`e2e/analytics.spec.ts` asserts, in a real browser, that nothing reaches `/api/analytics`
before an answer and nothing after Decline. It also asserts that the gate *opens* after
Allow, because a gate only ever observed saying no is not a gate.

## What is deliberately not collected

No cookies, no identifiers, no session, no user agent and no referrer in any event, and no
IP address in any event. Nothing in an event record can be joined back to a person.

The route does read the client IP, for one purpose: rate limiting. The IP is pseudonymised
before it becomes a bucket key (`src/lib/utils/rateLimit.ts`: HMAC-SHA256 under
`RATE_LIMIT_KEY_SECRET` when set, otherwise SHA-256 under a fixed, versioned prefix). It is
never written to the event. The host records request metadata, including the IP, as part of
serving any request. That is hosting, not analytics, and the privacy page names it as such.

## Why first-party, and no vendor tag

There is nothing to load, nothing that can block rendering, nothing an extension can break,
and nothing leaving the origin the visitor is already talking to. The client posts to
`/api/analytics`, and that route decides where the event goes, so the destination can change
without touching the browser. That includes deciding that events go nowhere.
