# Loop State — Healthy-Jewelry

Last run: never (scaffold not yet scheduled)
Last refreshed by hand: 2026-08-01

## High Priority (loop is acting or waiting on human)

- [ ] VERCEL-ENV — 4 of 8 Vercel env vars confirmed set in Production as of
  2026-08-04 (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN`,
  `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_REVALIDATION_SECRET` — verified
  via `vercel env ls production` + `vercel env pull`). Still unset: Resend
  key, Upstash Redis URL+token, and the webhook secret (see SHOPIFY-WEBHOOK).
  Loop action: report only, never propose setting these yourself
  Human decision: pending
  **2026-08-04 update**: `NEXT_PUBLIC_SITE_URL` is confirmed set to
  `https://healthyjewellery.com` (double-L) — correct. DNS for the domain is
  fully delegated to Vercel nameservers (no split authority with Shopify);
  the only Shopify-owned record is the `checkout` CNAME to
  `shops.myshopify.com`, which is the expected shape for this headless
  architecture, not a conflict.
- [ ] SHOPIFY-WEBHOOK — still 0 webhook subscriptions on the store, confirmed
  live 2026-08-05. `orders/create` and `orders/paid` must point at
  `https://healthyjewellery.com/api/webhooks/shopify`. Cannot be automated from
  an agent session: the Shopify MCP server blocks `webhookSubscriptionCreate`
  by policy, since webhook creation routes store data to an external host. Must
  be done by hand in Settings → Notifications → Webhooks, and the resulting
  signing secret set as `SHOPIFY_WEBHOOK_SECRET` in Vercel.
  Loop action: report only
  Human decision: pending
- [ ] VISUAL-QA-LIVE — visual QA and the checkout redirect to a real Shopify URL
  still need checking against the deployed Vercel URL from a normal browser.
  Automated coverage now exists for the rest (see Testing baseline), but the
  sandboxed sessions that produced it cannot reach the Vercel hosts.
  Loop action: report only
  Human decision: pending
- [ ] SHOPIFY-PAYMENTS — `shop.paymentSettings.supportedDigitalWallets` is empty
  on `y0k9ve-q1.myshopify.com`. That may only mean no wallets are enabled, but
  confirm an actual payment provider is active in Settings → Payments before
  the first real order: a store with none accepts a checkout and then cannot
  take money.
  Loop action: report only
  Human decision: pending
- [ ] SHOPIFY-SPEC-METAFIELD — product specs ("2 mm · 1.8 g") now read from the
  `custom.spec` metafield, which no product has set. The detail page hides the
  line when empty rather than rendering a blank one, so this is cosmetic, not
  broken. Deliberately not auto-populated: specs are physical measurements and
  inventing them would put fabricated product claims on a store.
  Loop action: report only
  Human decision: pending

## Watch List

- **Branch coordination (2026-08-05)**: `integrate/shopify-transactions`
  (worktree `.claude/worktrees/agent-ab8803cce02d5162f`) is mid-merge with 28
  unresolved conflicts as of this note — active work, not touched here. It
  branched from `origin/main` at `f3de8d2` (PR #13), which predates PR #14
  (`chore/audit-docs-and-gaps` → domain-drift fix, `src/config/site.ts` and
  ~20 consumers). Three files are live conflicts *there* and also touched by
  #14: `e2e/checkout.spec.ts`, `e2e/contact.spec.ts`,
  `src/components/seo/JsonLd.tsx`. Once #14 merges, that branch should
  rebase/merge `main` — resolving those three conflicts against pre-#14
  content would silently reintroduce the single-L domain in JSON-LD and the
  e2e specs.

## Resolved

- [x] SHOPIFY-HEADLESS-PUBLISH — resolved 2026-08-05. **The blocker no code
  change or env var could work around.** The store had 22 products published to
  Online Store and **0 to the headless channel** ("Healthy Jewellery Store",
  `gid://shopify/Publication/193327071310`, an AppCatalog named "…for My Store 2
  Headless"). A Storefront API token only sees products published to its own
  app's publication, so every query returned an empty catalogue, `getProducts()`
  fell back to the static USD data, and its placeholder variant IDs made
  `cartCreate` fail. This is why the live site showed "Dome Ring · 112.00" — a
  product that does not exist in Shopify — while the env vars were already set
  correctly in Vercel Production. All 22 products and all 6 collections
  published via `publishablePublish`; verified 22/22 on the headless
  publication.
- [x] SHOPIFY-INVENTORY — resolved 2026-08-05. All 38 variants were
  `inventoryQuantity: 0`, `tracked: true`, `inventoryPolicy: DENY` →
  `availableForSale: false`. A fully-configured store would still have sold
  nothing, correctly showing "Sold Out" everywhere (PR #13's UI working as
  intended). Set `inventoryItem.tracked: false` on all 38 — made-to-order, no
  counts to maintain. Verified 38/38 now `availableForSale: true`.
- [x] SHOPIFY-CURRENCY — resolved 2026-08-05. The store is **VND**, confirmed
  live (`y0k9ve-q1.myshopify.com`, Basic plan, Vietnam, money format
  `{{amount_no_decimals_with_comma_separator}}₫`). So the PR #12 currency work
  was not hypothetical — it is load-bearing for this store. `formatPrice` now
  also picks the locale from the currency (`vi-VN` for VND), so the site writes
  `1.450.000 ₫` the way Shopify's own checkout does instead of `₫1,450,000`.
- [x] SHOPIFY-SVG-TAGS — resolved 2026-08-05, and it was worse than recorded.
  All 22 live products *do* carry `svg:` tags, but nine name shapes
  `HJSvgType` never contained (`ring-halo`, `ring-facet`, `earring-threader`,
  `bracelet-chain`, `bracelet-bead`, `charm-anchor`, `charm-star`,
  `charm-heart`) — and the mapper cast the tag straight to the type, so
  `JewelrySVG` returned `null`: nine blank tiles. Separately, `charm-classic`
  and `charm-disc` were declared in the union with **no case in JewelrySVG at
  all**, so the entire Charms collection had been rendering empty boxes since
  charms were added. Ten illustrations drawn, `default: return null` replaced
  with a self-identifying fallback, and `svg-coverage.test.ts` now walks every
  declared type.
- [x] DOMAIN-MISMATCH — resolved 2026-08-04. `healthyjewelry.com` (single-L)
  was hardcoded as the canonical domain in ~20 files (metadata, sitemap,
  `robots.txt`, JSON-LD, CI defaults, and every contact/legal email:
  `hello@`, `support@`, `privacy@`, `legal@`, `contact@`). That domain is not
  owned by this brand — its nameservers are `ns1/ns2.afternic.com` (GoDaddy's
  resale marketplace) and it carries an explicit null MX record (RFC 7505),
  so every one of those mailto links has been bouncing mail silently. The
  live, owned, Vercel-deployed domain is `healthyjewellery.com` (double-L),
  confirmed via Mat Bao's registrar panel, Vercel's authoritative NS
  delegation, a live HTTP 200 with real page content, and this repo's own
  README (`instagram.com/healthyjewellery`). Fixed at the source
  (`src/config/site.ts`: `SITE_URL`, `SOCIAL_LINKS`, `CONTACT_EMAIL`,
  `SUPPORT_EMAIL`, plus new `PRIVACY_EMAIL` / `LEGAL_EMAIL` / `SENDER_EMAIL` /
  `SITE_DOMAIN`), with every consumer refactored to import rather than
  retype, a build-time guard that throws if the env var ever regresses to the
  wrong domain, `src/tests/unit/domain-consistency.test.ts` re-scanning the
  whole tree every CI run, and an ESLint rule
  (`eslint-rules/no-hardcoded-domain.js`) that fails `pnpm lint` on any new
  hardcoded literal outside `config/site.ts`. Separately: `.env.local.example`
  had carried a *third* spelling (`healthyjewelry.vn`) — also corrected.
- [x] MAIN-CI-FAILING — resolved 2026-08-01. `main`'s CI had failed on every
  push since 2026-06-29. PR #9 found the cause was not one bug but a suite that
  had never passed: 24.2 min, 24 failures, of which 10 were specs describing
  behaviour the app no longer had and 2 were real defects live on the site.
  PR #10 then cached the fixed overhead. `main` is green as of `07a6986` and
  `74b0a3a`.
- [x] CLAUDE-MD-COLLECTIONS — resolved. PR #7 updated `CLAUDE.md` to 5
  collections / 17 products after PR #4 merged.
- [x] SECURITY-2026-06-30 — both findings in
  `.gstack/security-reports/2026-06-30-security.json` are fixed on `main`: the
  contact route now uses `@upstash/ratelimit` with a Redis backend, and the
  fallback log line is `'[contact] Inquiry received'` with no PII.

## Testing baseline

As of 2026-08-05: **588 unit tests** across 31 files, **294 E2E tests** in 11
spec files (homepage, navigation, legal-pages, shop, product-detail, cart,
contact, checkout, a11y, visual-assets, hero-legibility). E2E runs in ~3 min
against a production build across two projects (chromium + mobile).

Report a *shrinking* count as a finding; a growing one is not itself news.

## Architecture / design decisions

See this repo's `CLAUDE.md` for the T4 design system, brand prohibitions, and
architecture principles, and `docs/testing-strategy.md` for what each test layer
covers and why. This loop appends new decisions it observes below; it does not
duplicate those files.

- **2026-07-28**: PR split — one session's work was split because bundling it
  violated this scaffold's own `maxFiles: 10` / one-fix-per-run rule:
  `euro-summer-visual-assets` (PR #4, merged) and
  `chore/loop-engineering-scaffold` (PR #5, this branch).
- **2026-08-01**: CI became a gate rather than a notification. Two jobs:
  `verify` (~2 min — lint, type-check, unit, build) is the merge gate and hands
  its `.next` artifact to `e2e`, so the build is paid for once and E2E validates
  exactly what the gate approved. `main` requires both.
- **2026-08-01**: Two guardrails encode lessons that cost real defects.
  `e2e/visual-assets.spec.ts` — presence is not visibility (the collection tiles
  shipped present, requested successfully, and invisible at `opacity: 0.12`).
  `e2e/hero-legibility.spec.ts` — visibility is not legibility; it samples
  rendered pixels behind text across six widths, because axe reports
  *incomplete* rather than *violation* when the backdrop is an image.
- **2026-08-02**: Checkout failures are typed and visible instead of swallowed.
  `CheckoutError` distinguishes `not-configured` / `placeholder-catalog` /
  `network` / `shopify-error`, retry is offered only where retrying can work,
  and the cart drawer surfaces the error inline rather than punting to
  `/checkout` to fail a second time. The site sends no order confirmation on
  purpose — Shopify's own email is the confirmation.
- **2026-08-02**: Prices carry `HJProduct.currencyCode` end to end. Ten
  surfaces hardcoded USD, including the homepage strips, which printed a raw
  `$` and never called `formatPrice` at all.
  `src/tests/unit/currency-consistency.test.tsx` guards both the rendered
  output and the source, because a rule that only checked formatter arguments
  would have missed six of them. Third guardrail in the same shape as
  visual-assets and hero-legibility: the rule is enforced, not just fixed.
- **2026-08-05**: Shopify tag parsing extracted to `src/lib/shopify/tags.ts`
  and tested against tag arrays captured verbatim from the live store. The
  general lesson, and the reason the previous tests could not have caught it:
  *a fixture written in your own vocabulary asserts only that you agree with
  yourself.* `material:steel` mismatched `surgical-steel` on all 22 products
  and every existing test passed throughout.
- **2026-08-05**: `HJ_SVG_TYPES` became a runtime array with `HJSvgType`
  derived from it, so tests can enumerate the union. `JewelrySVG` no longer
  returns `null` for anything — the `default` branch draws a mark that
  identifies itself, which is what lets `svg-coverage.test.ts` distinguish a
  drawn case from a silent fallback. Fourth guardrail in the family.
- **2026-08-02**: `src/lib/shopify/env-check.ts` warns at build time when
  Shopify configuration is missing, naming the build-time `NEXT_PUBLIC_*`
  inlining and per-environment scoping traps explicitly. It warns rather than
  throws — the static-fallback catalog is the reason the site builds without
  Shopify, and a throw would break the architecture the check exists to
  protect. See `docs/testing-strategy.md`.

## Dedupe ledger

<!-- Loop appends "already reported on <date>: <finding>" here so the same
     finding is not re-surfaced every run. -->

## Run history / token spend

<!-- Loop appends a one-line summary per run: date, tokens, outcome. Full
     detail lives in loop-run-log.md; this is the human-readable index. -->

---
Run log: see loop-run-log.md
