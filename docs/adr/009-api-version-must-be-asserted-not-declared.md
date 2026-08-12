# 009 — A pinned API version must be asserted, not declared

## Context

This project pinned Shopify API version `2025-01` in two files and believed it for roughly
seven months after Shopify stopped serving it.

Shopify's [versioning schedule](https://shopify.dev/docs/api/usage/versioning) keeps each
stable version accessible for about twelve months. `2025-01` retired around January 2026.
As of 2026-08-12 the oldest accessible version is `2025-10` — `2025-07` expired on
2026-07-16.

Nothing broke visibly, because **Shopify does not reject a retired version.** It *falls
forward*: the request is answered by the oldest accessible stable version, HTTP 200, with
nothing in the response body to say a substitution happened. Every product fetch, every
cart mutation, and every webhook in that window was served by an API this code had never
been tested against.

Three things made it invisible for so long, and each is a repeat of a pattern already in
this repo:

- **Two copies of the literal, agreeing with each other.** `src/config/shopify-public.ts`
  and `scripts/verify-production.mjs` each spelled out `2025-01`, with nothing joining
  them. That is the [cache-tag](../../src/lib/shopify/cacheTags.ts) shape exactly — and it
  failed the same way. Both copies were consistent, and both were wrong. *Agreement is not
  correctness.*
- **Every check asked about data, none asked which API produced it.** `verify-production.mjs`
  verified the catalogue, the cart, the checkout URL, the metadata and the search results —
  all of which the fall-forward version answered perfectly well. A version bump is invisible
  to a check that only reads payloads.
- **The evidence was on every response the whole time and nothing read it.** Shopify returns
  `X-Shopify-API-Version` on every single response, naming the version it actually used.
  It was never inspected, anywhere.

This is [ADR 004](004-static-fallback-is-not-a-data-source.md)'s lesson in a new place: *a
substitute indistinguishable from the real thing in every test environment is
indistinguishable from a bug.*

## Decision

**A pinned API version is a claim about a remote system, so it is verified against that
system rather than trusted because it is written down.**

Four parts, none of which works alone:

1. **One copy.** `scripts/lib/api-version.mjs` owns `SHOPIFY_API_VERSION` and its published
   retirement date. `verify-production.mjs` imports it. `src/config/shopify-public.ts`
   cannot — the TypeScript and `.mjs` halves do not share a module system — so
   `api-version-contract.test.ts` asserts they are the same string, and scans
   `verify-production.mjs` for any re-declared literal.
2. **Read the header at runtime.** `reportApiVersionDrift` compares
   `X-Shopify-API-Version` against the pinned version on every Shopify response, in both
   places that talk to Shopify (`shopifyFetch` and the `/api/shopify` cart proxy). It
   `console.error`s once per distinct drift — loud enough to appear in Vercel's error view,
   deduplicated so it does not become the noise it is meant to cut through.
3. **Fail the smoke run.** `shopifyServesThePinnedApiVersion` is the first check in
   `verify-production.mjs`, because every check after it reports on whatever API Shopify
   chose to answer with. It checks Storefront *and* Admin, since this script's own
   conclusions rest on the latter.
4. **Warn before, not after.** `apiVersionPremise` reports the retirement as *drift* ninety
   days out — one full Shopify release cycle, so the next stable version already exists and
   the migration can be deliberate. An `opportunity`, never a red build, per
   [ADR 008](008-decisions-need-premise-detectors.md).

The runtime check **warns and does not throw**, matching `env-check.ts`: a fall-forward is
usually survivable, since Shopify guarantees nine months of overlap between versions, and
taking a working storefront down over a configuration lag would be the worse failure. The
blocking assertion belongs where it can fail a check without failing a customer's page.

Migrated to `2026-07`, accessible until 2027-07-16.

**The migration itself was verified, not assumed.** Every operation this project sends —
`ProductFragment` and its five queries, `CartFragment`, `GetCart`, and the four cart
mutations — was validated against the live `2026-07` Storefront schema before the version
was bumped. All pass unchanged; the only relevant deprecation in the window,
`Cart.cost.totalTaxAmount` / `totalDutyAmount` in `2025-01`, touches fields this project
never selected. Bumping a version without that pass is how a fall-forward gets traded for
an outright failure.

## Consequences

- The version exists once as a value. A second copy is a failing test, not a latent bug.
- A fall-forward is visible three ways: in the function logs within one request, in the
  smoke run within six hours, and in the premise report ninety days *before* it can happen.
- `apiVersionStatus` takes the clock as an argument, so the `expiring` and `expired`
  branches run in CI today rather than being exercised for the first time on the day they
  matter — the [ADR 002](002-cart-completion-discriminator.md) lesson about branches that
  never run locally.
- The scan for hardcoded literals strips comments first. The history of this bug is written
  in the comments of the file being scanned, and
  [a tool that reports phantoms teaches its reader to skim](../credential-inventory.md).
  The stripper has its own tests, so it cannot quietly blind the scan it serves.
- Migrating remains a real task each year: bump the constant, audit the queries against the
  new version's release notes, deploy. What changes is that the deadline announces itself.
