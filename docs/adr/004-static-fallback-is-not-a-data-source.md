# 004 — The static catalogue is a fallback, never a source

## Context

`src/lib/data/hj-data.ts` exists so the site builds and serves without Shopify. That is
load-bearing: `src/lib/shopify/env-check.ts` warns rather than throws specifically to
protect it, because a hard failure would break the architecture the check exists to guard.

It also caused, or hid, every significant defect this project has shipped:

- **22 products published to Online Store and 0 to the headless channel.** The Storefront
  token saw an empty catalogue, every fetch fell back, and the live site showed "Dome Ring
  · 112.00" — a product that does not exist in Shopify — while the env vars were correct.
- **Five data-mapping defects (D1–D5)** sat undetected behind the fallback, ready to go
  live the moment real products started flowing.
- **20 of 22 products served `<title>Product Not Found</title>`.** `generateMetadata` read
  the static catalogue while the page body read Shopify, and the two catalogues overlap by
  only 2 of 22 handles.
- **Site search could not find a single real product**, for the same reason.
- **The homepage illustrated collections with products that do not exist in them**, because
  a client component read `getProductsByCollection` out of the fixture.

## Decision

The static catalogue is reachable **only from behind `@/lib/shopify`**. Every fetcher there
degrades to it on `not-configured` and `fetch-failed`, so nothing else ever needs to import
it. A module reaching past that door is not "using the fallback"; it is bypassing Shopify
permanently, on every request, in production.

`getProduct` is the one exception to `empty-response`, deliberately: a configured, reachable
Shopify answering `product: null` for a single handle is not a platform failure, it is
Shopify's authoritative statement that the handle does not exist. Falling back there would
serve a fabricated, indexable product page — wrong title, wrong price, a GID Shopify never
issued. `isPlaceholderVariantId` catches that id before checkout, so the harm is not a silent
checkout failure; it is a customer or search engine trusting a page that lies.
`getProducts`, `getProductsByCollection`, `getBestsellers` and `getNewArrivals` still degrade
on `empty-response`, because an empty *list* is a legitimate catalog state (a collection
between restocks, a quiet new-arrivals window) with no equivalent fabricated-page risk — there
is no single wrong product being sold, only a thinner shelf. See the doc comment on
`getProduct` in `src/lib/shopify/index.ts` for the full reasoning.

`src/tests/unit/metadata-data-source.test.ts` enforces this across all of `src/`, exempting
only `lib/data` (the fallback itself), `lib/shopify` (the legitimate consumer) and tests.

## Consequences

**The general lesson, and the reason none of this was caught:** *a fallback indistinguishable
from the real thing in every test environment is indistinguishable from a bug.* Unit tests
run with no Shopify credentials; E2E runs against `placeholder.myshopify.com`. Both are
exactly the conditions under which the two sources return the same data. The defect is only
observable where the catalogues differ — which is production.

Hence two responses, not one:

- the hermetic rule above, which makes the mistake unexpressible; and
- `scripts/verify-production.mjs`, which asserts the same properties against a
  **Shopify-only handle** on the live deployment, because that is the only place the two
  sources can disagree.

The first version of the guardrail walked only `src/app/` and therefore could not see
`components/home/CollectionGrid.tsx`. A guardrail that covers most of the surface area is one
you trust more than it deserves.

Referenced by: `src/lib/shopify/index.ts`, `src/tests/unit/metadata-data-source.test.ts`,
`scripts/verify-production.mjs`, `docs/testing-strategy.md`, `STATE.md`.
