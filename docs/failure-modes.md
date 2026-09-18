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

## Catalogue reads — `FallbackReason` (`src/lib/shopify/index.ts`)

The storefront falls back to the bundled catalogue rather than failing, which is correct
and is also the single reason failures here stayed invisible for so long: an unconfigured
deployment renders every page, returns 200 everywhere, and looks completely healthy right
up until somebody tries to buy something Shopify has never heard of.

| mode | what happened | customer sees | detected by | covered by |
|---|---|---|---|---|
| `not-configured` | `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` or the storefront token is absent | the bundled catalogue; checkout refuses with `not-configured` | `console.error` naming the fetcher, plus `/api/version`'s `shopify.configured` | `shopify-index.test.ts`, `api-version-route.test.ts` |
| `empty-response` | Shopify answered successfully with zero products | the bundled catalogue | `console.error` naming the fetcher | `shopify-index.test.ts` |
| `fetch-failed` | a `ShopifyFetchError` — network, non-2xx, GraphQL errors, or a retired API version | the bundled catalogue | `console.error` carrying the error message | `shopify-index.test.ts`, `shopify-pagination.test.ts` |
| `collection-not-found` | the handle matched no Shopify collection (handle drift between the router and Shopify Admin) | that collection's bundled products | `console.error` naming the handle | `shopify-index.test.ts` |
| `malformed-response` | a 200 carrying neither `data` nor `errors`, or any non-`ShopifyFetchError` throw inside the fetcher | the bundled catalogue | `console.error` naming the shape or the exception | `shopify-pagination.test.ts` |
| `pagination-stalled` | `hasNextPage: true` with no edges, or a cursor the server did not advance | whatever was collected before the stall, or the bundled catalogue | `console.error` naming the request number and the stall kind | `shopify-pagination.test.ts` |

Neither `malformed-response` nor `pagination-stalled` existed before 2026-09-18. The first
arrived as `TypeError: Cannot read properties of undefined` into a `catch` that reported
only `ShopifyFetchError`; the second did not terminate.

## Checkout — `CheckoutError` (`src/store/cart.tsx`)

Every refusal path sets one of these through `failCheckout`, never by assigning
`checkoutError` directly, so a failure cannot be shown to a customer without also being
counted.

| mode | what happened | customer sees | detected by | covered by |
|---|---|---|---|---|
| `not-configured` | the store domain was absent from the bundle at build time | "checkout is unavailable" | `failCheckout`, and `/api/version`'s `bundleIsStale` when the cause was a cached build | `checkout-errors.test.ts` |
| `placeholder-catalog` | the bag holds a variant id Shopify never issued, from the bundled catalogue | a refusal before any request is sent | `isPlaceholderVariantId` | `checkout-errors.test.ts` |
| `network` | the proxy could not reach Shopify, or answered 429/5xx | "try again" | HTTP status mapping in the store | `checkout-errors.test.ts` |
| `shopify-error` | Shopify answered but returned no cart, or `userErrors` | a refusal rather than a checkout URL | `cartCreate` userErrors logged | `checkout-errors.test.ts` |
| `lines-unavailable` | the returned cart differs from the bag in either direction | a refusal rather than a wrong basket | the bidirectional post-sync check | `cart-sync.test.ts` |

`lines-unavailable` used to be checked one way only — lines sent that did not come back.
Reordering the reconciliation to issue removals last made the *other* direction reachable:
an unremoved line is an item the customer took out of their bag and would still be charged
for, so asserting only that everything sent came back would have traded an empty cart for
an over-charged one.

## Handing a customer to Shopify — `HandoffVerdict` (`src/store/cart.tsx`)

`checkoutUrl` is persisted, so a returning visitor could otherwise be sent to a hosted
checkout built from a bag they no longer have.

| mode | meaning | customer sees | covered by |
|---|---|---|---|
| `not-synced` | no successful sync in *this* page load | the bag, and a sync before anything else | `checkout-journey.test.ts` |
| `failed` | a `checkoutError` is set | the error, not a redirect | `checkout-journey.test.ts` |
| `completed` | the order already went through | the confirmation | `checkout-journey.test.ts` |
| `no-url` | synced, but Shopify returned no checkout URL | a refusal | `checkout-journey.test.ts` |

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

## Sign-in — `IdTokenVerdict` (`src/lib/shopify/customer/oauth.ts`)

Every one of these redirects to `/account?status=failed`. The reason is named in the log
and never to the caller: distinguishing them would tell somebody probing the endpoint
which half of their attempt was wrong.

| mode | meaning | covered by |
|---|---|---|
| `malformed` | not three base64url segments, or a payload that is not a JSON object | `customer-oauth.test.ts` |
| `nonce-mismatch` | the token answers a different login attempt, or carries no nonce | `customer-oauth.test.ts`, `customer-discovery.test.ts` |
| `audience-mismatch` | the token was minted for a different client | `customer-oauth.test.ts` |
| `expired` | `exp` has passed, or is missing or non-numeric | `customer-oauth.test.ts` |

The signature is deliberately **not** verified: the token arrives on the direct
server-to-server TLS response to a client-secret authenticated request, which OIDC Core
§3.1.3.7 addresses explicitly. The boundary is stated rather than blurred.

---

## Failure modes with no enumeration

Not every degradation has a type. These are recorded here because the reconciliation test
cannot find them, which makes them the ones most likely to be forgotten.

| mode | detected by | covered by |
|---|---|---|
| A cached build serving stale `NEXT_PUBLIC_*` values | `/api/version`'s `bundleIsStale` — two fingerprints, one inlined at build time and one computed at request time | `api-version-route.test.ts` |
| A webhook payload with no usable handle, so only the listing pages are invalidated | `console.warn` naming the topic and what stayed stale | `webhook-body-bounds.test.ts` |
| `getProducts` stopping at a budget with more products available | `console.warn` naming the counts and both ceilings | `shopify-pagination.test.ts` |
| A limiter sharing a Redis prefix with another, silently merging their budgets | an AST scan of every `createRateLimiter` call — invisible at runtime, because the in-memory fallback ignores the prefix entirely | `rate-limit-prefix-uniqueness.test.ts` |
| A sentinel whose mutation can no longer be applied, or whose baseline is red | `scripts/probe-assertion-liveness.mjs`, which now exits non-zero when *nothing* could be evaluated | `probe-liveness-decision.test.ts` |
