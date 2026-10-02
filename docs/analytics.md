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
  No event carries free text, so there is nothing to sanitise at this boundary. It never
  throws, and never becomes load-bearing.
- **`src/app/api/analytics/route.ts`** is the same-origin sink. It validates each event against
  **its own** strict Zod schema (`EVENT_SCHEMAS`), held to the event's type in both directions
  by the compiler, drops the whole event on any unexpected field or out-of-range value,
  rate-limits, and writes one structured log line.

## The event schema, as implemented

Three events. `ANALYTICS_EVENT_NAMES` is the runtime list and the only place to add one.

| Event | Fired from | Fields |
|---|---|---|
| `product_viewed` | `ProductDetail`, once on mount | `handle`, `collection`, `material` |
| `collection_viewed` | `/shop/[collection]`, via `TrackView` | `collection`, `productCount` |
| `search_performed` | `/search`, via `TrackView` | `resultCount`, `facets` — the collections and metals the query named, from `searchFacets()`; never the query |

What the sink accepts — anything else drops **the whole event**, because a record that is
partly forged is not partly true:

| Field | Accepted values |
|---|---|
| `handle` | a product handle the catalogue holds |
| `collection` | one of `COLLECTION_HANDLES` |
| `material` | one of `MATERIAL_HANDLES` |
| `productCount`, `resultCount` | an integer from 0 to the number of products in the catalogue |
| `facets` | a list of distinct collection or material handles |
| any field the event does not define | **rejected** — including `query`, and `value`, `currency`, `quantity`, `itemCount` and `reason`, which the sink still copied until 2026-09-25 |

**Every value a log line can hold is one the catalogue already publishes.** Until 2026-09-27
the sink's allowlist was the union of every event's fields, so a direct POST of
`product_viewed` carrying a `query` was logged with it; the query was lower-cased and cut to
64 characters, which bounded how much of a pasted email address or order number was written,
not whether it was. The search event now carries facets instead of text, so the words a
visitor types stay on the page they typed them into. Enforced by
`src/tests/unit/api-analytics-route.test.ts` (forged payloads in every field of every event,
none of which reaches the log) and `src/tests/unit/analytics.test.ts` (the gate, the names,
the range of `searchFacets`).

**Known limit:** `/search?q=…` is a URL, and the hosting platform's own request logs record
URLs. That is outside this pipeline and not something this route can change; it is recorded
in `docs/data-flow-record.md` rather than implied away.

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
how the edge cache treats it. It persists until the visitor changes it or clears the site's
data. **Changing it is as easy as giving it:** "Measurement preferences", in the footer of
every page and on `/privacy`, reopens the same banner showing the current answer
(`CONSENT_OPEN_EVENT` in `consent.ts`). `track()` reads the answer on every call, so Decline
stops the very next event. It does not delete records already written, and the privacy page
says so.
Both buttons are real buttons of equal weight, because a "reject" hidden behind a link is a
dark pattern whatever the copy says.

The banner names what is counted: which pieces and collections are viewed, and how many
results a search finds — never what is typed. A new event changes that sentence in the same
commit.

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
