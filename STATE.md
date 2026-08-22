# Loop State — Healthy-Jewelry

Last run: never (scaffold not yet scheduled)
Last refreshed by hand: 2026-08-21

## Session note — 2026-08-21

Two things changed since the last hand-refresh; neither touches the eight open
items below.

**PRs #25–27 merged** (`7da26fb`, `a610503`, `8d5b488`) — a `workflow_dispatch`
input fix, a VND-capable OG-image font, and keying cart lines by variant
instead of product. None of the eight items were in scope; none closed.

**Issue #24 (`SHOPIFY-ADMIN-TOKEN-SLOT`) confirmed still open**, live via
`gh issue view 24`: created 2026-08-15, 24 comments as of this refresh, every
one the same diagnosis — `SHOPIFY_ADMIN_ACCESS_TOKEN` does not start with
`shpat_`. This is item 3 (`SHOPIFY-WEBHOOK-SECRET`)'s prerequisite becoming its
own blocker: the token was rotated once (2026-08-15) and landed in the wrong
credential slot rather than the right one — same swap `preflight-secrets.mjs`
already names, in the direction the shape rule is built to catch.

Nothing here is a code fix. The comment spam itself was: `production-smoke.yml`
was posting a new byte-identical comment every 6 hours with no comparison to
the last one. That's fixed (dedup + escalate-after-3, `human-required` label,
see [ADR 011](docs/adr/011-repeated-identical-failures-must-escalate.md)) —
the diagnosis and the fix were never the problem, the channel repeating itself
forever was.

**Still requires a human in the Shopify Admin console**: Apps and sales
channels → your custom app → API credentials → copy the token that begins
`shpat_` under **Admin API access token** (not Storefront) → GitHub → Settings
→ Environments → `production-readonly` → update `SHOPIFY_ADMIN_ACCESS_TOKEN` →
re-run `production-smoke.yml` via `workflow_dispatch` to confirm it closes.

## Live verification — 2026-08-08

First session with live Shopify Admin API access. Everything below was **checked
against the store**, not inferred from the diff:

| Claim | Result |
|---|---|
| Store identity | ✅ `y0k9ve-q1.myshopify.com`, VND, Basic, Vietnam |
| Money format | ✅ `{{amount_no_decimals_with_comma_separator}}₫` → `1.450.000₫` |
| Headless publish fix held | ✅ 22/22 on `Publication/193327071310` |
| Inventory fix held | ✅ all `tracksInventory: false`, all `ACTIVE` |
| Collections | ✅ 5 real (5+4+4+5+4 = 22) + `frontpage`, all published |
| App-owned webhooks | 0 — consistent with Admin-UI webhooks, **not** evidence of absence |
| **Orders placed, ever** | **0** (`ordersCount: 0`) |

**The remaining work is a chain, not a checklist:**

```
payment provider ──> an order can exist ──> a webhook can fire ──> the secret can be tested
```

Doing these out of order spends the first real transaction discovering something
the earlier steps would have reported for free. See `docs/go-live-runbook.md`.

Two constraints found this session, worth recording so they are not rediscovered:
sandboxed sessions have **no public-web egress** (Shopify Admin API works;
`healthyjewellery.com` is blocked by the proxy), which is why live checks belong
in CI runners; and `storefrontAccessTokenCreate` is **refused by the MCP safety
policy**, so the existing Vercel token must be copied rather than a second minted.

## Open items at a glance

**Every one of these is blocked on account access, not on engineering.** There is no
outstanding code work — eight items, all needing a credential, a console, or a phone.
Detail for each is in the sections below; this table is an index, deliberately not a second
copy.

| # | Item | Blocked on | Next action |
|---|---|---|---|
| 1 | [`VERCEL-TOKEN-ORPHAN`](#high-priority-loop-is-acting-or-waiting-on-human) | Vercel + GitHub settings | **Revoke the token**, delete the repo secret. Highest value: it reaches every other secret |
| 2 | `SHOPIFY-PAYMENTS` | Shopify Admin | Confirm an active provider — head of the commerce chain, blocks 3 |
| 3 | `SHOPIFY-WEBHOOK-SECRET` | Shopify Admin | `pnpm verify:webhook <url>`, then set whichever of the two secrets it names |
| 4 | `PRODUCTION-SMOKE-SECRETS` | GitHub settings | Put 5 secrets **on** the `production-readonly` environment + `SMOKE_SECRETS_SOURCE=environment` |
| 5 | `UPSTASH-REDIS` | Vercel | Two vars, Production **and** Preview; confirm with `curl /api/health` |
| 6 | `VERCEL-ENV` | Vercel | Remaining env vars |
| 7 | `VISUAL-QA-LIVE` | A real phone | Mobile checkout hand-off by hand |
| 8 | `SHOPIFY-SPEC-METAFIELD` | Shopify Admin | Enter real measurements — content, not code; must not be invented |

**Three of these now watch themselves.** As of 2026-08-12 the production-smoke run evaluates
the premises these items rest on (`scripts/lib/premise-checks.mjs`), so drift opens a
`premise-drift` issue instead of waiting to be noticed:

| Item | What is watched | On drift |
|---|---|---|
| 2 `SHOPIFY-PAYMENTS` | `ordersCount`; once ≥ 1, `paymentGatewayNames` directly | Reminder **upgrades to a real assertion** the moment the first order exists |
| 8 `SHOPIFY-SPEC-METAFIELD` | Products with `custom.spec` set | Says the line is rendering and the item can close |
| — `COLLECTION-SET-DRIFT` | Shopify's collections ⊆ `hjCollections` | **Blocking** — those URLs hard-404 today (Watch List below) |
| — [ADR 005](docs/adr/005-english-only-storefront.md) | `shopLocales` is `en`-only | Opportunity — the prerequisite for revisiting has been met |

Items 1, 4, 5, 6 are settings-console state the API here cannot read; item 7 needs a human
with a phone. Those are human-only by nature, not by omission — see
[ADR 008](docs/adr/008-decisions-need-premise-detectors.md).

Two standing caveats that are not items because nothing can close them from here:

- **`production-smoke` has never executed.** Everything built to verify production is
  itself unverified against production until items 2–4 land and PR #17 merges — scheduled
  and `workflow_dispatch` triggers only fire from the default branch.
- **The credential inventory is inferred from git history**, not read from settings. The
  agent proxy blocks `/actions/secrets`, so `docs/credential-inventory.md` is a checklist
  to run against the UI, never a statement of what is configured.

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
- [ ] SHOPIFY-PAYMENTS — **the head of the chain, and therefore the real
  blocker.** `shop.paymentSettings.supportedDigitalWallets` is empty on
  `y0k9ve-q1.myshopify.com`. That alone means only that no wallets are enabled,
  which is independent of whether a card or manual provider is — so it is not
  evidence either way. Confirm an actual provider is active in Settings →
  Payments **before** the first real order: a store with none accepts a checkout
  and then cannot take money, so the order is never created, so the webhook never
  fires, so SHOPIFY-WEBHOOK-SECRET below cannot be tested at all.
  Shopify Payments does not serve Vietnam — expect a manual method or a
  third-party gateway; do not assume it is configured.
  **Not machine-verifiable, confirmed against the live schema 2026-08-08**:
  Admin GraphQL's `PaymentSettings` exposes *only* `supportedDigitalWallets`
  (`acceptedCardBrands` / `shopifyPaymentsAccountId` are rejected as
  non-existent), and the alternative — `paymentGatewayNames` on an order —
  needs an order to exist, which is the thing this unblocks.
  **2026-08-12 — the human-only window now has an end.** `paymentsPremise` in
  `scripts/lib/premise-checks.mjs` reads `ordersCount` on every smoke run. While it is 0
  the check reports the premise as still accurate; the moment one order exists
  `paymentGatewayNames` becomes readable and the check starts asserting the gateway by
  name — and reports drift if orders exist naming *no* gateway, which is money not being
  taken. Human once, then automatic. No invented deadline, which is what a
  `TODO(2026-Q3)` here would have been.
  Loop action: report only, never propose enabling a payment provider yourself
  Human decision: pending
- [ ] SHOPIFY-WEBHOOK-SECRET — **no longer requires an order to test.** Which of
  **two different secrets** is set as `SHOPIFY_WEBHOOK_SECRET` decides everything:
  an app-created webhook signs with the app client secret; an Admin-UI webhook
  signs with the signing secret shown on the Notifications page. The wrong one
  401s every delivery, silently and forever.
  As of 2026-08-08 this is answerable for free and repeatably:
  `SHOPIFY_WEBHOOK_SECRET=... pnpm verify:webhook https://healthyjewellery.com`
  signs a synthetic `products/update` payload and reads the route's own contract
  back (200 correct · 202 correct-but-unhandled · 401 wrong secret · 503 unset).
  The old instruction — place an order and watch Vercel logs — was one-shot, cost
  money, and produced an ephemeral signal.
  **The Admin API still cannot tell you whether webhooks exist**: the
  `webhookSubscriptions` query returns only webhooks *owned by the querying app*,
  so Settings → Notifications webhooks are invisible to it and an empty result is
  not evidence of absence. Zero app-owned subscriptions were confirmed again on
  2026-08-08, which makes Admin-UI webhooks (and that page's secret) the likely
  configuration.
  Loop action: report only
  Human decision: pending
- [x] REPO-VISIBILITY-DOC — **resolved 2026-08-08.** `docs/testing-strategy.md` stated
  "The repository is **private**, so Actions minutes are billed." Both halves were wrong:
  verified via the GitHub API, `private: false`, `visibility: "public"`,
  `allow_forking: true`. The billing half was harmless; the privacy half was not — PR #17
  added five CI secrets, and anyone reasoning about their exposure from that sentence
  reached the opposite of the truth. Corrected in place *with the evidence* rather than
  silently edited. Smoke-test secrets moved to a `production-readonly` GitHub Environment;
  schedule raised to every 6h since public-repo Actions minutes are free.
  **Superseded 2026-08-10**: this entry originally said "you must create the Environment —
  a job naming one that does not exist fails at dispatch." That is false. GitHub
  auto-creates it, empty, so the environment key alone provides nothing. See
  PRODUCTION-SMOKE-SECRETS below and `docs/adr/006-controls-must-fail-loudly.md`.
- [ ] VERCEL-TOKEN-ORPHAN — **new 2026-08-10, highest-priority credential item.**
  `deploy-production.yml` used `secrets.VERCEL_TOKEN`; it was reduced to that single
  secret on 2026-06-08 (`bc53f5d`) and the workflow was **deleted** on 2026-06-29
  (`88ef686`, "remove redundant deploy workflow"). **Deleting a workflow does not delete
  its secrets** — so the token has most likely sat in this *public* repo's settings for
  ~2.5 months, unrotated, and mentioned in zero documents until now.
  Not an ordinary credential: that workflow ran `vercel pull --environment=production`,
  which downloads **every** production env var — the Storefront token, the revalidation
  secret, the webhook secret, and Upstash/Resend once set. It is a master key to every
  other secret here, and it can deploy.
  Severity stated honestly: fork PRs never receive repository secrets, and this repo has
  exactly **one collaborator** (`sannguyen01`, admin), so there is no present attacker.
  The risk is a non-expiring high-privilege credential nobody owns or rotates.
  **Action: revoke in Vercel → Account Settings → Tokens, then delete the repository
  secret.** Zero functional cost — Vercel's Git integration deploys on its own, which is
  why the workflow was called redundant. `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` are
  orphaned too but are identifiers, not credentials, and already public.
  Reproduce any time: `pnpm audit:secrets`. See `docs/credential-inventory.md`.
  Loop action: report only, never touch credentials
  Human decision: pending
- [x] SOFT-404 — **resolved 2026-08-11, and it was broader than recorded.**
  `/shop/<unknown-collection>` answered 200 as well, which the original note missed.
  **Mechanism, measured:** `notFound()` returns **200 for streamed responses** and 404 only
  for non-streamed ones, so by the time either page discovers the param is unknown the
  status line is already on the wire. Not a defect in our routes and not fixable inside
  them.
  Split by whether the param set is closed:
  · **collections** — `dynamicParams = false`. Five fixed handles, so unknown params are
    rejected *before rendering begins*: `/shop/not-a-collection` now returns a genuine
    **404** (verified against a production build), `/shop/rings` still 200.
  · **products** — set is open, so locking it would 404 any product added in Shopify until
    the next redeploy. They emit `robots: noindex, nofollow` instead (`NOT_FOUND_SEO` in
    `src/lib/seo/productSeo.ts`) — Google's remedy for a soft 404 that cannot be
    status-coded, and stronger than a robots.txt disallow, which does not prevent indexing.
  Guarded by `e2e/metadata.spec.ts` in both directions — including that a **real** product
  is *not* noindex, since a leak there would deindex the catalogue — and by
  `verify-production.mjs` against the live deployment.
  Expect a lag: Google drops already-indexed junk URLs on the next crawl, not immediately.
- [ ] UPSTASH-REDIS — `/api/shopify` is now rate-limited (2026-08-07), sharing
  `src/lib/utils/rateLimit.ts` with `/api/contact`. It is only durable across
  serverless invocations if `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` are set; without them it falls back to an
  in-memory map that counts per Lambda instance — the same single-instance
  weakness the 2026-06-30 security audit already corrected once for the contact
  route.
  **Now checkable rather than invisible (2026-08-08)**: `GET /api/health` returns
  `{ rateLimitDistributed, redis, healthy }` and answers **503** when degraded.
  It does not merely report whether the env vars are set — it spends one real
  round-trip against Redis, because a typo'd URL, a revoked token or a paused
  database all leave the flag `true` while every limit check fails open.
  `production-smoke` asserts it on a schedule.
  Set both vars in Vercel **Production and Preview** — scoping them to Production
  alone is the way this gets "fixed" and stays broken.
  Loop action: report only, never propose setting these yourself
  Human decision: pending
- [ ] PRODUCTION-SMOKE-SECRETS — `.github/workflows/production-smoke.yml` exists
  as of 2026-08-08 but cannot run until a `production-readonly` **GitHub
  Environment** exists (Settings → Environments) carrying five secrets:
  `PRODUCTION_SITE_URL`, `SHOPIFY_STORE_DOMAIN`,
  `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`,
  `SHOPIFY_WEBHOOK_SECRET`. Copy the Storefront token already working in Vercel
  rather than minting a second one — `storefrontAccessTokenCreate` is refused by
  the MCP safety policy, and a second credential is a second thing to rotate.
  Environment-scoped, not repository-scoped: this repo is **public and forkable**
  (see REPO-VISIBILITY-DOC), and repository secrets are readable by every workflow
  and everyone with write access.
  **Two corrections, 2026-08-10.** (1) An earlier note here said the workflow "fails at
  dispatch" without the environment. **Wrong, and wrong in the dangerous direction**:
  GitHub *auto-creates* a named environment with no protection rules and no secrets, and
  a job with an `environment:` key still receives *repository* secrets — so skipping the
  setup produces a **green run with zero isolation**. `scripts/preflight-secrets.mjs` now
  asserts a `SMOKE_SECRETS_SOURCE=environment` marker so the difference is observable;
  see `docs/adr/006-controls-must-fail-loudly.md`. (2) The workflow **cannot run at all
  until PR #17 merges** — scheduled and `workflow_dispatch` triggers fire only from the
  default branch, and the Actions API currently returns 404 for it. Nothing is failing;
  nothing is scheduled.
  On failure it now opens a `production-smoke` issue and closes it on recovery, because a
  non-blocking scheduled job nobody watches will rot silently.
  Loop action: report only, never propose setting these yourself
  Human decision: pending
- [ ] VISUAL-QA-LIVE — visual QA still needs a human with a browser. The checkout
  redirect *is* now machine-checked (`verify-production.mjs` asserts a real
  `cartCreate` yields a real `checkoutUrl`), but no test has opinions about
  whether the site looks right. Sandboxed sessions have no public-web egress, so
  this cannot move into an agent loop — only into CI or a human.
  **Do the mobile hand-off specifically, not desktop-and-assume-parity.** Both
  mobile-only defects this project has had — the hero crop and the invisible
  collection tiles — passed every desktop check, which is why
  `hero-legibility.spec.ts` samples six widths.
  Loop action: report only
  Human decision: pending
- [ ] SHOPIFY-SPEC-METAFIELD — **downgraded 2026-08-08: the code path now works,
  it is simply unpopulated.** The store previously had *zero metafield
  definitions of any kind*, and the Storefront API cannot read an undefined
  metafield — so `custom.spec` was structurally unreadable, not merely unset, and
  D5's read path could never have returned anything. The definition now exists
  (`gid://shopify/MetafieldDefinition/236811976782`, `custom.spec`,
  `single_line_text_field`, `storefront: PUBLIC_READ`, pinned).
  Values remain deliberately unpopulated: specs are physical measurements and
  inventing them would put fabricated product claims on a store. The detail page
  hides the line when empty rather than rendering a blank one.
  **2026-08-12**: `specMetafieldPremise` now counts products with `custom.spec` set on
  every smoke run, so the day real measurements are entered the item reports itself ready
  to close rather than staying open because nobody re-checked. The hidden-when-empty
  rendering is exactly what makes this invisible otherwise.
  Loop action: report only; never invent spec values
  Human decision: pending (enter real measurements in Admin when known)

## Decided against

- **I18N-VIETNAMESE — decided 2026-08-08, English-only.** Raised as a conversion gap: a
  Vietnam-based, VND-priced store with an entirely English UI. Checked live before
  deciding — `shopLocales` returns **`en` only** (primary, published), no unpublished
  locale exists, and the "Vietnam" market has `webPresence: null`. So the cheap path
  commonly suggested (surface existing translations via `translatableResources`) **has
  nothing to read**: this is creating content, not exposing it.
  Currency formatting is separate and already correct — `formatPrice` writes `1.450.000₫`
  the way Shopify's checkout does. Prerequisite if revisited: publish a `vi` locale and
  translate 22 products in Shopify Admin *first*; product copy must not be fabricated, the
  same rule that keeps `custom.spec` empty. See `docs/adr/005-english-only-storefront.md`.

## Watch List

- **COLLECTION-SET-DRIFT — opened 2026-08-12, holds today.** Round 5 set
  `dynamicParams = false` on `/shop/[collection]` so an unknown handle returns a true 404
  instead of an empty-but-200 page. That is correct **only while Shopify's collection set is
  a subset of `hjCollections`**. Create a sixth collection in Shopify Admin and its URL
  hard-404s — strictly worse than the soft-404 that change was made to fix, and silent.
  The risk was written into a code comment and given no detector, which is the exact
  omission [ADR 008](docs/adr/008-decisions-need-premise-detectors.md) is about; it was
  introduced by the round that fixed the soft-404 and found by scanning for the *shape* of
  items 8–10, not by anyone reviewing that change.
  Live as of 2026-08-08: Shopify has `rings, necklaces, earrings, bracelets, charms` plus
  the built-in `frontpage`; `hjCollections` has the same five. **Matches.** `frontpage` is
  exempted explicitly in `collectionSetPremise`, or the check would false-positive on day
  one — and a new detector that cries wolf immediately loses its reader.
  Not an open item: there is nothing to do while it holds. On drift the smoke run marks it
  `blocking` and opens a `premise-drift` issue naming the handles that are 404ing.
  Loop action: add the handle to `src/lib/data/hj-data.ts` and deploy, or remove the
  collection in Shopify — never widen `dynamicParams` back, which would restore the
  soft-404.
- **`integrate/shopify-transactions` — resolved as absent, 2026-08-08.** Checked
  again after a report that it risked reverting PR #16's `pendingCheckoutCartId`
  discriminator and the secret-exposure split: the branch exists in **neither the
  local clone nor origin** (only `main` and the two `claude/*` branches). There is
  nothing to gate.
  Recording the process point in case it resurfaces, because the proposed gate
  was *weaker* than what already runs: `secret-exposure.test.ts` and
  `checkout-journey.test.ts` are both part of `pnpm exec vitest run`, which the
  `verify` job runs on every PR. Treating those two files as the merge gate would
  narrow the check, not tighten it. The merge result is already gated on both,
  plus 666 other tests.
- **Stale entry, 2026-08-08**: the `integrate/shopify-transactions` note below
  describes a branch and worktree that **do not exist in this clone** — only
  `main` and the current working branch are present, and PR #14 has long since
  merged. Either the work landed, was abandoned, or lives only on another
  machine. Left in place rather than deleted because "a branch I cannot see" is
  not the same as "a branch that is gone", and deleting the warning would lose
  the conflict detail if it resurfaces. Confirm and remove.
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

As of 2026-08-08: **661 unit tests** across 36 files, **296 E2E tests** in 11
spec files (homepage, navigation, legal-pages, shop, product-detail, cart,
contact, checkout, a11y, visual-assets, hero-legibility). E2E runs in ~3 min
against a production build across two projects (chromium + mobile).

Report a *shrinking* count as a finding; a growing one is not itself news.

**Both suites run entirely against `mock.myshopify.com`.** That is deliberate —
the merge gate must be hermetic — but it means neither number says anything about
the real store. Production reality is a third, non-blocking tier
(`.github/workflows/production-smoke.yml`); see `docs/testing-strategy.md`.

## Architecture / design decisions

See this repo's `CLAUDE.md` for the T4 design system, brand prohibitions, and
architecture principles, and `docs/testing-strategy.md` for what each test layer
covers and why. This loop appends new decisions it observes below; it does not
duplicate those files.

- **2026-08-13**: **A control's own reporting path is part of the control.** Both real checks
  in `production-smoke.yml` were piped through `| tee`, and GitHub's default shell is
  `bash -e` with no `pipefail` — so the pipeline reported `tee`'s exit status and neither
  check could fail. The entire third verification tier was a green tick incapable of going
  red, wired to an `if: success()` step that would have *closed* the failure issue saying
  "recovered". Run 31600442658 already published `| Webhook signing secret | success |` for
  a script that exited 2. What hid it is the sharp part: the *unpiped* preflight step failed
  for an unrelated reason, and **a workflow with one honest step and two mute ones is
  indistinguishable from a working one** — right up until the honest step passes. Third
  instance of ADR 006, and the first where the checks themselves were correct: what failed
  was the four characters carrying the verdict. See ADR 010. Corollary worth asking of any
  new control: *what would I see if this failed?* If the answer is "the same thing I see
  now", it is decoration.
- **2026-08-13**: **An alarm that does not say why sends its reader to the wrong place.**
  Issue #18 offered "a Shopify incident, an expired credential, or a configuration change".
  It was none of them — five secrets were unset and the preflight had printed exactly that,
  in the log the issue linked to. Also: a *known* unconfigured state must not alarm on a
  schedule. Three states now (unstarted / half-finished / ready), because collapsing the
  first two would make a botched setup quiet, and a botched setup is the state most easily
  mistaken for a working one.
- **2026-08-13**: **Fixing the code does not fix the prose.** `/terms` stated "Prices are
  displayed in US Dollars (USD)" while the store charges VND — the same defect the code
  carried until `HJProduct.currencyCode` was threaded end to end, surviving in a sentence
  because a sentence has no type checker. Related: Shopify's checkout had one policy of
  four and it was an unedited template whose `{{ shop_name }}` renders as "My Store 2".
  Both are the same shape — a customer-facing surface nobody re-read after the thing it
  described changed.

- **2026-08-12**: **A pinned version is a claim about someone else's system.** `2025-01`
  was written in two files and believed for roughly seven months after Shopify stopped
  serving it. Nothing errored, because a retired version *falls forward* — answered by the
  oldest accessible one, HTTP 200, with nothing in the body to say a substitution happened.
  Every check in `verify-production.mjs` passed throughout, and all of them were about
  *data*; none asked which API produced it. The evidence was on every single response the
  whole time (`X-Shopify-API-Version`) and nothing read it. Tenth guardrail in the family,
  and the first that expires on a published date rather than on someone noticing. See
  `docs/adr/009-api-version-must-be-asserted-not-declared.md`.
- **2026-08-12**: **An exemption is an assumption.** `premise-checks.mjs` exempts
  `frontpage` from the collection-set drift premise, and a test pins that exemption as
  correct. It *is* correct for the question that premise asks. It was being read as the
  broader claim that `frontpage` is harmless — while `mapShopifyProduct` cast Shopify's
  first collection handle unvalidated and mapped `arc-band-titanium` straight into it,
  producing a breadcrumb linking to `/shop/frontpage`: a hard 404 under
  `dynamicParams = false`, on the site's only `bestseller`. The one detector that ever
  looked at `frontpage` had concluded it did not matter. `collection` was also the last of
  the three mapped fields still using a cast rather than a parser; `material` and `svgType`
  were fixed in 2026-08-05 and nobody asked what else was cast.
- **2026-08-12**: **A deployment that cannot identify itself makes every diagnosis a
  guess.** Three failures recurred across this project's whole history — a cached build
  reusing stale inlined `NEXT_PUBLIC_*` values, per-environment variables, and an orphaned
  preview alias — and each was warned about *in prose*, in `env-check.ts`, the runbook and
  this file, without any of those warnings making anything observable. The fix is the
  ADR 008 move applied to deployments: `build-info.ts` fingerprints the inlined config, and
  `/api/version` recomputes the same fingerprint at request time. **The two disagreeing is
  the stale-cache detector**, and nothing else in a deployment reveals it.
- **2026-08-12**: **Half-built plumbing is a tell.** `next.config.ts` allowlisted
  `cdn.shopify.com` and `CART_FRAGMENT` already fetched `images`, while `PRODUCT_FRAGMENT`
  requested no image field and `HJProduct` had nowhere to put one — so the bag could show a
  photograph the product page structurally could not, and a fully photographed store would
  have rendered zero photos. When two halves of a mechanism exist and the middle does not,
  the middle was never finished, not deliberately omitted.
- **2026-08-12**: **The most valuable thing found in the live store was not code.**
  `shop.name` is "My Store 2" — Shopify's default — and that is what a customer sees at the
  hosted checkout, the one page in the purchase journey this repository does not control.
  No test could ever have caught it: the storefront never reads `shop.name`, so no page
  renders it. Third-tier verification exists for exactly this class, and it took querying
  the live store rather than reading the repository to see it.

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
- **2026-08-07**: The purchase journey has an ending. Shopify deletes a cart on
  order creation and exposes no completion flag (documented verbatim in
  `docs/testing-strategy.md`), so a completed order and an expired cart look
  identical. Both were collapsed into "rebuild the cart" — a customer who had
  paid returned to a bag still holding what they bought, with a live Checkout
  button. `pendingCheckoutCartId` is the discriminator; the *expiry* half is
  guarded as carefully as the order half, because the obvious fix breaks it.
- **2026-08-07**: Shopify is authoritative for money. The bag persisted prices
  in `localStorage` with no expiry and totalled from those; `CART_FRAGMENT` had
  been fetching `cost.totalAmount` all along and the payload type discarded it.
  Third time this project shipped a price nothing guaranteed — after hardcoded
  USD and the unformatted line item.
- **2026-08-07**: Client/server config split. `config/shopify-public.ts` carries
  only browser-safe values; `config/shopify.ts` keeps the secrets and is no
  longer reachable from the client graph. Nothing had leaked (Next inlines
  non-public env vars as `undefined`), but the only test asserted
  `typeof === 'string'`, which `''` passes — covered-looking and worthless.
  `secret-exposure.test.ts` walks the real client import graph instead, and
  asserts the graph is non-empty first so a broken resolver cannot make it
  vacuously green.
- **2026-08-12**: Every guardrail here asserts *the code still does X*; none asserted *the
  premise behind X still holds*. Five decisions were resting on unwatched premises at once —
  English-only, the payments blocker, the Open Graph runtime tradeoff, the empty spec
  metafield, and `dynamicParams = false`, which **Round 5 introduced while fixing the
  soft-404 and nobody caught in review**. Each was recorded honestly, with evidence, and
  none recorded when to look again. **An assumption in prose expires silently; an
  assumption as a check expires loudly.** `scripts/lib/premise-checks.mjs` evaluates them on
  every smoke run and reports drift as an *opportunity*, never a red build — failing on
  opportunity is how the 24-minute E2E suite became noise nobody read. The evaluators are
  pure so the **drifted** branch is testable, which is the `pendingCheckoutCartId` lesson:
  the branch that never runs locally is the one that breaks. Ninth guardrail in the family,
  and the first about decisions rather than code. See
  `docs/adr/008-decisions-need-premise-detectors.md`.
- **2026-08-10**: A control whose benefit depends on manual setup must fail loudly
  without it. `environment: production-readonly` read as hardening in the YAML and two
  docs while providing nothing: GitHub auto-creates the environment empty, and a job with
  an `environment:` key still gets repository secrets, so the intended failure never
  happens and a green run is read as evidence. Second time this project shipped something
  that *looked* verified and was not — the first was a suite running entirely against
  `mock.myshopify.com`. Same shape: the artefact meant to provide confidence was
  structurally incapable of producing it, and looked identical either way.
  The test for every future control: *if the setup step never happens, does anything go
  red?* See `docs/adr/006-controls-must-fail-loudly.md`.
- **2026-08-10**: Deleting a workflow does not delete its secrets, and nothing in GitHub
  marks a secret unused. `pnpm audit:secrets` walks every version of every workflow in git
  history and classifies each reference live / pending / orphan. It guards the *false
  positive* rather than the false negative: the first grep-based pass reported a secret
  named `X` that came from a comment documenting an anti-pattern, and a tool that reports
  phantoms teaches its reader to skim. Eighth guardrail in the family.
- **2026-08-08**: Cache tags are a contract with two sides and nothing joining them.
  `getProductsByCollection` registered `collection:<handle>`; the webhook revalidated
  `collections`, which **no fetch anywhere registered**. Both failure modes at once — an
  orphan (revalidating a tag nothing registers) and a widow (registering a tag nothing
  revalidates) — so collection pages never invalidated and sat stale for the full 3600s.
  The existing test asserted `revalidateTag` was called with `'collections'`: the same
  wrong string the route used, which is why it passed throughout. A test that restates the
  implementation cannot see the implementation is wrong.
  `src/lib/shopify/cacheTags.ts` makes the drift inexpressible and
  `cache-tag-contract.test.ts` compares the two files against each other in both
  directions. Seventh guardrail in the family.
- **2026-08-08**: The catalogue guardrail only covered `src/app/`. It therefore could not
  see `components/home/CollectionGrid.tsx` reading `getProductsByCollection` out of the
  static catalogue — the exact bug it was written to prevent, one directory outside its
  reach. **A guardrail that covers most of the surface area is one you trust more than it
  deserves.** Extended to all of `src/`; `CollectionGrid` now takes resolved tiles as props
  from the server parent, because a `'use client'` component cannot await Shopify.
- **2026-08-08**: The SEO/social layer had never migrated to Shopify. The product
  page read Shopify in its body and static `hj-data` in its `generateMetadata`,
  and the two catalogues are nearly disjoint — so 20 of the 22 live products
  served `title: 'Product Not Found'` from a page that rendered perfectly. The OG
  image, `generateStaticParams` and `/search` had the same split; site search
  could not find a single product actually for sale.
  The general lesson, and the reason nothing caught it: **a fallback that is
  indistinguishable from the real thing in every test environment is
  indistinguishable from a bug.** Both suites run without Shopify credentials,
  which is precisely the condition under which both sources return the same data.
  `metadata-data-source.test.ts` now forbids reaching past `@/lib/shopify` for
  catalogue data anywhere under `src/app/`; static data is the fallback, and it is
  reachable only from behind that door. Sixth guardrail in the family.
- **2026-08-08**: `searchProducts` was the only fetcher that returned `[]` on a
  failed Shopify call instead of degrading to the static catalogue. Empty renders
  as a confident `No results for "titanium"` — telling a customer the product does
  not exist when the truth is that Shopify did not answer. Nothing noticed because
  nothing called it: the function was fully implemented, tested, and unreferenced
  until `/search` was migrated onto it.
- **2026-08-08**: A third test tier, because the first two run against a fiction.
  `ci.yml` points every unit and E2E test at `mock.myshopify.com`, so until now no
  automated test had ever touched the real store — and all three commerce outages
  this project has had (0 products on the headless publication, 38 unsellable
  variants, USD prices on a VND store) lived in exactly that blind spot. None were
  code defects a mock could catch; all three were visible from the live `/shop`
  page. `verify-production.mjs` looks at it. The discrimination is what matters:
  the static and Shopify catalogues turn out to be nearly disjoint, so
  `dome-ring-titanium` on the live page proves fallback and `meridian-cuff` proves
  a real fetch — an invariant `production-smoke-handles.test.ts` now guards,
  because a discriminator that stops discriminating keeps passing while testing
  nothing. Fifth guardrail in the family.
- **2026-08-08**: The webhook secret stopped needing a real order to test.
  `verify-webhook-secret.mjs` signs a synthetic payload and reads the route's own
  status contract back. Its test does not compare against a fixture — it feeds the
  script's bytes into the real `POST` handler and lets the route judge, so the two
  cannot drift. The old procedure (place an order, watch Vercel logs) was one-shot,
  cost money, and left no repeatable artifact.
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
