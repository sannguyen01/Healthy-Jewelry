# Failure modes

Every way this storefront is designed to degrade, what a customer sees when it does, and
what would notice.

## Why this file exists, and why it is not prose

Three of the four review sections that produced it found the same shape: a failure the
code handled correctly and reported to nobody. `getProducts` served the bundled catalogue
on a `TypeError` and logged nothing. `/api/health` announced *"Rate limits are failing
open"* while all three limiters were failing 500 at the till. The OAuth nonce was
generated, sent, and compared against nothing, under a comment saying it bound the ID
token. None of those were bugs of ignorance — each sat next to a comment describing what
should happen.

What was missing was a single place where the set of failure modes is enumerated, so that
adding one without deciding how it surfaces is a visible act rather than an omission.

**It is machine-reconciled.** `src/tests/unit/failure-mode-registry.test.ts` reads the
union types below out of their own source through the TypeScript AST and holds them
against this table in both directions. A variant added to `FallbackReason` and not
documented here fails the gate; a row here naming a variant that no longer exists fails
it too. There is no third option, which is the rule
[ADR 019](adr/019-an-unclassified-entry-is-an-unverified-one.md) applies to every other
enumeration in this repository, and the reason `--sage` could not have shipped as
unclassified text a second time.

A registry nobody can check is [ADR 018](adr/018-a-claim-about-a-control-is-not-a-control.md)'s
shape — a claim about a control, written where a control should be — and a failure-mode
document is the most tempting possible place to make that mistake, because it reads as
diligence either way.

## Reading the table

`detected by` names what turns the mode from a silent state into an observable one — a log
line, a status code, a returned value a caller must handle. `covered by` names the test
that would fail if the handling broke. A mode with no `covered by` is not permitted.

---

## Catalogue reads — no failure mode left to enumerate

**This section held a six-row table for `FallbackReason` in `src/lib/shopify/index.ts`, and
both the type and the file are gone.** WS-4c removed the Shopify read path;
[ADR 034](adr/034-the-catalogue-is-the-source.md) makes `src/content/catalog/**` the source
and `src/lib/catalog/**` its only reader.

The rows are not moved or rewritten, because every one of them described a *degradation*
and degradation is no longer possible here. They were, as prose rather than as a table —
`failure-mode-registry.test.ts` reads every table row in this file as a live claim and
requires each to name a test that exists, and none of these tests exists any more:

- **`not-configured`** — `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` or the storefront token was
  absent; the customer got the bundled catalogue.
- **`empty-response`** — Shopify answered successfully with zero products; the bundled
  catalogue.
- **`fetch-failed`** — a `ShopifyFetchError`: network, non-2xx, GraphQL errors, or a retired
  API version; the bundled catalogue.
- **`collection-not-found`** — the handle matched no Shopify collection, through handle
  drift between the router and Shopify Admin; that collection's bundled products.
- **`malformed-response`** — a 200 carrying neither `data` nor `errors`; the bundled
  catalogue.
- **`pagination-stalled`** — `hasNextPage: true` with no edges, or a cursor the server did
  not advance; whatever had been collected before the stall.

Each was a *remote read* that could answer wrongly and be papered over with local data, and
the paper was the problem: an unconfigured deployment rendered every page, returned 200
everywhere, and looked completely healthy right up until somebody tried to buy something
Shopify had never heard of. Two of the six — `malformed-response` and `pagination-stalled` —
did not exist before 2026-09-18 and were found by looking, not by failing.

There is no remote read now. `getAllProducts()` returns an array that was validated against
its Zod schema when the module loaded, in the same process, from files in this repository.
The failure mode that replaces all six is **a malformed record**, and it is not a degradation
at all: it throws, and `next.config.ts` imports the reader so that the throw happens once per
build, before a single page is generated. A build that would serve a catalogue with a hole in
it does not complete. Covered by `catalog-schema.test.ts` and `catalog-content.test.ts`.

The blank this leaves is deliberate and is the honest shape: a table row saying "the
catalogue cannot fail" would be a claim about a control where no control exists, which is
[ADR 018](adr/018-a-claim-about-a-control-is-not-a-control.md) exactly.

## Rate limiting — `RateLimitFailurePosture` and `RateLimiterHealth` (`src/lib/utils/rateLimit.ts`)

Two enumerations for two questions that must never be answered by the same code path.
*"Should I refuse this request?"* runs on the request path, must never throw, and resolves
to a declared posture. *"Is the limiter reachable?"* is diagnostic and must never lie.
Collapsing them is what produced a health endpoint reading its answer out of an exception
thrown by the request path.

| mode | meaning | effect | covered by |
|---|---|---|---|
| `allow` | posture for `/api/shopify`, `/api/analytics`, `/api/health` | an unreachable limiter lets traffic through; losing the ceiling costs quota, refusing would cost checkout | `rateLimit.test.ts` |
| `deny` | posture for `/api/contact` | an unreachable limiter refuses; an unmetered form spends money on a paid email API | `rateLimit.test.ts` |
| `ok` | Upstash answered a diagnostic round-trip | `/api/health` reports healthy | `rateLimit.test.ts`, `api-health-route.test.ts` |
| `unreachable` | Upstash is configured and did not answer | `/api/health` 503 with a hint naming each route's posture | `rateLimit.test.ts`, `api-health-route.test.ts` |
| `not-configured` | no Upstash credentials; the in-memory fallback is in use | `/api/health` 503 — the fallback works perfectly and is still degraded, because per-instance counting on Vercel means the effective limit is `limit × instances` | `rateLimit.test.ts` |

## Request bodies — `BoundedFailure` (`src/lib/http/readBoundedBody.ts`)

| mode | meaning | response | covered by |
|---|---|---|---|
| `too-large` | the body passed its byte budget, or declared that it would | 413 | `readBoundedBody.test.ts`, `webhook-body-bounds.test.ts` |
| `unreadable` | the transport failed mid-stream | 400 | `readBoundedBody.test.ts` |

Kept distinct on purpose: one is a client sending more than it may, the other is a network
that failed. Collapsing them tells an operator a caller misbehaved when the network did.

## Failure modes with no enumeration

Not every degradation has a type. These are recorded here because the reconciliation test
cannot find them, which makes them the ones most likely to be forgotten.

| mode | detected by | covered by |
|---|---|---|
| A cached build serving stale `NEXT_PUBLIC_*` values | `/api/version`'s `bundleIsStale` — two fingerprints, one inlined at build time and one computed at request time | `api-version-route.test.ts` |
| A webhook payload with no usable handle, so only the listing pages are invalidated | `console.warn` naming the topic and what stayed stale | `webhook-body-bounds.test.ts` |
| A limiter sharing a Redis prefix with another, silently merging their budgets | an AST scan of every `createRateLimiter` call — invisible at runtime, because the in-memory fallback ignores the prefix entirely | `rate-limit-prefix-uniqueness.test.ts` |
| A sentinel whose mutation can no longer be applied, or whose baseline is red | `scripts/probe-assertion-liveness.mjs`, which now exits non-zero when *nothing* could be evaluated | `probe-liveness-decision.test.ts` |
| The unit suite measuring different branches locally than in the merge gate, because a config module's `process.env` fallbacks depend on the ambient environment | `vitest.config.ts`'s `test.env`, reconciled against `ci.yml` | `vitest-env-contract.test.ts`, `config-env-branches.test.ts` |

A row left this table on 2026-09-20: *`getProducts` stopping at a budget with more products
available*, covered by `shopify-pagination.test.ts`. Both the fetcher and its spec were
deleted with the Shopify read path. It is named here rather than silently dropped, for the
same reason `e2e/COVERAGE.md` keeps its two wrong exceptions on the record: a table that
loses a row is indistinguishable from a table nobody maintains.
