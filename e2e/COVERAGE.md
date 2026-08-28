# E2E coverage manifest

`vitest` coverage is scoped to `src/lib`, `src/store` and `src/config` on purpose, so
**E2E is the only automated coverage the UI layer has.** A route no spec navigates to is
not thinly covered — it is uncovered, and nothing about a green suite says so.

`src/tests/unit/spec-anchor-contract.test.ts` walks `src/app/**`, resolves every
`page.goto(...)` in `e2e/**` from source, and requires each route to be either visited by
a spec or listed below with the reason it is not. There is no third option, which is the
same rule [ADR 019](../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md) applies
to every other enumeration in this repository.

Adding a page with no spec now fails the fast gate until someone decides which of the two
it is. That decision used to be made by nobody, and the answer used to be "uncovered".

## Routes not exercised by E2E

Each line is `route — why not`. A route listed here that a spec *does* visit fails the
check too: a stale exception is an assertion nobody re-examined.

```coverage-exceptions
/api/health — Verified by src/tests/unit/api-health-route.test.ts against the real handler, including the Resend and Redis probes. A browser adds nothing: there is no UI.
/api/revalidate — Verified by src/tests/unit/api-revalidate-route.test.ts, which exercises the secret check and the cache-tag contract directly.
/api/version — Verified by src/tests/unit/api-version-contract.test.ts, which asserts the pinned Shopify API version against the client rather than against a fixture.
/api/sitemap — Verified by src/tests/unit/sitemap-completeness.test.ts, which renders the XML and holds it against the app router's real route list.
/api/webhooks/shopify — Verified by src/tests/unit/api-webhooks-shopify-route.test.ts and webhook-signature-contract.test.ts. Driving it from a browser would mean forging a signature in the spec, duplicating the script that already does it.
/api/search — Exercised through the /search page, which e2e/metadata.spec.ts navigates to with a query. The handler has no behaviour the page does not surface.
/api/analytics — e2e/analytics.spec.ts asserts the beacons this route receives, from the page side. The route itself is a sink; asserting it twice adds nothing.
/api/contact — e2e/contact.spec.ts intercepts it to drive the form's success, failure and 503 states, and src/tests/unit/api-contact-route.test.ts exercises the handler. Between them both sides of the contract are covered.
/api/shopify — e2e/cart.spec.ts and e2e/checkout.spec.ts intercept it to drive cart state; src/tests/unit/api-shopify-route.test.ts covers the proxy and its rate limiting.
/api/auth/logout — e2e/account.spec.ts calls it directly via request.post and asserts the session is cleared.
```

## What this manifest does not claim

That a visited route is *well* covered. `spec-anchor-contract.test.ts` proves a spec
navigates somewhere real; it cannot prove the assertions there still mean anything. That
is the fossil question, and it is answered by `scripts/probe-assertion-liveness.mjs` —
see [ADR 020](../docs/adr/020-a-test-that-cannot-fail-is-documentation.md).
