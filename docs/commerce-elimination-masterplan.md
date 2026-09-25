# Commerce elimination masterplan

The execution plan for finishing what PRs #79–#83 started: turning Healthy Jewellery from a
headless storefront into a **brand-and-encounter website**, with commerce removed as a system
rather than hidden as a UI state, and the boundary held by checks rather than by intention.

**This file is the plan of record.** Where it disagrees with
[`docs/browse-only-masterplan.md`](browse-only-masterplan.md), this one is newer and that one
is history. Where it disagrees with a *measurement*, the measurement wins and this file is
wrong.

**Classification: historical by construction**, like its predecessor and for the same reason.
Its figures are dated observations of a system mid-migration, not standing claims, so it is
deliberately outside `EXPLICIT_AGENT_DOCS` and the numeric sweep does not read it. Saying so
rather than leaving the omission to be discovered is
[ADR 019](adr/019-an-unclassified-entry-is-an-unverified-one.md)'s rule. When a figure here
becomes a standing claim it moves to `CLAUDE.md` or `docs/testing-strategy.md`, where it gets
reconciled.

That is a statement about the **numeric sweep**, and it is not the same thing as the contract's
`historical` position class. Under
[`COMMERCE-ELIMINATION-CONTRACT.md`](../COMMERCE-ELIMINATION-CONTRACT.md) §4 this file is
ordinary `executable` prose carried by a row in the register — unlike
`docs/browse-only-masterplan.md`, which describes finished history and is classified
`historical`. The distinction is load-bearing: this document describes work that is *still
outstanding*, and the register row is what deletes it when the work is done. **A plan for work
that is finished is a plan somebody will start.**

---

## 1. North-star architecture

The website is a **brand-and-encounter extension**, not a transactional system. Its only
externally visible responsibilities are these five, and it is measured against them:

| # | Responsibility | Where it lives today | Gap |
|---|---|---|---|
| 1 | Explain the three metals accurately — Grade 23 titanium, anodized niobium, 316L surgical steel — **only where the claim has supporting documentation** | `/materials`, `src/lib/data/hj-data.ts` | No evidence field exists. Every claim is currently asserted on the brand's own authority. WS-B. |
| 2 | Present the geometric collection language — Arc, Halo, Orbit, Facet, Disc, Bar, Cuff, Split, Hoop | Product titles | **8 of 17 titles carry a vocabulary form; 9 do not. Two forms have no product at all.** §2.3. WS-B. |
| 3 | Carry the travel-memory story and show where an encounter continues | `/about`, `/stores` | No ambassador handoff surface exists. WS-G. |
| 4 | Offer low-pressure, non-commerce contact paths | `/contact`, `SOCIAL_LINKS` | Working. Ambassador follow-up link absent. WS-G. |
| 5 | Preserve technical quality — mobile performance, accessibility, privacy, SEO, security headers, clean deployment, observability, content governance | The whole gate | Strong. 92 unit files, 16 E2E specs, 29 registered controls. |

### Prohibited responsibilities, and where each is now enforced

Every row is a rule the build can fail on, not a statement of intent. This is the change
[ADR 036](adr/036-a-prohibition-in-prose-is-not-a-boundary.md) records.

| Prohibition | Enforced by |
|---|---|
| No Storefront or Admin API runtime traffic | `absolute` scope — `storefront-token-header`, `admin-api-path`, `graphql-endpoint` |
| No catalogue synchronised from a commerce platform | ADR 034 + `catalog-import-boundary.test.ts` |
| No cart, checkout, checkout redirect, buy-now, payment acceleration | `absolute` scope — `cart-mutation`, `checkout-handoff` |
| No order status, customer account, customer creation | `absolute` scope — `customer-identity`, `draft-order`; §7 route retirement |
| No discount codes, shipping calculation, tax calculation, inventory check | `absolute` scope — `discount-machinery`, `inventory-check`; prohibited-package rules |
| No transaction webhook or abandoned-cart activity | Register WS-F rows; `/checkouts/*` 410 |
| No conversion-tied storefront analytics | WS-G, and `docs/analytics.md`'s rewrite |
| No purchase-oriented copy competing with an ambassador | `browse-only-copy.test.tsx` |
| No retention of commerce customer data anywhere | `value` scope; `audit:secrets`; WS-H |

**The functional replacement for "Shop" is a Collection or Materials experience.** Item-level
pages remain as non-transactional editorial records — *Meet the piece* — carrying verified
material, form, care, sizing guidance, imagery and **one** gentle follow-up action. They carry
no stock, price, sale, availability-for-purchase, purchasing SKU control, selected variant or
fulfilment promise.

---

## 2. Ground truth, measured 2026-09-25

Every number below says how it was obtained, because
[ADR 025](adr/025-a-number-in-prose-is-a-claim.md) is blunt that a number in prose is a claim
until something reads it.

### 2.1 The repository

| Fact | Value | Source |
|---|---|---|
| `main` at fork point | `1f999c1` | `git rev-parse` |
| Lint · type-check | clean | `pnpm lint`, `pnpm type-check` |
| Unit tests | **92 files · 2359 passed · 5 skipped · 0 failed** | `pnpm exec vitest run` |
| Build | exit 0 | `pnpm build` |
| Registered controls | **29**, 27 configured · 2 not-configured | `docs/controls.json` |
| Mutation sentinels | **12 vitest, all alive** + 3 playwright | `probe-assertion-liveness.mjs` |
| Tracked text files | 358 | `verify-commerce-contract.mjs` |
| Commerce packages declared or locked | **0** | `auditPackages`, manifest + lockfile |

### 2.2 The commerce surface that remains

| Class | Files | What it means |
|---|---|---|
| `executable` | 283 | The default. A file here carrying a commerce identifier fails the build unless the register owns it. |
| Register rows | **58** | The burn-down number. It only moves one way. |
| `historical` | 43 | Dated records — ADRs, `CHANGELOG.md`, `STATE.md`, the predecessor plans. Never edited to match the present. |
| `superseded` | 9 | Live documents describing a dismantled system, each carrying a dated banner. |
| `negative-control` | 16 | Checks that must name what they forbid. |
| `specification` | 2 | The contract and the register. |
| `excluded` | 5 | Binaries and the lockfile. |

Register rows by workstream: **WS-A 9 · WS-B 1 · WS-C 30 · WS-D 2 · WS-E 1 · WS-F 6 ·
WS-G 1 · WS-I 8.**

**WS-C is more than half the register, and that is the schedule risk.** Every previous
estimate of this decommission sized it on application code and treated the probes, workflows
and fixtures as follow-on tidying. They are not: they encode the behaviour being removed, and
several of them (`premise-checks`, `escalation`, `preflight-secrets`) are the only executable
record of *why* a rule exists.

### 2.3 The catalogue, and the vocabulary gap

17 products, 5 collections, all validated at build time through Zod.

| Collection | Products | Titanium | Niobium | 316L |
|---|---|---|---|---|
| rings | 4 | 3 | 1 | 0 |
| earrings | 4 | 2 | 1 | 1 |
| necklaces | 4 | 2 | 1 | 1 |
| bracelets | 3 | 2 | 0 | 1 |
| charms | 2 | 1 | 0 | 1 |
| **Total** | **17** | **10** | **3** | **4** |

**The geometric vocabulary is not the vocabulary the catalogue uses.** Measured against the
nine forms the north star names:

| Form | Products carrying it | Which |
|---|---|---|
| Arc | 2 | Arc Band, Arc Hoops |
| Disc | 2 | Disc Charm, Disc Studs |
| Bar | 1 | Linear Bar |
| Cuff | 1 | Cable Cuff |
| Orbit | 1 | Orbit Pendant |
| Split | 1 | Split Ring |
| Hoop | 1 | Arc Hoops (also counted under Arc) |
| **Halo** | **0** | — |
| **Facet** | **0** | — |

**Nine of seventeen titles use a word outside the vocabulary**: Classic, Cone, Dome, Teardrop,
Flat (×2), Link (×2), Tube. Two of the nine forms have no product at all.

This is not a naming preference. A controlled vocabulary that two thirds of the catalogue does
not use is a vocabulary nobody is enforcing, and the moment it goes into a schema as an enum
the build fails on nine records. WS-B's first task is therefore a decision, not an edit: does
the vocabulary describe the catalogue, or does the catalogue get renamed to fit it? Both are
defensible. Shipping the enum without deciding is not.

### 2.4 Content debt, counted

`pendingFieldCount()` exists precisely so this is a number rather than a feeling.

| Field | Pending | Authored |
|---|---|---|
| `careInstructions` | **17 / 17** | 0 |
| `sku` | **17 / 17** | 0 |
| `lastReviewed` | **17 / 17** | 0 |
| **Total pending fields** | **51** | — |

| Media state | Count |
|---|---|
| `illustration` | **17 / 17** |
| `photo` | **0** |
| `illustration-pending` | 0 |

Every product is a hand-drawn SVG. That is a deliberate visual language, not an apology —
`CLAUDE.md` is explicit — but it means requirement 1 of the north star (explain the materials
accurately) currently rests entirely on prose, with no photographic evidence of finish,
colour or scale behind it.

The **five-product delta** against the last known Shopify inventory (22 products on 2026-08-12
per `docs/headless-launch-inventory.md`) is still open and still counted by
`catalog-content.test.ts`. It is a WS-F question, not a WS-B one: nobody can reconcile it
while the connector is signed out.

---

## 3. The deletion boundary

**Landed.** `COMMERCE-ELIMINATION-CONTRACT.md` is the specification;
`docs/commerce-dependency-register.md` is the dated inventory; `scripts/verify-commerce-contract.mjs`
is the gate. See [ADR 036](adr/036-a-prohibition-in-prose-is-not-a-boundary.md) for the design
and `docs/controls.json` → `commerce-elimination-boundary` for its three known limits.

Two properties every workstream below depends on:

1. **`executable` is the default class.** A new file carrying a commerce identifier fails the
   build until somebody classifies it or the register owns it. Nothing arrives quietly.
2. **The reconciliation runs both ways.** A register row whose file no longer matches fails
   exactly as loudly as an unregistered file. **A workstream finishes a row by deleting it**,
   and cannot finish one by forgetting it.

---

## 4. The workstream charter

Nine workstreams. Each has one owner, an explicit file-ownership boundary, a definition of
done that is a check rather than an opinion, and a named blocker where one exists.

**The ownership boundary is the merge-correctness control, not bureaucracy.**
[ADR 031](adr/031-a-clean-merge-is-not-a-correct-merge.md) exists because two branches
independently incremented the same counter, git merged the line cleanly, and the result was
wrong. Parallel agents on one repository reproduce that failure on demand. Disjoint file
ownership is what makes concurrency safe here. Where two workstreams must touch one file, the
charter names which one owns it and the other opens a request.

| WS | Domain | Owns | Rows | Blocked by |
|---|---|---|---|---|
| **A** | Application | `src/app/**`, `src/config/**`, `src/lib/**` (not `catalog/`), `next.config.ts` | 9 | WS-F, for the webhook route only |
| **B** | Content | `src/content/catalog/**`, `src/lib/catalog/**`, product copy | 1 | nothing |
| **C** | CI/CD | `.github/**`, `scripts/**`, `gate.yaml`, test configs, fixtures | 30 | nothing |
| **D** | Infrastructure | Vercel env, `.env.local.example`, headers, CSP, caches, image config | 2 | dashboard access |
| **E** | DNS | apex, `www`, `checkout.` CNAME, CAA, TLS | 1 | dashboard access |
| **F** | Third-party | Shopify apps, tokens, webhooks, sales channels, feeds, automations | 6 | connector `needs_reconnect` |
| **G** | Analytics & privacy | `src/lib/analytics/**`, `docs/analytics.md`, consent, storage keys, retention | 1 | nothing |
| **H** | Data retention | Archival, lawful basis, retrieval ownership, account closure | 0 | a Vietnam-qualified adviser |
| **I** | Documentation | `CLAUDE.md`, `README.md`, `docs/**` not owned above | 8 | each preceding WS, incrementally |

---

### WS-A — Application · *partly blocked*

| | |
|---|---|
| Done when | its 9 register rows are gone and `src/lib/shopify/` does not exist |
| Blocked by | WS-F, for `/api/webhooks/shopify` and its HMAC utilities only |

**Unblocked now** — nothing outside this repository gates any of these:

1. **`/api/revalidate`** — delete. A catalogue that is a set of JSON files in git is
   revalidated by deploying, not by purging. The endpoint exists to invalidate caches
   populated by a read path that no longer exists, and it still reads
   `SHOPIFY_REVALIDATION_SECRET`.
2. **`src/config/shopify.ts` and `src/config/shopify-public.ts`** — delete. The last
   server-side reader of three Shopify secrets, and a browser-safe module carrying a store
   domain nothing in the browser needs.
3. **`src/lib/shopify/api-version.ts`** — delete with the directory. A pinned vendor API
   version with no vendor is a claim about somebody else's system that nothing will ever call.
4. **`src/app/api/version/route.ts`** — rewrite, do not delete. The stale-build fingerprint is
   the only thing in a deployment that reveals a cached bundle carrying dead inlined
   `NEXT_PUBLIC_*` values, and that failure mode survives the decommission. Drop the
   `shopify` block and the store domain from `FINGERPRINTED_KEYS`; keep everything else.
5. **`src/config/build-info.ts`** — drop the store domain from the fingerprinted key set.
6. **`src/app/api/health/route.ts`** — one sentence names `/api/shopify`, which answers 404.

**Blocked, and the order is not negotiable** — see WS-F.

7. `/api/webhooks/shopify`, `src/lib/webhooks/retrySafety.ts`,
   `scripts/lib/webhook-signature.mjs`, `scripts/verify-webhook-secret.mjs`.

**Then the information architecture.** The current nav is `Collection · Our Story · Contact`.
The north star asks for:

```
Home · Our Metals · The Forms · Care · The Moment · Find Us / Stay in Touch · Contact
```

That is a bigger change than a `mainNav` edit, and it should not be made as one:

- `Our Metals` is `/materials`, which exists and is good.
- `The Forms` replaces `/shop` — and it cannot ship before WS-B decides §2.3, because "The
  Forms" is a promise that the catalogue is organised by form, and today it is organised by
  object type (rings, necklaces, earrings, bracelets, charms).
- `Care` has no source. All 17 `careInstructions` are `pending`. Shipping a Care page over 17
  pending states is the fabricated-content failure the schema's pending union exists to
  prevent.
- `The Moment` is the travel-memory story and is a writing task, not an engineering one.
- `Find Us / Stay in Touch` is WS-G's ambassador handoff.

**Sequence it as: keep the current nav until WS-B and WS-G have content behind the new
labels.** A navigation item pointing at a page with nothing on it is worse than the label it
replaced. The header composition itself is unaffected — `e2e/header-fit.spec.ts` sweeps
320–1440px and binary-searches the narrowest fitting width per layout mode, so adding a
primary link is a measurement, and the measurement already exists.

**"Meet the piece".** `/products/[handle]` stays and is reframed. It must carry: verified
material and specification, the form it belongs to, care guidance *where authored*, sizing
guidance, imagery, and **one** follow-up action — "Ask an ambassador about this shape". One,
not two: a page offering a choice of two ways to convert is a conversion funnel with better
manners.

---

### WS-B — Content · *not blocked, and it gates WS-A's IA*

| | |
|---|---|
| Owns | `src/content/catalog/**`, `src/lib/catalog/**`, `docs/catalog-conventions.md`'s replacement |
| Done when | the vocabulary is enforced by the schema, claim evidence is mandatory, and `pendingFieldCount()` is asserted against a declining budget |

Four deliverables, in order.

**1. Decide the vocabulary, then enforce it.** §2.3 is the input. Either the nine forms become
a `z.enum` and nine products are renamed, or the vocabulary is recorded as a *design language*
rather than a naming rule and the north star is corrected. Whichever is chosen, the schema
gains a `form` field and the enum is the single source — the same move `COLLECTION_HANDLES`
already makes, and for the same reason `collection-handle-contract.test.ts` exists.

**2. Claim evidence becomes mandatory.** Add `claimEvidence` as a discriminated union in the
same shape as `media`:

```
{ state: 'pending' }
| { state: 'documented', source: string, reviewedOn: string }
| { state: 'not-applicable', why: string }
```

The rule the UI enforces: **a material, corrosion or skin-safety statement renders only
against `documented`.** Where evidence is `pending`, the page renders a conservative,
non-promotional fallback and never generates a claim from a material name. "Grade 23 titanium"
is a specification. "Safe for sensitive skin" is a claim, and a claim needs a source.

This is the highest-consequence item in the whole plan. It is the one place where getting it
wrong is not a broken page but a false statement about what a metal does to somebody's body.

**3. The 80/20 split, in the schema rather than in a style guide.**

| Locked core — one value, everywhere | Localised — may vary by market |
|---|---|
| `form`, `title`, `handle` | regional descriptive copy |
| `material`, `materialLabel`, `specification` | sizing guidance and local size conventions |
| `claimEvidence` | locally approved ambassador contact path |
| approved photography standard | local event and location information |
| fixed brand visuals | — |

`marketEligibility` and `published` gate which markets see a record. A localised field may not
reintroduce a prohibited commercial statement, which is why `browse-only-copy.test.tsx` runs
against **rendered output** and not only against source — a translation is not visible to a
source scan.

**4. Burn down the 51 pending fields**, and assert the budget. `pendingFieldCount()` should be
held against a number in a test that only ever goes down, the way
`workflow-inline-script-budget.test.ts` ratchets. Note the direction carefully: a budget that
can be *raised* to make CI green is the metric-with-one-direction failure
[ADR 021](adr/021-a-metric-with-only-one-direction.md) names. Assert equality, not `<=`, so
lowering it requires authoring content and raising it requires an explained edit.

---

### WS-C — CI/CD · *not blocked, and it is 30 of the 58 rows*

| | |
|---|---|
| Owns | `.github/**`, `scripts/**`, `gate.yaml`, `vitest.config.ts`, `playwright.config.ts`, fixtures |
| Done when | no probe, workflow or fixture references a system that does not exist, and `docs/controls.json` has no control whose subject is gone |

**Read [ADR 035](adr/035-a-control-outlives-its-subject.md) before touching anything here.**
Deleting a subject does not delete the controls written against it — it silently changes what
they mean, and the worst of them go *vacuously green*. Eleven registries refused one
decommission commit; three refused this one.

Work it in this order:

1. **The mock-storefront environment.** `vitest.config.ts`, `playwright.config.ts` and
   `ci.yml` inject five `SHOPIFY_*` values so that `process.env.X ?? fallback` branches run
   the same way locally and in CI. They cannot be removed before the code that reads them, or
   `per-file-coverage-gaps.test.ts` starts failing on branches that no longer exist. **After
   WS-A, not before**, and `vitest-env-contract.test.ts` holds the three in step.
2. **`scripts/lib/premise-checks.mjs`** — five of its six premises are about a store that will
   not exist. The mechanism is ADR 008 and is worth keeping; the premises are not. Replace
   them with premises this site actually rests on: the canonical domain, the catalogue's
   completeness, the ambassador contact path's liveness, the claim-evidence coverage.
3. **`scripts/preflight-secrets.mjs` and `production-smoke.yml`** — retire the Shopify tier
   only once `verify-browse-only.mjs` files issues and `browse-only-smoke` flips to
   `configured`. Never in the same change, and never before: a tier that stops reporting is
   indistinguishable from a tier that reports success
   ([ADR 033](adr/033-a-premise-that-expired-mid-decommission.md)).
4. **`scripts/diagnose-deployment.mjs` and `diagnose-deployment.yml`** — delete. Every
   question they ask is about a headless storefront.
5. **`scripts/lib/api-version.mjs`** — delete with `src/lib/shopify/`.
6. **`docs/controls.json`** — retire the controls whose subject is gone. Each retirement needs
   the same evidence a registration does.
7. **`gate.yaml` and `docs/safety.md`** — `src/lib/shopify/**` is on the loop denylist and is
   being deleted outright. Replace the entry with the paths that now matter:
   `COMMERCE-ELIMINATION-CONTRACT.md` and `docs/commerce-dependency-register.md`, which a loop
   must escalate rather than edit.

**The branch-protection gap is still open.** `merge-gate` reads `not-configured`: `main` is
unprotected and a merge to `main` deploys to production. That is tolerable for one careful
human and is not tolerable for a fan-out of agents. Required contexts are the three strings
`docs/controls.json` already names — run `vitest run required-checks-contract` first, which
proves they are the strings GitHub publishes today. **Never type `verify` or `e2e`**: those
are job IDs, and requiring them would register two contexts nothing reports, blocking every
merge permanently.

---

### WS-D — Infrastructure · *blocked on dashboard access*

| | |
|---|---|
| Owns | Vercel projects and environment variables, `.env.local.example`, headers, CSP, image config |
| Done when | `vercel env ls` shows no commerce variable in any environment, and a fresh no-cache build's bundle contains no Shopify hostname |

Remove from Production, Preview **and** Development — and inventory with `vercel env ls`
first rather than trusting this list:

```
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN   SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_ACCESS_TOKEN    SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_WEBHOOK_SECRET             SHOPIFY_REVALIDATION_SECRET
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET
SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET
```

**Keep** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `RESEND_API_KEY`.
`/api/contact` still consumes a paid external service and still needs distributed abuse
protection. The rate limiter's *rationale* changes — from guarding a commerce proxy to
guarding customer-contact intake — and the requirement does not.

**`NEXT_PUBLIC_*` values are inlined into client bundles at build time**, so removing the
runtime variable proves nothing about the artefact. Always take a fresh Production build with
the build cache **disabled** after removal, then grep the emitted bundle. This is the one
verification step in the whole plan that a passing deployment actively disguises.

Also: CSP and `connect-src` must lose the former Shopify, checkout, payment and
commerce-analytics origins. `next.config.ts` already carries no `remotePatterns` — the image
optimiser's standing permission for `cdn.shopify.com` was removed rather than left harmlessly
in place, because a wildcard for a vendor nothing fetches from is a permission nobody reviewed.

---

### WS-E — DNS · *blocked on dashboard access*

| | |
|---|---|
| Owns | apex, `www`, `checkout.` CNAME, CAA, TLS, `docs/dns-domain-setup.md` |
| Done when | `probe-canonical-domain.mjs` closes its own issue, and the checkout hostname serves a 410 from Vercel |

1. `healthyjewellery.com` → primary, assigned to Production.
2. `www.healthyjewellery.com` → permanent (308) redirect to the apex, **at Vercel**. Do not
   add it in `next.config.ts`: the request must be answered before it reaches the application,
   and a redirect in the app would make the platform and the code two sources of truth for one
   behaviour.
3. **`checkout.healthyjewellery.com` is retired on a clock, not on a whim.** It CNAMEs to
   `shops.myshopify.com`, and old links, bookmarks, email templates and stale sessions still
   point at it. Sequence: ship browse-only → confirm nothing in code, email, social, QR codes,
   ambassador cards or analytics links to it → wait **30 days** → then attach it to Vercel and
   serve the same 410 `/checkouts/*` now serves. Attaching beats deleting the CNAME: an honest
   destination beats a dead hostname. Never redirect it to a homepage — a customer who
   followed a checkout link and landed on a homepage has been told nothing.
4. Add no restrictive CAA record at the apex. A Shopify-era `ssl.com`-only CAA breaks Vercel
   certificate renewal **silently, sixty days later, at expiry**. Remove any Shopify-specific
   CAA only *after* the checkout CNAME has moved away.

The done-condition is the probe closing its own issue, not a person saying it looks right.
That is the whole point of having built the probe.

---

### WS-F — Third-party access · *blocked: connector `needs_reconnect`*

| | |
|---|---|
| Owns | Shopify apps, tokens, webhooks, sales channels, payment integrations, feeds, automations; `docs/shopify-decommission-inventory.md` |
| Done when | every ledger row has a dated `Revoked` and an `Evidence` cell, and `pnpm audit:secrets` is clean |

**The ordering constraint that outranks everything else in this plan:**

```
freeze commerce
  → delete the Shopify webhook subscriptions in Shopify Admin
  → confirm no downstream subscriber or process expects a delivery
  → remove /api/webhooks/shopify and its HMAC utilities
  → remove SHOPIFY_WEBHOOK_SECRET
  → deploy
```

Removing the endpoint first leaves Shopify retrying against a failing route for its full
backoff schedule — noise arriving exactly when the team is least able to tell a real alarm
from an expected one. **Revoking a webhook before its dependent workflow is identified can
also create silent operational data loss**, which is why the confirm step is a step.

Revoke credentials by **blast radius, highest first**, not by convenience. `VERCEL_TOKEN` goes
before any Shopify token, because its deleted workflow ran `vercel pull --environment=production`
and therefore reaches all four Shopify credentials plus Upstash and Resend.
`SHOPIFY_STOREFRONT_ACCESS_TOKEN` goes **last**, because the five-product reconciliation needs
it and it is the least dangerous of the set.

Then: delete or disable the custom apps, remove the headless sales channel, disconnect payment
and pixel integrations, remove third-party collaborator access not needed for retained
records, and register a final decommission record — closure date, account owner, retained-data
location, retention period, access approvers, deleted credentials, removed apps, removed
webhooks, and evidence that public checkout is unavailable.

**What counts as evidence**, in descending strength: a probe verdict with a timestamp; the
auditor's output; a dated console observation naming who looked and when. A link to a
screenshot is **not** evidence for this ledger's purposes — it is not greppable, it rots, and
it cannot be re-checked by the next person. Write what was observed, in words, with a date.

---

### WS-G — Analytics and privacy · *not blocked*

| | |
|---|---|
| Owns | `src/lib/analytics/**`, `docs/analytics.md`, consent, cookie and storage keys, the ambassador handoff |
| Done when | no event models a funnel, every destination is Company-controlled and documented, and a fresh session creates no commerce storage key |

**Replace commerce KPIs with relationship-quality signals.** The replacement site must not
become a disguised online funnel, and the metric set is how that promise is kept or broken.

| Retired | Replacement | Why it is not a funnel in disguise |
|---|---|---|
| Conversion rate | Visits from ambassador QR links | Measures whether a real encounter led somewhere, not whether a stranger converted |
| Add-to-cart rate | Return visits to material pages | Measures whether the explanation was worth coming back to |
| Cart abandonment | Time on `/materials` and `/products/[handle]` | Reading depth, not drop-off |
| Revenue per visitor | Verified contact completions **where consent exists** | Counted only with consent; never a target |
| Product impressions | Content readability, page performance, accessibility scores | Quality of the artefact, not throughput |
| — | Qualitative ambassador feedback | The only signal that sees the part of the journey this site does not |

**The ambassador handoff** is WS-G's other deliverable and the north star's third and fourth
responsibilities: QR links, cards, social handles, contact route and location information that
work **without asking for unnecessary personal data**. The test is concrete — a visitor who
scans a card should reach something useful without typing anything.

**Privacy.** `/api/contact` is the only intake. Every form and analytics event must reach only
an approved Company-controlled system with documented ownership, access, consent and
retention. A fresh session must create no commerce cookie, `localStorage` key,
`sessionStorage` key or service-worker cache entry — and the site holds no client state across
a navigation today, which is a property worth keeping rather than an absence to fill.

---

### WS-H — Data retention · *blocked on a Vietnam-qualified adviser*

| | |
|---|---|
| Owns | archival, lawful basis, retrieval ownership, account closure evidence |
| Done when | retention, retrieval ownership and decommissioning are documented and approved |

**The finding, stated as a finding.** `docs/headless-launch-inventory.md` records
`ordersCount: 0` as of 2026-08-12 and the store has never had a confirmed payment provider. On
that evidence there are **no transaction records, no customer records and no payment data** to
retain, and the Vietnamese tax and consumer-law exposure this decommission anticipated is
empty.

That is a finding from this repository's own records. **It is not a legal or accounting
opinion**, and it should be put to a Vietnam-qualified adviser precisely because it is cheap to
confirm and expensive to assume. Until they answer, the Shopify plan stays: revoking
credentials is reversible in the sense that the data survives; cancelling the plan is not.

**Do not migrate Shopify customer data into a new web system.** The brand rule is that
customer data stays in Company-controlled systems, and moving it into a replacement contact
database without a documented lawful basis, consent logic, access controls and a retention
plan would replace one risk with another.

**A support owner must be able to answer**, in writing, what happens when somebody asks about
a historical order, refund, customer record or discontinued checkout. The answer must be
clear, human and documented. Today `/orders/*` answers *"This website does not hold orders"*,
which is true and is not a support process.

---

### WS-I — Documentation · *incremental*

| | |
|---|---|
| Owns | `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/**` not owned above |
| Done when | its 8 register rows are gone and `doc-numeric-claims` / `agent-doc-claims` pass with no stale claim |

A system is not decommissioned when its code is gone but its **people and automated workflows
still assume it exists**. These are the documents somebody acts on:

`CLAUDE.md` · `README.md` · `CONTRIBUTING.md` · `docs/testing-strategy.md` · `e2e/COVERAGE.md` ·
`loop-constraints.md` · `.claude/skills/project-conventions/SKILL.md` ·
`.github/PULL_REQUEST_TEMPLATE.md`

Also: runbooks, onboarding, architecture diagrams, incident playbooks, support macros, privacy
and cookie notices, data maps, monitoring alerts and ownership registers.

**Rewrite, never silently delete.** Several of these are the only written record of *why* a
rule behaves as it does, and a workstream downstream may still need to read them. Seventeen
ADRs mention Shopify: an ADR is a dated decision and is never edited to match the present —
the ones whose premise has expired get a supersession line pointing at
[ADR 034](adr/034-the-catalogue-is-the-source.md) or
[ADR 036](adr/036-a-prohibition-in-prose-is-not-a-boundary.md).

---

## 5. The execution sequence

Not time-boxed phases. A strict dependency sequence, and no step advances while the current
condition is unproven.

| # | Step | State |
|---|---|---|
| 1 | Freeze new commerce-dependent changes, copy, synchronisation, payment configuration and checkout-assuming automations | **done** — nothing in the tree can add one without failing the gate |
| 2 | Baseline: file tree, manifest, route map, env inventory, deployment inventory, workflow inventory, public crawl | **done** — §2 |
| 3 | Commit the Commerce Elimination Contract and the dependency register | **done** |
| 4 | Add negative controls **before** removal — forbidden-reference scan, prohibited packages, route assertions, outgoing-host tests | **done** except outgoing-host interception (WS-C) |
| 5 | Redirect the interface away from commerce: navigation, routes, content model, metadata, structured data, legacy-path behaviour | routes **done**; nav and content model → WS-A + WS-B |
| 6 | Replace any remaining Shopify-fed rendering with the typed, company-controlled content layer | **done** — ADR 034 |
| 7 | Delete application code, API routes, packages, tests, fixtures and workflows that exist for commerce; rebuild from a clean checkout with **no** Shopify variables available | WS-A, WS-C |
| 8 | Remove external operational links: webhooks, apps, tokens, sales channels, payment integrations, automations, feeds, Vercel secrets | WS-F, WS-D |
| 9 | Run every gate in §6 until all pass | all |
| 10 | Archive only required historical records, record closure evidence, then downgrade/pause/close Shopify | WS-H, WS-F |
| 11 | Protect the boundary permanently: branch protection requires the deletion tests; code owners review the contract, the register and infrastructure; quarterly scans confirm commerce has not re-entered | WS-C |

**Step 4 before step 7 is the one ordering nobody may optimise away.** Negative controls exist
so that deleted capability cannot quietly return *during* the rewrite, which is the window in
which it is most likely to.

---

## 6. Verification gates

### 6.1 Repository gate — every pull request and `main`

| Check | Status |
|---|---|
| Recursive, case-insensitive forbidden-reference scan across tracked files | **live** — `verify-commerce-contract.mjs` |
| Narrow allowlist for historical migration documents only — **not** a broad "ignore docs" exemption | **live** — per-glob classes, each with a checked earning condition |
| Manifest **and lockfile** rejection of commerce SDKs, checkout, cart, payment, shipping, tax and feed packages | **live** — `auditPackages`, scoped names included |
| Route inventory: every permitted route returns its expected status, every forbidden route an intentional redirect or 410 | **live** — `commerce-route-inventory.test.ts` + `retired-routes.spec.ts` |
| Static types, lint, unit tests, production build, clean-install build | **live** |
| Bundle inspection: no commerce SDK, generated Storefront types, cart state, checkout code or payment library in client or server bundles | **gap — WS-C** |
| Secret scanning of changed files, plus targeted scanning of the default branch | **live** — `audit:secrets` walks every version of every workflow in git history |
| Content-schema validation: unapproved claims, missing evidence references, prohibited commerce fields, names outside the controlled vocabulary | **partial** — commerce fields enforced; evidence and vocabulary are WS-B |
| Accessibility: keyboard, semantics, labels, focus, contrast, alt text, reduced motion | **live** — `a11y.spec.ts`, `design-tokens-contrast.test.ts` |
| Link checking: broken legacy paths, canonical URLs, malformed redirects, external destinations | **partial** — internal covered; external is a gap |

### 6.2 Browser and API gate — clean preview, then production

| Check | Status |
|---|---|
| Crawl every public URL; assert no cart, checkout, account, price, discount, stock, delivery, payment or purchase control | **live** — `verify-browse-only.mjs` + `price-absence-contract` |
| Intercept network traffic; fail on any request to a commerce, payment, shipping or order host | **gap — WS-C.** The highest-value missing check: a `page.route()` interceptor in a Playwright fixture, failing the run on any request whose host matches the contract's identifier table |
| A fresh session creates no commerce cookie, storage key or service-worker entry | **gap — WS-G** |
| Permitted non-commerce forms reach only approved Company-controlled systems | **partial** — `contact.spec.ts`; consent and retention are WS-G |
| Old bookmarked commerce paths cannot recover a cart, order flow, discount, account or checkout through query parameters, cache, hydration or a service worker | **live** — 44 assertions, including `?discount=CODE` on a live page |
| Mobile-network performance: the removal must reduce JavaScript and backend overhead, not conceal it | **gap — WS-C** |
| Localised routes cannot reintroduce a prohibited statement | **not applicable yet** — English-only ([ADR 005](adr/005-english-only-storefront.md)); becomes live with WS-B's `marketEligibility` |

### 6.3 Infrastructure gate — the live platform, independent of the code

Every row is console-only and therefore WS-D or WS-E. **Live verification belongs in a
workflow, not in a session**: a GitHub Actions runner has egress a sandbox does not, runs on a
schedule nobody has to remember, and lands its verdict in an issue rather than a chat log.
That is what `control-audit.yml` already demonstrates.

- Enumerate Vercel environment variables across every environment; prove no commerce secret
  remains.
- Inspect deployment configuration, serverless and edge routes, redirects, image configuration
  and logs for commerce residue.
- Confirm every outbound runtime dependency against a controlled list.
- Confirm no active Shopify webhook targets the site and no workflow, route, automation
  platform or third party still expects Shopify events.
- Validate DNS and canonical host behaviour: `www` policy, HTTPS redirection, sitemap,
  `robots.txt`, Search Console.
- Verify CSP and `connect-src` have lost every former commerce origin.
- Purge or invalidate caches after deployment, then retest from a fresh browser session and a
  cold server route. Static caching otherwise masks removed behaviour.

### 6.4 Human governance gate

Technical correctness is not sufficient. The site must also preserve the brand's direct,
honest, unpressured model, and each of these is a person with a name.

| Reviewer | Verifies | Why a machine cannot |
|---|---|---|
| **Claims** | every material, corrosion and skin-safety statement against retained evidence, before publication | A schema can require an evidence reference. Only a person can say the evidence supports the claim. |
| **Brand** | material facts appear before lifestyle framing, and no page treats a visitor as a conversion target | "Reads as a funnel" is a judgement about tone. |
| **Operations** | the ambassador handoff works — QR links, cards, handles, contact route, location — without asking for unnecessary personal data | The failure is a card printed six months ago pointing at a dead URL. |
| **Privacy** | every form, CRM destination, analytics tool and capture mechanism against the Company-controlled-systems requirement | Lawful basis is not a property of code. |
| **Support** | what happens when somebody asks about a historical order, refund, customer record or discontinued checkout — clear, human, documented | A 410 page is an answer, not a process. |

[ADR 023](adr/023-the-last-link-is-a-person.md) is the frame: every tier here is code checked
by other code, and that chain cannot have a self-supporting bottom rung. This table is where
the regress stops, and naming it is what stops anyone pretending otherwise.

---

## 7. Definition of done

Complete only when every statement is true **and demonstrated by the check beside it**.

| # | Statement | Demonstrated by |
|---|---|---|
| 1 | A clean clone installs, builds, tests and deploys without commerce credentials, SDKs, endpoints, packages, generated types or fixtures | `verify` on a fresh checkout with no Shopify variables set |
| 2 | No production, preview or local runtime calls a commerce, payment, shipping, tax, inventory, cart, checkout, order, customer or discount service | Playwright network interception + Vercel runtime logs |
| 3 | No visitor can transact, build a cart, start checkout, view an account, or retrieve a price or stock offer through any legacy URL, cache, API or bundle | `retired-routes.spec.ts` + the browse-only smoke |
| 4 | Every legacy commerce path has a deliberate, tested outcome rather than a broken page or a misleading homepage redirect | §7 of the contract, asserted by status code |
| 5 | The scanner reports zero blocking findings and the register is empty | `pnpm verify:commerce-contract` |
| 6 | Factual, documented material content appears before styling; no unsupported skin-safety claim renders | WS-B's evidence union + the claims reviewer |
| 7 | Every form and analytics event routes only to an approved Company-controlled system with documented ownership, access, consent and retention | the privacy owner's recorded approval |
| 8 | Vercel, GitHub Actions, Shopify and every connected third party hold no active Shopify credential, webhook, catalogue job, checkout process or purchase-driven automation | `vercel env ls`, `audit:secrets`, the WS-F ledger |
| 9 | CI mechanically prevents prohibited code, packages, secrets, routes, hosts and content fields from returning | the `commerce-elimination-boundary` control, and its sentinel |
| 10 | Historical record retention, retrieval ownership and account decommissioning are documented and approved | `docs/shopify-decommission-inventory.md`, every row dated with evidence |
| 11 | The final site makes the brand moment more genuine, more honest and more human — not a thinner version of an online store | the brand and operations reviewers. **No check can answer this one, and pretending otherwise would be the exact failure this document is written against.** |

---

## 8. Where this plan diverges from the brief, and why

Recorded rather than silently resolved, because a plan that quietly overrides its brief is a
plan nobody can audit.

**1. `/account` redirects (308 → `/contact`); the brief asks for 410.**
The brief's principle is sound and is about redirecting a former purchase flow *to a
homepage*, which tells the visitor nothing. The test this repository applies instead is: *does
a destination exist that answers the visitor's actual question?* A login has one — the person
who replaces it. A checkout does not, which is why `/checkout` answers 410 and `/account` does
not. Same rule, different answers, and the rule is written down in contract §7.

**2. The brief says remove every "temporary compatibility adapter". Three routes look exactly
like one and are not.**
`/api/webhooks/shopify`, `/api/revalidate` and `/api/version` are held back deliberately. The
webhook route's deletion order is set in Shopify Admin, not here — removing it first triggers
Shopify's full retry backoff. `/api/version` is not a compatibility layer at all: it is the
stale-build detector, and that failure mode outlives the decommission. The brief's warning —
that a compatibility layer becomes permanent debt and can quietly preserve data exposure — is
why each of the three carries a register row with an owner rather than a comment saying
"temporary".

**3. The brief asks for a broad forbidden-string scan. This plan scans by position and class.**
A flat scan fails on `browse-only-copy.test.tsx`, which is the check that forbids the word,
and on seventeen ADRs recording decisions correctly. A guardrail that fails on its own
guardrails collects exemptions until it is quiet. The narrowing the brief actually asks for —
"a narrow allowlist for historical migration documents only, not a broad ignore-docs
exemption" — is met more strictly than a path allowlist would meet it: every class has an
earning condition that is itself checked, and `executable` is the default.

---

## 9. What this session could not verify, and why

Stated plainly, because an unstated limit reads as a clean bill of health.

| Claim | Verifiable here? | Why not |
|---|---|---|
| Repository state, CI history, route behaviour under a production build | **yes** | measured; §2 |
| The live site's HTML, headers and status codes | no | outbound egress is policy-restricted in this environment |
| Vercel project domains, environment variables, deployment targets | no | no dashboard or API access |
| The five-product Shopify delta | no | connector `needs_reconnect` |
| Whether the Storefront token still exists in Vercel or Shopify Admin | no | console-only |
| Whether any material claim is *true* | no | not a property of this repository |

The structural answer is already this repository's answer: every live claim that is currently
unverifiable should end up owned by a probe in `control-audit.yml`, which is what
`probe-canonical-domain.mjs` demonstrates and what WS-C extends.
