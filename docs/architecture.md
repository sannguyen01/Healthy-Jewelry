# Architecture

How the site is built, front end to back end, in one place. It is a **map**: each row points at the file,
test or ADR that holds the detail, and none of them is restated here. When this page and one of those
disagree, the code and its test are right and this page is the one to fix.

Written 2026-10-09 as the system-design pass over the whole repository ([ADR 053](adr/053-the-other-layers-and-the-tree-the-browser-reads.md)).
The failure modes are enumerated, and machine-reconciled, in [`failure-modes.md`](failure-modes.md); what
data leaves the origin is in [`data-flow-record.md`](data-flow-record.md); the tests and the gate are in
[`testing-strategy.md`](testing-strategy.md).

## 1. What this system is, and what it is not

A **browse-only catalogue** for a titanium and non-corrosion-metal jewellery brand. A visitor reads about
metals, looks at pieces, and writes to an ambassador. Nothing here can be bought: no cart, no checkout, no
account, no price, no stock figure, and that is a contract, not a description
([ADR 036](adr/036-a-prohibition-in-prose-is-not-a-boundary.md), `COMMERCE-ELIMINATION-CONTRACT.md`).

| Requirement | Target | How it is held |
|---|---|---|
| **Correct copy** | no claim renders that a named reviewer has not approved against a document | `src/content/claims/` registry, `claimText()`, `claim-lexicon.test.tsx`; every page re-renders within an hour so an expiry cannot outlive a deploy |
| **Fast, and up when everything else is down** | every content page prerendered and served from the CDN; no runtime dependency to read a page | static generation; the catalogue is JSON in the repository, not a service |
| **Private by construction** | no cookies, no identifiers, no third-party script, no egress from the browser except this origin | `Content-Security-Policy` (`connect-src 'self'`), `egress-canary.spec.ts`, consent gate for the one first-party beacon |
| **Accessible** | WCAG 2.1 AA, on every page and the states a visitor reaches | `e2e/a11y.spec.ts` (axe at every impact level, plus the browser's accessibility tree), `design-tokens-contrast.test.ts` |
| **Consistent** | one scale per design layer (type, colour, motion, layers, space, shape, breakpoints) | tokens in `globals.css`; `typography-*.test.ts`, `design-layers.test.ts`, `rendered-fonts.spec.ts` |
| **Safe to change** | a defect found once is made unable to recur | the merge gate (§8), sentinels that mutate the code and require a test to fail |
| **Cheap to run** | one Vercel project, one Upstash database, one Resend key | no database, no queue, no CMS |

**Constraints.** A team of one owner and an agent; Vercel as the platform; no payment, account or inventory
system, by decision; copy is the owner's and legal's, never the code's.

## 2. The system at a glance

```
                          BUILD TIME                                        REQUEST TIME
 ┌──────────────────────────────────────────────────┐      ┌─────────────────────────────────────────────────┐
 │ src/content/catalog/**  (17 pieces, 5 collections│      │ Browser ──▶ Vercel CDN ──▶ prerendered HTML/RSC │
 │ src/content/claims/**   (approved wording)       │      │               │        (revalidate ≤ 1 hour)    │
 │ src/lib/data/hj-data.ts (three metals)           │      │               ▼                                 │
 │            │                                     │      │   Route handlers (Node runtime, never Edge)     │
 │            ▼  Zod, at module load: a bad record  │      │   /api/contact ─▶ rate limit ─▶ Resend (email)  │
 │   src/lib/catalog/**  (the only reader)          │      │   /api/analytics ─▶ rate limit ─▶ log line      │
 │            │  fails the build (next.config.ts)   │      │   /api/health /api/version /api/sitemap         │
 │            ▼                                     │      │   /<retired family>/** ─▶ 308 (GET) or 410      │
 │   Server Components ─▶ HTML + RSC payload        │      │   /api/webhooks/shopify (legacy, to be removed) │
 │   (pages, components, JSON-LD, share cards)      │      │                                                 │
 └──────────────────────────────────────────────────┘      │ Upstash Redis ◀── rate-limit buckets (HMAC keys)│
                                                           └─────────────────────────────────────────────────┘
```

Two properties are worth keeping rather than treating as absences to fill: **nothing on the site holds
client state across a navigation** (no store, no cart, no session), and **nothing a page needs at request
time is a network call**. The only code that runs per request is a route handler.

## 3. Content and the one reader

| Layer | Where | Rule |
|---|---|---|
| Records | `src/content/catalog/products/*.json`, `collections/*.json`, `src/content/claims/claims.json` | reviewed JSON; the **only** product data source ([ADR 034](adr/034-the-catalogue-is-the-source.md)) |
| Schema | `src/lib/catalog/schema.ts`, `claims-schema.ts` (Zod) | validated when the module loads, so a malformed record **fails the build**; `next.config.ts` imports the reader to make that happen once per build and refuses an empty catalogue |
| Reader | `src/lib/catalog/**` | the only runtime access; `catalog-import-boundary.test.ts` fails, through the TypeScript compiler, on any other import of a raw record |
| Materials | `src/lib/data/hj-data.ts` | three metals' copy; not a catalogue (no handle, URL or photograph) |
| Claims | `claimText()` in `src/lib/catalog/claims.ts` | a claim renders its approved wording, or its neutral fallback; there is no third state |

**Why JSON in the repository and not a CMS or a store.** Seventeen pieces change a few times a month and
every change is reviewed; a service would add an outage, a credential and an egress for a catalogue that fits
in a pull request. The cost is that a non-developer cannot edit it, and that anything dynamic (stock, price)
is out of reach by construction, which for this site is a feature.

## 4. The front end

| Concern | Decision | Enforced by |
|---|---|---|
| Rendering | Server Components by default; `'use client'` only for what is interactive (the menu, the filter grid, the contact form, the consent notice) | review; `ProductCard` lost its client directive when its hover script became CSS |
| Pages | `src/app/**/page.tsx` own their `<main id="main">`, call `Nav` and `Footer`, and emit their own metadata and JSON-LD | `e2e/a11y.spec.ts` (every page has the skip link's target), `e2e/metadata.spec.ts` |
| Components | `layout/` chrome, `home/` the seven beats ([ADR 040](adr/040-seven-beats-one-strip.md)), `product/`, `ui/` atoms, `seo/`, `contact/`, `svg/` | `homepage-composition-contract.test.ts` |
| Styling | Tailwind v4 for the reset and utilities; the design system is CSS custom properties in `globals.css` | §4.1 |
| Imagery | local files through `next/image`; no `remotePatterns`; transparent lossless brand mark | `brand-mark-asset.test.ts`, `visual-assets.spec.ts` |
| Structured data | Organization and WebSite on the home page, Product and BreadcrumbList on pieces and listings, **no** `offers`, `price` or `availability` | `e2e/metadata.spec.ts`, `price-absence-contract.test.tsx` |
| Fonts | two self-hosted families, four static files, 70.6 KB preloaded | `font-files.test.ts`, `typography-weights.test.ts` ([ADR 052](adr/052-the-original-pair-on-the-quiet-archive.md)) |

### 4.1 The design system, layer by layer

Every layer has tokens, a rule that code uses them, and a test that fails when it does not. The pattern is
the same each time: **measure what is rendered, find the spread, collapse it to a scale, and make the
spread unwritable.**

| Layer | Tokens | Guard |
|---|---|---|
| Colour | `--bg` … `--on-dark`, `--error-text`; every one classified as text with a measured pairing, or as an accent that carries none | `design-tokens-contrast.test.ts`, `design-layers.test.ts` (no hex outside `:root`) |
| Type: faces and weights | `--font-display`, `--font-ui`, `--font-body`, `--font-brand` | `typography-weights.test.ts`, `rendered-fonts.spec.ts` (what Chrome drew) |
| Type: tracking | `--tracking-meta`, `-label`, `-display`, `-title`, `-name` | `typography-tracking.test.ts` |
| Type: size and leading | `--text-*`, `--leading-display`, `-snug`, `-text`, `-long` | `typography-scale.test.ts`, `rendered-fonts.spec.ts` |
| Motion | `--duration-fast`, `-base`, `-slow`; `--ease`, `--ease-sharp`; reduced motion collapses all of it | `design-layers.test.ts` |
| Layers and elevation | `--z-menu`, `-header`, `-consent`, `-skip`; `--shadow-float` | `design-layers.test.ts` |
| Space and shape | even-pixel spacing; `--radius-control`, `--radius-frame`; section rhythm in `.hj-band` | `design-layers.test.ts`, `layout-invariants.spec.ts` |
| Breakpoints | max 359, 600, 768, 900; min 769, 961 (media queries cannot read a property, so the set lives in the test) | `design-layers.test.ts`, `header-fit.spec.ts`, `responsive-sweep.spec.ts` |

### 4.2 Accessibility is measured in two places

`axe` reads the DOM's text. A screen reader is handed the browser's **accessibility tree**. They disagreed:
every piece link on the listing pages had no accessible name in the tree while axe passed all of them
([ADR 053](adr/053-the-other-layers-and-the-tree-the-browser-reads.md)). `e2e/a11y.spec.ts` therefore runs
axe on every page at every impact level, in the states a visitor reaches (menu open, contact form in error,
consent notice up and answered), **and** reads the tree through the protocol and fails on any link or control
with no name.

## 5. The back end

There is no application server and no database. The back end is six route handlers, a family of retired-route
handlers, and two managed services.

| Route | Method | Purpose | Abuse posture | Body | Response |
|---|---|---|---|---|---|
| `/api/contact` | POST | a visitor's message to the inbox, through Resend | 5 per hour per client; **`deny`** if the limiter cannot be asked, because an unmetered form costs money; cross-site posts refused before they cost anything | 8 KiB JSON, 32 KiB for the no-script form | `{ success: true }` or `{ error }`; `no-store` |
| `/api/analytics` | POST | first-party, consent-gated events, kept as a structured log line | 120 per minute; **`allow`** on limiter failure, because dropping a beacon costs the data and a 500 | 2 KiB; values limited to what the catalogue already publishes | always `204` |
| `/api/health` | GET | does Upstash answer, does the Resend key work (informational) | rate limited | none | `200` or `503`; `no-store` |
| `/api/version` | GET | the build fingerprint, for the stale-bundle comparison | none needed | none | JSON; `no-store` |
| `/api/sitemap` | GET | the sitemap, at the path `robots.txt` names | public | none | XML; cacheable an hour, stale-while-revalidate a day |
| `/api/webhooks/shopify` | POST | **legacy**: still receives a retired integration's events | HMAC signature, bounded body, shop allow-list | 1 MiB | `2xx` or `4xx/5xx`; to be removed after its subscriptions (`webhooks.md`, WS-F) |
| `/<cart, checkout, account, collections, policies, stones, crystals…>/**` | all | retired URL families | none | none | `308` for a GET that has a successor, `410` otherwise, for **every** method |

**Shared machinery, one copy each:** `createRateLimiter` and `clientIp` (`src/lib/utils/rateLimit.ts`,
Node-only, keys are HMACs of the client address), `readBoundedBody` (`src/lib/http/`), `goneResponse`
(the 410 document, which declares its own faces because it must render when the rest of the site does not).
Two shapes of error exist on purpose and are consumed by exactly one client each (`{ error }` by the contact
form, status codes by the beacon); a third would be a reason to write an envelope.

**Managed services.** Upstash Redis holds rate-limit buckets only. Resend sends one kind of mail. Neither is
needed to *read* the site.

## 6. Security boundary

| Control | Value | Held by |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`; `connect-src 'self'`; no `unsafe-eval`; `frame-ancestors 'none'`; `object-src 'none'`; `form-action 'self'` | `csp-contract.test.ts` |
| Other headers | HSTS (two years, preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| Image optimiser | no remote origin may put bytes through it | `images` has no `remotePatterns` |
| Secrets | none in the repository or the browser; presence and liveness reported by `/api/health` | `audit:secrets`, the credential inventory |
| Egress from the browser | this origin only | `egress-canary.spec.ts` |
| Egress from the server | named, and reconciled with the data-flow record | `server-egress.test.ts`, `data-flow-record.md` |
| Commerce | a contract parsed on every pull request | `verify:commerce-contract` |

## 7. Caching and freshness

| What | Policy | Why |
|---|---|---|
| Content pages | prerendered; `revalidate = 3600` on the root layout | every page prints a claim (the footer's positioning line) and an approval can expire with no commit; the bound is the longest a withdrawn claim stays served (`claim-expiry.test.ts`) |
| `/api/*` (except the sitemap) | `force-dynamic` or `no-store` | each exists to be written to or to report now |
| Fonts and brand marks | immutable, served as built | content-addressed by the build |
| Images | `next/image` optimiser, `webp` and `avif` | the E2E global setup (`e2e/global-setup.ts`, `e2e/support/imageVariants.ts`) asks for every variant once, serially, before a run, because the optimiser has stalled on a first cold request ([ADR 049](adr/049-a-wait-that-names-what-it-waits-for.md)) |

## 8. Delivery and the gate

```
 push ─▶ verify ───────────────┐  lint · type-check · manifest and lockfile integrity · commerce contract ·
         (about 2 minutes)     │  credential audit · unit tests (coverage gate) · production build ·
                               │  build-artifact scan · server-function trace scope
        dependency scope ──────┤  no smuggled major bump
        E2E (Playwright) ──────┤  both projects, against the artifact `verify` built
        production admission ──┘  the check a deploy to production is meant to wait for
 merge to main ─▶ Vercel builds and deploys; production-smoke.yml and control-audit.yml watch it afterwards
```

The gate is itself monitored (`scripts/probe-ci-liveness.mjs`, via `control-audit.yml`), and its controls are
mutated on purpose (`scripts/lib/sentinels.mjs`): a change is made to the code and a named test must go red,
or the control is a claim about a control ([ADR 018](adr/018-a-claim-about-a-control-is-not-a-control.md)).

## 9. Observability

| Question | Where it is answered |
|---|---|
| Which commit is this, and when was it built? | `<meta name="hj-build">` on every page; `/api/version` |
| Are the dependencies up? | `/api/health` (spends a real round trip on each) |
| What do visitors look at? | the structured log line `/api/analytics` writes; there is no other store |
| Did a deploy change what a visitor sees? | `production-smoke.yml`; `verify:browse-only` over HTTP |

## 10. Trade-offs, and what to revisit as it grows

| Decision | What it costs | Revisit when |
|---|---|---|
| Catalogue as reviewed JSON | no non-developer edits; nothing dynamic | the catalogue passes a few hundred pieces, or someone who is not a developer must publish |
| `script-src 'unsafe-inline'` | an injected inline script would run | a nonce becomes affordable: that forces every route to render per request, which gives up prerendering |
| Rate limiter falls back to a per-instance map when Upstash is unset | the effective limit is the limit times the instances | never silently: `/api/health` reports it; configure Upstash before launch |
| Analytics as a log line | no dashboard, no retention beyond the platform's | a question the log cannot answer; the change is one file plus the privacy page |
| Sitemap at `/api/sitemap` | non-standard path (`robots.txt` allows it explicitly, and names it) | moving it to `/sitemap.xml` costs the route inventory, contract and probes a coordinated change |
| One region, one provider | a Vercel incident is a site incident | the site must be reachable when the platform is not |
| Legacy Shopify webhook route | a retrying integration if the endpoint disappears first | its subscriptions are deleted in the platform console (WS-F) |
| Local E2E on a different Chromium than CI | the focus-indicator probe fails locally and passes on CI | the container's browser matches the pinned one |

## 11. How to extend it without drifting

1. **A new value** (a colour, a duration, a z-index, a size) is a token first, then a use; the guard in §4.1
   fails the other order.
2. **A new route** is a row in §5, a status in the route inventory (`commerce-route-inventory.test.ts`), a
   page that has `<main id="main">`, and a place in `e2e/a11y.spec.ts`'s page list.
3. **A new function that a page should render** needs a test on the *page's output*, not only on the function:
   `organizationJsonLd()` was unit-tested for weeks and rendered by nothing.
4. **A new enumeration** (a failure mode, a claim category, a token) is reconciled in both directions by a
   test, or it is not a registry ([ADR 019](adr/019-an-unclassified-entry-is-an-unverified-one.md)).
5. **A new claim** goes through `src/content/claims/` and `claimText()`; wording typed in a component fails
   `claim-lexicon.test.tsx`.
