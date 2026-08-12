# Changelog

Dated record of what shipped, derived from PR and commit history. Newest first.
Not every commit is listed — see `git log` for full detail; this tracks
user-visible or architecturally significant changes.

## 2026-08-12 — PR #19: The triangle, decoded

A full-scope diagnostic of GitHub → Vercel → Shopify, run against the **live
store** through the Admin API rather than reasoned from the codebase, plus fixes
for everything it found.

- **The pinned Shopify API version had been retired for ~7 months.** `2025-01`
  stopped being served around 2026-01, and Shopify does not reject a retired
  version — it *falls forward*, answering with the oldest accessible one, HTTP
  200, with nothing in the body to say so. Every check in `verify-production.mjs`
  passed throughout, because every check asked about *data* and none asked which
  API produced it. The evidence was on every response the whole time:
  `X-Shopify-API-Version`, read by nothing. Now `2026-07`, asserted rather than
  declared ([ADR 009](docs/adr/009-api-version-must-be-asserted-not-declared.md)).
- **A live product was mapped into a collection that hard-404s.**
  `mapShopifyProduct` cast Shopify's first collection handle without validating
  it; `arc-band-titanium` sits in the built-in `frontpage` collection, returned
  first, so its breadcrumb linked to `/shop/frontpage` — a real 404 under
  `dynamicParams = false`, on the site's only `bestseller`. The project's own
  premise detector exempted `frontpage` as harmless, which is true for "has the
  collection set drifted" and false for "can a product be mapped into it".
- **The storefront could not render a product photograph at all.** No image field
  in the GraphQL fragment, none on `HJProduct`, `<JewelrySVG>` hardcoded at all
  five surfaces — a fully photographed store would have shown zero photos. Photos
  now appear the moment they are uploaded to Shopify, with the illustration as the
  fallback.
- **A deployment can now say what it is.** `/api/version`, a `<meta name="hj-build">`
  stamp, and `pnpm diagnose:deployment <url>` answer the three questions that have
  recurred across this project's entire history and were invisible from outside:
  is this a cached build with stale inlined `NEXT_PUBLIC_*` values, which Vercel
  environment is answering, and is this a frozen preview alias.
- **Analytics, consent-gated and first-party.** Seven typed events. Headless is why
  it matters: Shopify's own analytics sees the hosted checkout only, so conversion
  rate was uncomputable. `checkout_failed` carries the typed `CheckoutError`, so
  the banner this project keeps rediscovering is finally a number.
- Removed a dead, stale `hjCollections[].count`; reported tags no code reads
  (`collection:spectrum`, on five products); reported homepage strips with too few
  products to be strips.
- **[docs/headless-launch-inventory.md](docs/headless-launch-inventory.md)** — every
  component of a headless launch marked present / missing / unknown, with evidence
  from the live store. Six things stand between this store and a sale; only two
  were code, and both are now done.

## 2026-08-02 — PR #12: Checkout actually reaches Shopify

Placing an order produced nothing — no confirmation, no payment step. Six
independent breaks, found by tracing end to end rather than guessing:

- Static catalog shipped placeholder variant IDs (`gid://shopify/ProductVariant/hj-001-default`)
  that Shopify's real `cartCreate` always rejects. Now fails fast with a named
  error (`src/lib/shopify/variant-id.ts`).
- `syncWithShopify` swallowed an empty store domain into `console.warn`. Now a
  typed `CheckoutError` (`not-configured` / `placeholder-catalog` / `network` /
  `shopify-error` — `src/lib/utils/checkoutMessages.ts`).
- `CartDrawer` always navigated to `/checkout` even on failure, which re-synced
  and failed again silently. Errors now surface inline with a retry offered
  only where retrying can work.
- Webhook handler only processed `products/*` and `collections/*`. Added
  `orders/create` / `orders/paid` logging (no PII — see `docs/webhooks.md`).
- `/checkout`'s hydration check ran before the Zustand cart store rehydrated,
  bouncing every visitor to `/cart` regardless of bag contents. Gated on
  `hasHydrated`.
- Prices were hardcoded to USD across ten surfaces, including the homepage
  strips (which never called `formatPrice` at all). `HJProduct.currencyCode`
  now carries end to end from `priceRange.minVariantPrice.currencyCode`.

Guardrail tests added: `src/tests/unit/currency-consistency.test.tsx` (checks
both rendered output and source — no file outside the formatter may pass a
currency literal), `src/lib/shopify/env-check.ts` +
`shopify-env-check.test.ts` (build-time warning naming the two Vercel
env-var traps explicitly).

## 2026-08-01 — PR #11: Stop synthesised font weights

Nine pages requested Barlow Condensed weight 700, which isn't loaded — the
browser synthesised a fake bold that visually clashed with the homepage's
real weight 500. Fixed across the site; guarded by
`src/tests/unit/typography-weights.test.ts`.

## 2026-08-01 — PR #10: CI performance

Playwright browser install and the Next.js build cache are now cached between
CI runs.

## 2026-08-01 — PR #9: CI became a real gate

`main`'s CI had been failing on every push since 2026-06-29 — 24.2 minutes,
24 failures, none of them actually blocking merges because nothing enforced
the result. Of the 24: 10 described behavior the app no longer had, 2 were
real live defects (dead search button, WCAG AA contrast failure on
`MaterialsSection`), the rest were flaky/misconfigured. CI now runs `verify`
(lint, type-check, unit, build, ~2 min) as the merge gate, then hands its
`.next` artifact to `e2e` (Playwright, ~3 min) so the build is paid for once.

## 2026-07-31 — PR #8: Collections visibility + checkout hardening

Collection tiles were present in the DOM, requested successfully, and
invisible (`opacity: 0.12`) — presence isn't visibility. Also closed a
query-smuggling hole in the Shopify cart proxy.

## 2026-07-28 — PR #7: CLAUDE.md sync

Documentation updated for the Charms collection (5th collection, 17 products)
after PR #4 added it.

## 2026-07-28 — PR #5: Loop-engineering scaffold

Added `.claude/agents/`, gate config, and state-tracking scaffold for
autonomous-loop workflows on this repo.

## 2026-07-28 — PR #4: Euro Summer visual assets

Wired real hero/collection/materials photography, added the Charms
collection.

## 2026-06-29 — PR #3: Shopify ground-truth fixes

Webhook auth, 324 unit tests, first full E2E suite.

## 2026-06-08 — PR #2: Commercial readiness patch

All 5 critical launch blockers resolved.

## 2026-05-02 — PR #1: Project scaffold

`CLAUDE.md`, `README.md`, PR template, env example, CI/CD.

---

## 2026-08-02 — This change

- Restored `Breadcrumbs` as a shared component (`src/components/seo/Breadcrumbs.tsx`)
  across `/shop`, `/shop/[collection]`, and `/products/[handle]` — it existed
  once, was deleted as unreferenced dead code, and `CLAUDE.md` kept
  documenting it as present. Each page now also emits a matching
  `BreadcrumbList` JSON-LD via `breadcrumbJsonLd()`.
- `ProductCard` and `ProductDetail` now surface a "Sold Out" state and disable
  Add to Bag when every variant of a product (or the selected size) is
  unavailable. `availableForSale` was already fetched from Shopify and typed,
  but never rendered.
- Added `SHOPIFY_SETUP.md`, `docs/webhooks.md`, `docs/catalog-conventions.md`,
  this file, and `CONTRIBUTING.md` — consolidating activation/onboarding
  knowledge that was previously scattered across `STATE.md`, `env-check.ts`
  comments, and PR bodies.
