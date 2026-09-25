# Browse-only masterplan — the coordinated decommission of Shopify

> **Superseded, 2026-09-25 by [`docs/commerce-elimination-masterplan.md`](commerce-elimination-masterplan.md).**
>
> Not edited to match it. This is the plan as it stood on 2026-09-20, and its WS numbering
> (WS-0 … WS-8, ordered by phase) is *not* the successor's (WS-A … WS-I, ordered by deletion
> domain). Anyone reading a WS reference in a commit message before 2026-09-25 wants this
> file; anyone doing the work wants the other one.
>
> What the successor changes, in one line each: the boundary is now a parsed contract and a
> reconciled register rather than a plan ([ADR 036](adr/036-a-prohibition-in-prose-is-not-a-boundary.md));
> the workstreams are cut by deletion domain so they can run in parallel with disjoint file
> ownership; and the north star is stated as five responsibilities the site is measured
> against rather than as an end state.
>
> Kept rather than deleted because §2's findings are evidence — the production verification
> tier going dark and reporting success, the `www` redirect defect, the domain model moving
> house without changing shape — and each is dated, sourced and still true of the day it
> records.

The execution runbook for turning Healthy Jewellery from a headless Shopify storefront into a
browse-only catalogue hosted entirely on Vercel, with the Shopify tenancy left dormant.

This file is **the plan of record**. Where it disagrees with an older document, this one is
newer; where it disagrees with a *measurement*, the measurement wins and this file is wrong.
Every number below is dated and says how it was obtained, because
[ADR 025](adr/025-a-number-in-prose-is-a-claim.md) is blunt that a number in prose is a claim
until something reads it.

**Classification: historical by construction.** This document is deliberately *not* added to
`EXPLICIT_AGENT_DOCS`, so `doc-numeric-claims.test.ts` does not sweep it — the same treatment
`STATE.md`, `CHANGELOG.md` and the ADRs get, and for the same reason. Its figures are dated
observations of a system mid-migration, not assertions about current state, and reconciling
them against a moving tree would turn a record of what we found into a running commentary that
falsifies its own history. Saying so here rather than leaving the omission to be discovered is
[ADR 019](adr/019-an-unclassified-entry-is-an-unverified-one.md)'s rule: unexamined is not a
third state. When a figure here becomes a standing claim rather than a dated one, it moves into
`CLAUDE.md` or `docs/testing-strategy.md`, where it gets reconciled.

---

## 0. Corrections to the brief this plan replaces

The decommission brief circulated on 2026-09-19 was accurate when written and has since gone
stale in five places. Anyone using the older text as a runbook will take at least two wrong
actions, so the corrections come first.

| # | The brief said | Measured 2026-09-20 | How it was measured |
|---|---|---|---|
| 1 | PR #75 is a draft | **Merged** 2026-09-19T16:56:53Z | GitHub API, `list_pull_requests` |
| 2 | Production serves merge commit `68dd695` (the #75 merge) | `68dd695` is **two merges behind**. `main` is `7d512cb` — PR #76 merged 17:10:43Z, PR #77 merged 17:27:33Z | `git rev-parse origin/main`; GitHub API |
| 3 | Both brand hostnames are attached and correct | Both are attached; **`www` does not redirect to the apex** — it serves its own response | Issue #78, filed by `probe-canonical-domain.mjs` at 2026-09-19T20:48:06Z |
| 4 | The GitHub Environment still holds the Shopify smoke secrets | **It does not.** They were emptied between 15:35 and 20:14 UTC on 2026-09-19 | Production-smoke runs #154 and #155, step conclusions, Actions API |
| 5 | Remove `CUSTOMER_ACCOUNT_SESSION_SECRET` | The variable is named **`SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET`** | `.env.local.example`; `src/lib/shopify/customer/config.ts` |

Correction 5 is small and the most likely to cause a silent miss: a removal list that names a
variable which does not exist deletes nothing and reports success. Delete by the name the code
reads, and prove it by grepping the code rather than the list.

Correction 4 is the serious one and has its own section below.

The brief's third stated correction — that the Shopify connector is disconnected — **holds**.
`ListConnectors` reports `Shopify: needs_reconnect` as of 2026-09-20. Phase B cannot start.

---

## 1. Ground truth, as measured on 2026-09-20

### 1.1 The repository

| Fact | Value | Source |
|---|---|---|
| `origin/main` | `7d512cb` | `git rev-parse` |
| Designated work branch | `claude/shopify-decommission-l7p1s4`, identical to `main` | `git log main..HEAD` → empty |
| Lint | 0 errors, 0 warnings | `pnpm lint` |
| Type-check | clean | `pnpm type-check` |
| Unit tests | **2,594 passed, 5 skipped, 101 files** | `pnpm exec vitest run` |
| Build | exit 0, 43 routes, 17 product pages + 5 collection pages prerendered | `pnpm build` |
| Install | clean on a frozen lockfile | `pnpm install --frozen-lockfile` |

The base is sound. PR #74 repaired the duplicate-key lockfile damage and nothing has re-broken
it. This is the first time in this decommission that a plan is being written on a base that
actually installs, and that is worth saying out loud: the previous two phases were verified by
reading code, because the gate could not run.

### 1.2 The Shopify surface, measured rather than estimated

| Surface | Size | Note |
|---|---|---|
| Files mentioning `shopify` (any case) | **193** | excludes `node_modules`, `.next` |
| — of which under `src/tests/` | 61 | the largest single block, and the one most likely to be under-budgeted |
| — of which ADRs | 17 | decisions, not code; they are superseded, not deleted |
| `src/lib/shopify/**` | **2,573 LOC across 14 files** | client, queries, mutations, customer OAuth, cache tags |
| Commerce UI + routes + config | **3,693 LOC across 17 files** | cart store 967, cart drawer 527, cart page 477 |
| API routes | 11 | 7 of them Shopify-only |
| Page routes | 17 | 4 of them commerce-only |
| E2E specs | 17 files | `checkout.spec.ts` and `cart.spec.ts` are the two heaviest |

**The 61 test files are the schedule risk.** Every prior estimate of this decommission has
sized it on `src/lib/shopify/**` and the commerce UI — roughly 6,300 lines — and treated the
tests as follow-on tidying. They are not: they are 61 of the 193 touched files, they encode
the behaviour being removed, and several of them (`shopify-mapping`, `shopify-pagination`,
`cart-sync`, `checkout-journey`) are the only executable record of *why* the mapping rules
exist. Deleting them without first extracting the rules they assert into the new catalogue
schema throws away the requirements along with the implementation.

### 1.3 The controls

25 registered controls; 23 `configured`, 2 `not-configured`.

| Control | Status | What it means for this plan |
|---|---|---|
| `merge-gate` | **not-configured** | `main` is not branch-protected. Nothing is required before a merge, and a merge to `main` deploys to production. |
| `smoke-secret-isolation` | **not-configured** | the environment marker `SMOKE_SECRETS_SOURCE` is unset |
| `canonical-domain-binding` | configured | currently **reporting a failure** — issue #78 |
| the other 22 | configured | green |

`merge-gate: not-configured` is the single most important governance fact in this document and
is addressed in §4.

---

## 2. Findings this plan adds to the brief

### 2.1 The production verification tier went dark yesterday, and reported success

This is the finding that changes the plan's ordering.

| Run | Time (UTC) | Conclusion | `Live store and storefront` | `Webhook signing secret` |
|---|---|---|---|---|
| #154 | 2026-09-19 15:35 | failure | **failure** (executed) | **failure** (executed) |
| #155 | 2026-09-19 20:14 | **success** | **skipped** | **skipped** |

Run #155 is green and checked nothing.

The mechanism is documented and working exactly as designed. `scripts/preflight-secrets.mjs`
has three states. `not-configured` — *every* secret absent — exits 0, sets
`configured=false`, files no issue, and skips both real checks. Its own comment says why:
"Nobody has done the setup yet, which is a known fact rather than news, and filing an issue
about it every six hours trains the reader to mute the one channel that will later carry a
real outage."

That reasoning was correct. Its **premise** has expired. All-secrets-absent used to mean
*nobody has configured this yet*. Since 2026-09-19 it means *somebody de-configured it*, which
is the opposite kind of event and wants the opposite treatment. Between 15:35 and 20:14 the
five secrets in the `production-readonly` GitHub Environment were emptied — run #154 proves
they were present, run #155 proves they were not.

This is [ADR 008](adr/008-decisions-need-premise-detectors.md) in its purest form: a decision
whose premise is no longer true, still executing.

**Three consequences, in ascending order of seriousness.**

- Issue #24 — open since 2026-08-15, 111 comments, `human-required` — now describes a
  condition nothing can evaluate. It correctly did **not** auto-close: the "Close the failure
  issue on recovery" step was skipped, because recovery is gated on the real checks having
  run. The design is right. The issue is now a tombstone rather than a signal.
- The dark-tier alarm **was armed and 26 hours slow — and this change fixes it.**
  `assessLiveness` returned `lit` if *any* run inside a 26-hour window executed the required
  steps, and at the 20:47 control audit run #154 was still inside that window. Correct by its
  own definition; a day late. The probe now also answers *did it just stop?* — see
  [ADR 033](adr/033-a-premise-that-expired-mid-decommission.md) and WS-6 below. Driven against
  this exact history at 2026-09-20T03:15Z it returns `verdict: stopped`,
  `lastExecutedAt: 2026-09-19T15:35:16Z`, where the old rule returns `lit`. **Once this lands
  on `main`, the next control audit opens a `verification-dark` issue naming the date the tier
  stopped** — instead of a generic darkness finding after 2026-09-20 17:35.
- **The Storefront token may no longer be reachable from CI.** The decommission ledger's whole
  order of operations rests on "export first, revoke second", and the export needs that token.
  It has now been removed from at least one of the three places it lived. Whether it survives
  in Vercel and in Shopify Admin is a console question nobody in this session can answer.

**The sequencing correction that follows.** The brief's Phase E says "remove Shopify secrets
from GitHub" *after* Phase D ships. Part of that step has already happened, before Phase B.
The plan does not try to undo it — restoring a credential to un-block an export is a worse
trade than re-minting one. It records it, adds the alarm that should have caught it
(WS-6), and re-routes the export through the Shopify Admin console rather than through CI.

### 2.2 `www` is not redirected, and this is a live SEO defect

Issue #78, filed 2026-09-19T20:48:06Z by the canonical-domain probe:

> **www-not-redirected** — www.healthyjewellery.com serves its own response instead of
> redirecting to healthyjewellery.com.

One finding, not five, which tells us the apex *is* bound to production correctly. DNS
confirms the shape from outside: the apex resolves to `216.198.79.1` and `www` to
`64.29.17.65` / `216.198.79.65` — Vercel anycast in both cases, two hostnames both serving.

Two hostnames serving identical content with no canonical redirect is duplicate content. It
splits link equity, makes `SITE_URL`-derived canonical tags disagree with the URL the visitor
is on, and — specifically relevant here — means the acceptance criterion "www permanently
redirects to apex" is currently **failing**, before any decommission work has started.

This is a Vercel dashboard action, not a code change. Do **not** add a `www` redirect in
`next.config.ts`: the request must be answered before it reaches the application, and a
redirect in the app would make the platform and the code two sources of truth for one
behaviour.

### 2.3 The domain model moved house but did not change shape

PR #77 moved `src/lib/shopify/types.ts` to `src/lib/catalog/types.ts`. That was the right
first move and the PR is honest that it changed "not a field, not a name, not an export".

What it means for Phase C is easy to miss: **`src/lib/catalog/types.ts` is still the Shopify
wire format.** Its first line reads `// Healthy Jewelry — Shopify Storefront API TypeScript
types`. It exports `Money`, `edges`/`node` envelopes, `checkoutUrl`, `availableForSale`,
`compareAtPrice`, `priceRange.minVariantPrice`. Building `src/content/catalog/**` against this
type would re-import every commerce semantic the decommission exists to remove, into the
directory whose name promises they are gone.

Measured against the fifteen public-identity fields the brief requires the repository to
preserve:

| Required field | Present in `HJProduct`? | Shape today |
|---|---|---|
| handle | yes | `string` |
| title | yes | `string` |
| SKU | **no** | — |
| collection | yes | `HJCollectionHandle` |
| material | yes | `HJMaterialHandle` |
| material label | partial | derived at render, not stored |
| description | yes | `string` |
| care instructions | **no** | — |
| dimensions / specification | partial | `spec: string`, free text (`'2 mm · 1.8 g'`) |
| sizes | partial | inside `variants[].selectedOptions` — a commerce shape |
| availability statement | **no** | only `availableForSale: boolean` |
| media state | partial | `featuredImage: Image \| null`; null conflates "no photo yet" with "photo failed" |
| photo alt text | partial | `Image.altText: string \| null` |
| last reviewed date | **no** | — |
| legacy redirect mapping | **no** | — |

**Five of fifteen fields have no home at all; five more exist only in a commerce shape.** The
brief's instruction that the catalogue "must preserve the public product identity of every
exported Shopify product" is therefore not a data-copying task. It is a schema task, and the
schema does not exist yet. `src/content/` does not exist on disk.

This is why WS-3 below is sequenced to design the schema **before** the export, not after. The
export is a one-shot read against a credential we are trying to destroy; discovering a missing
field afterwards means re-minting it.

### 2.4 The Admin token has been wrong for 35 days and nothing customer-facing broke

Issue #24 has reported the same diagnosis since 2026-08-15: `SHOPIFY_ADMIN_ACCESS_TOKEN` does
not start with `shpat_` — almost certainly a Storefront token in the Admin slot.

Read as a decommission input rather than as an outage, this is *good news and evidence*. The
Admin API has been unreachable for five weeks and the storefront has continued to serve. Its
blast radius on revocation is therefore empirically, not theoretically, near zero. Of the
eight credentials in the ledger, this is the one we can revoke with the most confidence and
the least rehearsal — a 35-day production experiment already ran.

The same reading does **not** transfer to the Storefront token, which is load-bearing for
every catalogue read until the static catalogue becomes authoritative.

---

## 3. The workstream charter

Eight workstreams. Each has one owner, an explicit file ownership boundary, a definition of
done that is a check rather than an opinion, and a named blocker where one exists.

**The ownership boundary is not bureaucracy — it is the merge-correctness control.**
[ADR 031](adr/031-a-clean-merge-is-not-a-correct-merge.md) exists because two branches
independently incremented the same counter, git merged the line cleanly, and the result was
wrong. Parallel agents on one repository reproduce that failure on demand. Disjoint file
ownership is what makes concurrency safe here; where two workstreams must touch one file, the
charter names which one owns it and the other opens a request.

### WS-0 — Governance and the merge gate · **blocking, do first**

| | |
|---|---|
| Owns | `docs/controls.json`, branch-protection configuration |
| Blocked by | human console access to GitHub → Settings → Branches |
| Done when | `probe-branch-protection.mjs` reports configured and `merge-gate` flips to `configured` |

`main` is unprotected and a merge to `main` deploys to production. That is tolerable for one
careful human. It is not tolerable for a fan-out of agents opening pull requests against a
repository whose merge button is the deploy button with nothing in between.

Require `Lint · Type-check · Unit tests · Build`, `Dependency scope`, and
`E2E tests (Playwright)` — the three contexts `docs/controls.json` already names. Do **not**
require `Production smoke`: the workflow's own header explains why, and the reason is now
doubly true, because that tier is currently dark and would freeze every merge.

This is the only workstream that must complete before the others start.

### WS-1 — Canonical domain and DNS

| | |
|---|---|
| Owns | Vercel domain configuration, DNS records, `docs/dns-domain-setup.md` |
| Blocked by | Vercel dashboard access |
| Done when | issue #78 auto-closes on a control-audit run |

1. `healthyjewellery.com` → primary, assigned to Production.
2. `www.healthyjewellery.com` → permanent (308) redirect to the apex, **at Vercel**.
3. Leave `checkout.healthyjewellery.com` alone for now. It currently CNAMEs to
   `shops.myshopify.com`; it is retired in WS-7 on a deliberate clock, not here.
4. Do not move the apex or `www` to Shopify. Do not complete Shopify's "Connect existing
   domain". Do not point the apex at `23.227.38.65`.
5. Add no restrictive CAA record at the apex — a Shopify-era `ssl.com`-only CAA would break
   Vercel certificate renewal, and it breaks it silently, 60 days later, at expiry.

The done-condition is the probe closing its own issue, not a person saying it looks right.
That is the whole point of having built the probe.

### WS-2 — Catalogue export · **blocked**

| | |
|---|---|
| Owns | `/tmp` staging artefacts only — writes nothing to the repository |
| Blocked by | **Shopify connector `needs_reconnect`**; possibly also the Storefront token's survival |
| Done when | 22 products and 5 collections are staged and reconciled |

Export only the public fields enumerated in WS-3's schema. Export **nothing** from: customer
records, orders, carts, payment data, access tokens, webhook payloads, customer-account
identifiers.

Reconciliation is arithmetic and it must balance:

```
17 products in src/lib/data/hj-data.ts
+ 5 products present in Shopify and absent from the static catalogue
= 22 products in Shopify
```

Any other result **fails the migration review** and stops the phase. A delta of 4 or 6 means
one of the two inventories is wrong, and shipping a catalogue on an unexplained delta is how a
product disappears from a brand's public identity without anybody deciding it should.

Note the second blocker honestly: the export needs the Storefront token, and §2.1 establishes
that it has been removed from the GitHub Environment. If it is also gone from Vercel, the
export requires re-minting a credential in Shopify Admin — which is allowed, but it is a
human console action, it must be added to the ledger as a new row, and it must be revoked
again at the end.

### WS-3 — Catalogue schema, content layer, and the import boundary · **not blocked**

| | |
|---|---|
| Owns | `src/lib/catalog/**`, `src/content/catalog/**`, `docs/adr/033-*` |
| Blocked by | nothing — this is the largest piece of unblocked work |
| Done when | build-time validation and the AST boundary test both pass, and both can be made to fail |

This is the workstream to start today, and the reason is §2.3: the schema is the thing the
export writes into, and it does not exist. Designing it after the export inverts the
dependency.

Four deliverables.

1. **The record schema**, carrying all fifteen public-identity fields as first-class,
   non-commerce shapes. Specifically: `sizes` as a plain list, not `variants[].selectedOptions`;
   `specification` as structured dimensions rather than a display string; `availability` as a
   statement the site can honestly make (`ask-an-ambassador` by default) rather than a boolean
   inherited from an inventory system that will no longer exist.

2. **The media state as an explicit union**, not a nullable image:

   ```
   { kind: 'photo', src, alt }        — a real photograph
   { kind: 'illustration', svgType }  — the SVG is the intended presentation
   { kind: 'illustration-pending' }   — we have no photo and we say so
   ```

   `featuredImage: null` today conflates the last two, and the brief is right that converting
   "we have no photo" from an accidental absence into a declared state is a brand-honesty
   requirement, not a nicety. It is also a testability requirement: only the third state can
   be counted, and only a counted state can be burnt down.

3. **Build-time Zod validation.** Invalid content stops the build. Not a warning —
   `next.config.ts` already demonstrates the failure mode where a warning at build time
   produced a deployment that looked healthy until a customer clicked.

4. **An AST-resolved import-boundary test.** No module outside `src/lib/catalog/**` may import
   a raw product JSON file. Use `src/lib/analysis/tsAstScan.ts`, which already exists in this
   repository for exactly this class of question. **Do not write a regex.**
   [ADR 007](adr/007-regex-guardrails-have-unknown-coverage.md) records why, and the boundary
   this test protects is the one the whole plan rests on.

   The test must be shown to fail. Add a deliberate violating import, watch it go red, remove
   it. [ADR 020](adr/020-a-test-that-cannot-fail-is-documentation.md) is unambiguous that a
   test never observed failing is documentation with a green tick.

5. **ADR 033 supersedes [ADR 004](adr/004-static-fallback-is-not-a-data-source.md).** ADR 004
   says the static catalogue is a fallback reachable only from behind `@/lib/shopify`. The new
   rule inverts it: `src/content/catalog/**` is the only product data source,
   `src/lib/catalog/**` is the only runtime access layer, and no page, component, API route,
   script or test may read a raw record directly. ADR 004 is superseded rather than deleted —
   the five defects it enumerates are the reason the new boundary has to be enforced by a test
   rather than by a convention.

**Do not remove Shopify code in this workstream.** Prove the new catalogue renders the intended
browsing experience in a Vercel Preview first. The old path is the control group.

### WS-4 — Commerce removal and route retirement

| | |
|---|---|
| Owns | `src/store/`, `src/components/layout/CartDrawer.tsx`, `src/app/{cart,checkout,account}/`, `src/app/api/**`, `src/lib/shopify/**` |
| Blocked by | WS-3 shipping to Preview |
| Done when | every retired route returns its declared status code, asserted by HTTP |

Remove: Add to Bag (**already done**, PR #75), Cart Drawer, cart state, checkout UI, order
confirmation, account controls (**already done**, PR #75), customer OAuth, the Shopify API
proxy, Shopify webhooks, revalidation, product fetching, and commerce-specific analytics
events.

Retired-route contract:

| Route | Status | Rationale | Landed |
|---|---|---|---|
| `/cart` | 308 → `/shop` | a bag is now a shelf | ✅ |
| `/checkout` | 410 Gone | the capability is withdrawn, not moved | ✅ |
| `/account` | 308 → `/contact` | a person replaces the login | ✅ |
| `/api/shopify` | 404 | never a public contract | ✅ |
| `/api/auth/*` | 404 | " | ✅ |
| `/api/webhooks/shopify` | 404 | " | **held** — see below |
| `/api/revalidate` | 404 | " | **held** — the webhook calls it |

~~`/order-confirmed` | 410 Gone~~ — **this route never existed.** The table named it from the
brief; `find src/app -iname '*order*'` returns nothing and always would have. A retired-route
contract naming a route that was never served is a line nothing can satisfy and nothing can
fail, which is worse than an omission: it reads as coverage.

**Two routes are deliberately held back**, and the reason is this plan's own WS-7 sequence:
*delete the Shopify webhook subscriptions **before** removing `/api/webhooks/shopify`, or
Shopify retries against a failing route for its full backoff schedule.* Those subscriptions
can only be deleted from Shopify Admin, and the connector reads `needs_reconnect`. Removing
the endpoint first would be doing the thing this document says not to do. `/api/revalidate`
is held with it because the webhook is what calls it.

**Assert the status codes over HTTP.** A Playwright `expect(page).toHaveURL()` passes on a soft
200 that renders a "gone" message, and this repository has an ADR about precisely that family
of mistake — presence is not visibility, visibility is not reachability, and a rendered word
"Gone" is not a 410. Use `request.get(url, { maxRedirects: 0 })` and assert `.status()`.

There is no `middleware.ts` today. 410 needs a route handler; 308 can be `next.config.ts`
`redirects()` with `permanent: true`. Note that `next.config.ts` currently imports
`warnIfShopifyUnconfigured` from `src/lib/shopify/env-check` — that import is the last thing
holding `src/lib/shopify/**` in the build graph and must be removed in the same change that
deletes the directory, or the build breaks at the very end of the workstream.

### WS-5 — Commerce semantics sweep

| | |
|---|---|
| Owns | `src/components/seo/`, `src/lib/seo/`, `src/lib/utils/formatPrice.ts`, `src/app/**/opengraph-image.tsx`, legal and shipping copy |
| Blocked by | WS-3 schema |
| Done when | a repo-wide sweep for the price vocabulary returns only intentional hits, and each is listed |

Removing the price field is the easy tenth of this. Measured spread of the commerce
vocabulary across `src/` and `e2e/`:

| Token | Files |
|---|---|
| `checkout` | 57 |
| `price` | 45 |
| `currencyCode` | 35 |
| `compareAtPrice` | 26 |
| `Offer` | 17 |
| `VND` | 17 |
| `formatPrice` | 16 |
| `addToCart` | 6 |
| `availability` | 5 |
| `priceCurrency` | 2 |

Surfaces to sweep, beyond the product card: product JSON-LD `Offer` blocks, Open Graph images
(`products/[handle]/opengraph-image.tsx` renders the **price** into the share card today),
sitemap metadata, search filters and sort order, cart notices, checkout failure messages,
support `mailto:` summaries, legal pages, shipping and returns pages, analytics event names,
README and docs examples, and test fixtures.

**Keep the structured data. Remove only the commerce claims.** `JsonLd.tsx` emits `price`,
`priceCurrency`, `availability` and a purchase `url` inside an `Offer`. Strip the `Offer`
entirely and keep the `Product`:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Arc Band Titanium",
  "description": "…",
  "material": "Grade 23 titanium",
  "image": "…",
  "brand": { "@type": "Brand", "name": "Healthy Jewellery" }
}
```

A `Product` without an `Offer` is valid schema.org and is the honest description of a
catalogue you cannot buy from. A `Product` *with* an `Offer` whose `availability` is
`InStock` on a site with no checkout is a false statement to Google Shopping, and the existing
comment in `JsonLd.tsx` already notes that `availability` "still reads InStock" for want of
better information.

### WS-6 — Verification tier, re-pointed · **not blocked**

| | |
|---|---|
| Owns | `scripts/probe-smoke-liveness.mjs`, `scripts/lib/liveness.mjs`, `scripts/preflight-secrets.mjs`, `.github/workflows/production-smoke.yml` |
| Blocked by | nothing |
| Done when | a de-configuration is reported within one scheduled run, and the test proving it can be made to fail |
| Status | **both halves landed.** `stopped` verdict (ADR 033) and the browse-only smoke, reporting into the six-hourly audit. |

Two jobs.

**First, close the blindspot §2.1 found — done, in this change.** A tier that *stops* is news
at the moment it stops, not 26 hours later when the last executing run ages out of the window.
`assessLiveness` answered "is anything looking?" and returned `lit` on any executing run in the
window. It now also answers "did this just stop?": if the newest run did not execute the
required steps and an earlier in-window run did, that is a **`stopped` verdict** — distinct
from a steady-state `dark` tier and distinct from `unevaluable`, because the three want
different actions.

This is the same distinction the probe already drew correctly between `dark` and
`unevaluable`, applied to the transition rather than the level. The wiring is one exported
array, `ALARMING_VERDICTS`, which drives the exit code `control-audit.yml` already gates on —
no workflow change and no inline-script budget spent.

| Evidence | Result |
|---|---|
| Driven against the real #154/#155 history at 2026-09-20T03:15Z | `stopped`, `lastExecutedAt: 2026-09-19T15:35:16Z` (old rule: `lit`) |
| Mutation — disable the branch | 4 assertions fail |
| Mutation — treat unknown step data as a stop | 1 assertion fails |
| Mutation — drop `stopped` from `ALARMING_VERDICTS` | 1 assertion fails |
| Fixtures | verbatim Actions API output for both runs, read 2026-09-20 |

The second job below is still open.

**Second, replace the Shopify smoke with a browse-only smoke — written, tested, wired to
report.** `verify-production.mjs` asks seventeen questions about a headless storefront, and
after the decommission none of them has a subject. `scripts/verify-browse-only.mjs` asks the
questions a browse-only site can fail: does every catalogue handle serve, does an unknown one
return a **true** 404, does any response reference a Shopify host, does any page still emit
commerce semantics, and does the sitemap agree with the repository.

**Pointed at the running application, it returns 52 findings and every one is true:**

| finding | count at first run | now | whose work |
|---|---|---|---|
| `commerce-offer-jsonld` | 17 | **0** | WS-5a — done |
| `commerce-price-jsonld` | 17 | **0** | WS-5a — done |
| `commerce-availability-jsonld` | 17 | **0** | WS-5a — done |
| `unknown-not-404` | 1 | 1 | WS-4 |

**52 findings down to 1**, measured against a real production server before and after.
WS-5a removed the `offers` block from the product JSON-LD; the remaining finding is
WS-4's.

That last one is **documented and deliberate today**.
`/products/<unknown>` answers HTTP 200 with `not-found.tsx` rendered and
`robots: noindex`, because — in the page's own words — "this route cannot use
`dynamicParams = false` without 404ing products newly added in Shopify". Acceptance
criterion 4 is therefore not merely unmet; it is unmet *on purpose*, for a reason the
decommission deletes. Once the repository is the catalogue, `generateStaticParams` is
exhaustive and `dynamicParams = false` becomes correct. It is a premise with an expiry date
([ADR 008](adr/008-decisions-need-premise-detectors.md)) and WS-4 is the date.

**It reports into the audit summary and files no issue.** A six-hourly issue that cannot be
closed for weeks is the shape ADR 011 records costing this repository a month of unread
escalations. The issue-filing step and `status: configured` arrive together, once WS-4 and
WS-5 land and a manual `pnpm verify:browse-only` comes back clean. Retire the Shopify smoke
steps only then, and never in the same change.

Two bugs worth recording, both found by running the probe rather than reading it:

- **The attribution guard was wrong while citing the exact failure it was written for.** It
  accepted "a `server` header *or any body at all*", and the interception this repository
  runs behind answers with a 78-byte `text/plain` denial — a body. Seventeen confident
  findings about a site never reached. Attribution now needs evidence of a web application:
  a `server` header, or an HTML body.
- **It guessed `/sitemap.xml`.** This site serves `/api/sitemap`, which `robots.txt` has
  always said. A false `sitemap-unreadable` against a working sitemap is the failure
  direction that gets a monitor muted, so the path is now read out of `robots.txt` and the
  two cannot drift.

### WS-7 — Credential revocation and the checkout hostname

| | |
|---|---|
| Owns | `docs/shopify-decommission-inventory.md` (the ledger), `docs/credential-inventory.md` |
| Blocked by | WS-4 live in Production |
| Done when | every ledger row has a dated `Revoked` and an `Evidence` cell, and `pnpm audit:secrets` is clean |

Order is by blast radius, highest first — the ledger already gets this right and it is not
negotiable. `VERCEL_TOKEN` goes before any Shopify credential because it can read all of them.
`SHOPIFY_STOREFRONT_ACCESS_TOKEN` goes last because the export needs it.

Webhooks come out **before** the route, never after:

```
freeze commerce
  → delete the Shopify webhook subscriptions
  → confirm no future delivery is expected
  → remove /api/webhooks/shopify
  → remove the HMAC secret
  → deploy
```

Removing the endpoint first leaves Shopify retrying against a failing route for its full
backoff schedule, which generates exactly the noise a transition cannot afford.

**`checkout.healthyjewellery.com` is retired on a clock, not on a whim.** It currently CNAMEs
to `shops.myshopify.com`, and old links, bookmarks, email templates and stale sessions still
point at it. Sequence: ship browse-only → confirm nothing in code, email, social, QR codes,
ambassador cards or analytics links to it → wait **30 days** as a conservative operational
window → then attach it to Vercel and serve a `noindex` explanatory page or a 410:

> This catalogue no longer accepts online orders. Please meet a Healthy Jewellery ambassador
> or use the official contact channel.

Attaching it to Vercel is preferred over deleting the CNAME: an honest destination beats a
dead hostname. Never redirect it to a fake checkout, an unrelated product page, or the
homepage — a customer who followed a checkout link and landed on a homepage has been told
nothing.

Remove a Shopify-specific restrictive CAA record only **after** the checkout CNAME has moved
away from Shopify, not before.

Vercel variables to remove from Production, Preview **and** Development — and inventory with
`vercel env ls` first rather than trusting this list:

```
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_ACCESS_TOKEN
SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_WEBHOOK_SECRET
SHOPIFY_REVALIDATION_SECRET
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET
SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET
```

**Keep** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `RESEND_API_KEY`.
`/api/contact` still consumes a paid external service and still needs distributed abuse
protection; the rate limiter's posture changes from guarding a commerce proxy to guarding
customer-contact intake, which is a change of rationale and not of requirement.

`NEXT_PUBLIC_*` values are inlined into client bundles at build time, so removing the runtime
variable proves nothing about the artefact. **Always take a fresh Production build with the
build cache disabled after removal**, then grep the emitted bundle for the Shopify hostname.

### WS-8 — Documentation, ADRs and the record

| | |
|---|---|
| Owns | `CLAUDE.md`, `README.md`, `docs/**` except files owned above |
| Blocked by | each preceding workstream, incrementally |
| Done when | `doc-numeric-claims.test.ts` and `agent-doc-claims.test.ts` pass with no stale claim |

`SHOPIFY_SETUP.md`, `docs/webhooks.md`, `docs/go-live-runbook.md`, `docs/catalog-conventions.md`
and `docs/headless-launch-inventory.md` all describe a system that will not exist. They are
rewritten or archived with a dated supersession note — never silently deleted, because several
of them are the only record of *why* a mapping rule exists, and WS-3 needs to read them before
they go.

Seventeen ADRs mention Shopify. An ADR is a dated decision and is never edited to match the
present; the ones whose premise has expired get a supersession line pointing at ADR 033.

---

## 4. Phase gates

No workstream crosses a gate until the gate's condition is a check that has been observed
passing.

| Gate | Condition | Evidence |
|---|---|---|
| **G0 — governed** | `main` branch-protected with three required contexts | `probe-branch-protection.mjs` reports configured |
| **G1 — based** | lint, type-check, unit, build, e2e all green on a fresh branch off `main` | one CI run |
| **G2 — exported** | 17 + 5 = 22 reconciled; no customer or order data present | the staging artefact, reviewed |
| **G3 — modelled** | schema validates; boundary test fails on a deliberate violation | a red run, then green |
| **G4 — parallel** | Preview renders the full catalogue from `src/content/catalog/**` with Shopify still present | Preview URL |
| **G5 — cut over** | commerce removed; retired routes return declared codes over HTTP | e2e status assertions |
| **G6 — dark** | no Shopify request from browser or server; no Shopify dependency | bundle grep + network log |
| **G7 — revoked** | every ledger row dated with evidence | the ledger |
| **G8 — closed** | checkout hostname retired after its 30-day window | DNS + a 410 |

**G0 before everything.** **G3 before G2 is acceptable and preferred** — the schema tells the
export what to collect. **G2 before G5 is absolute**: the brief's strongest principle is that
the catalogue must become independent before Shopify becomes inaccessible, and reversing those
two is the only step in this plan that cannot be undone.

---

## 5. Acceptance criteria

The decommission is complete when every row passes. Each names the check, because a criterion
nothing evaluates is a wish.

| # | Criterion | Checked by |
|---|---|---|
| 1 | Canonical domain serves the current `main` commit | `probe-canonical-domain.mjs` |
| 2 | `www` permanently redirects to the apex | same probe, `www-not-redirected` absent |
| 3 | Every active catalogue handle returns 200 | browse-only smoke |
| 4 | An unknown product handle returns a true 404 | browse-only smoke |
| 5 | Retired routes return their declared 308 / 410 / 404 | e2e HTTP status assertions |
| 6 | No page exposes cart, checkout, account, price, or `Offer` JSON-LD | e2e + unit |
| 7 | No Shopify request from browser or server runtime | Playwright network log |
| 8 | No Shopify package or dependency remains | `package.json` + lockfile |
| 9 | No Shopify environment variable or GitHub secret remains | `vercel env ls`, `audit:secrets` |
| 10 | Every catalogue record validates at build time | Zod, build-blocking |
| 11 | Every product has a photo or a visible illustration-pending state | schema union, exhaustive |
| 12 | Contact rate limiting remains distributed and healthy | `rateLimit` tests + a live probe |
| 13 | Contact email delivery verified | a live send |
| 14 | Sitemap, metadata, JSON-LD, images, search and a11y work without Shopify | e2e suite |
| 15 | The verification tier reports a de-configuration within one run | WS-6 |

Criterion 15 is new. It is the one that would have caught what happened on 2026-09-19, and a
decommission is precisely the operation that removes credentials on purpose — so the plan
needs an alarm that can tell a deliberate removal from an accidental one, and record which.

---

## 6. What this session could not verify, and why

Stated plainly, because an unstated limit reads as a clean bill of health.

| Claim | Verifiable here? | Why not |
|---|---|---|
| The live site's HTML, headers, status codes | **No** | outbound HTTPS is blocked by this environment's egress policy — every host returns `403` on `CONNECT`, including `example.com`, so this is a sandbox property and not a site property |
| Vercel project domains, env vars, deployment targets | **No** | no dashboard or API access |
| The 22 Shopify products | **No** | connector `needs_reconnect` |
| Whether the Storefront token still exists in Vercel or Shopify | **No** | console-only |
| DNS resolution | **Yes** | the container resolver answers; results in §2.2 |
| Repository state, CI history, issues, run step conclusions | **Yes** | git and the GitHub API |

The structural answer, and it is already this repository's answer: **live verification belongs
in a workflow, not in a session.** A GitHub Actions runner has the egress a sandbox does not,
it runs on a schedule nobody has to remember, and its verdict lands in an issue rather than in
a chat log. Every live claim in this plan that is currently unverifiable should end up owned by
a probe in `control-audit.yml` — which is what `probe-canonical-domain.mjs` already
demonstrates, and what WS-6 extends.
