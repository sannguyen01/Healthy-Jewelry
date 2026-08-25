# Testing strategy

This document exists because of a fair question: *do we actually need the E2E suite for the website to
be operational?*

**No.** Playwright never runs in production. Vercel serves the output of `next build`, and it will keep
serving it whether or not a single test has ever passed. The repository enforces no required status
checks today, so a red suite has never blocked a merge either.

That is also not the useful question. The useful one is what the suite is *for*, and what it costs.

---

## What each layer covers

| Layer | Command | Scope | Wall time |
|---|---|---|---|
| Lint | `pnpm lint` | ESLint + Next rules | ~10 s |
| Types | `pnpm type-check` | `tsc --noEmit`, strict | ~15 s |
| Unit | `pnpm exec vitest run` | `src/lib`, `src/store`, `src/config`, design tokens, and component behaviour under jsdom | ~12 s |
| Build | `pnpm build` | Prerender of all 45 routes | ~40 s |
| E2E | `pnpm e2e` | The rendered application in a real browser, desktop + mobile | ~3-5 min |
| Production smoke | `pnpm verify:production` · `pnpm verify:webhook` | The **real** store and the **live** deployment, plus the premise tier below | ~10 s |

`vitest.config.ts` scopes **coverage** to the business-logic layer on purpose, with the comment *"UI
components are verified via E2E"*. That single line is the whole argument: with coverage thresholds
deliberately not applied to the rendering layer, **E2E is the only automated coverage the UI has.**

### The production tier, and why it had to exist

Every layer above the last one runs against `mock.myshopify.com` (`ci.yml` declares the mock
credentials once, for both jobs). That is the correct design for a merge gate — hermetic, fast, and
impossible for someone else's outage to turn red — but it has a consequence worth stating plainly:

> **Until 2026-08-08, no automated test had ever touched the real store.** The suite proved the code
> was correct against a fiction.

Every commerce outage this project has had lived in exactly that blind spot, and none of them were
code defects the mock could have caught:

- 22 products published to Online Store and **0** to the headless channel, so the Storefront token saw
  an empty catalogue and every page silently served the static fallback;
- all 38 variants `availableForSale: false`, so a fully-correct store would still have sold nothing;
- prices rendered in USD by a store that charges VND.

`scripts/verify-production.mjs` closes that gap from the outside: it loads the live `/shop` page and
asserts it is serving Shopify rather than the fallback, that every product is still published to the
headless publication, and that a real `cartCreate` yields a real `checkoutUrl`.

The fallback/live discrimination is the load-bearing idea. The two catalogues are almost entirely
disjoint, so `dome-ring-titanium` on the live page is *proof of fallback* and `meridian-cuff` is *proof
of a real Storefront fetch*. That only holds while the lists stay disjoint —
`src/tests/unit/production-smoke-handles.test.ts` asserts the invariant against `hj-data.ts`, because a
discriminator that stops discriminating keeps passing while testing nothing.

Publication scope is asserted as *every product, no exceptions*, never as a count of 22. The way this
regresses is a new product added and not published, which a hardcoded number would happily pass once
the total moved on.

**It is deliberately not a merge gate.** `.github/workflows/production-smoke.yml` is a separate
workflow on a schedule plus `workflow_dispatch`, and branch protection must never require it: it is
*meant* to fail for reasons unrelated to the commit under review, and a Shopify incident must not
become a merge freeze.

**What it still cannot tell you:** whether a payment provider is active. Admin GraphQL's
`PaymentSettings` exposes only `supportedDigitalWallets` — there is no field for enabled providers, and
the alternative (`paymentGatewayNames` on an order) needs an order to exist. That one is human-only;
see `docs/go-live-runbook.md`. It does not stay human-only — see the premise tier below.

### The premise tier, and why it is deliberately non-blocking

Every layer above asserts **"the code still does X."** None asserted **"the premise behind X still
holds."** Five decisions were found resting on premises with no detector at all — the English-only
choice, the payments blocker, the Open Graph runtime tradeoff, the empty spec metafield, and a
collection-set assumption introduced by the change that fixed the soft-404. Full reasoning in
[ADR 008](adr/008-decisions-need-premise-detectors.md).

`scripts/lib/premise-checks.mjs` holds the evaluators; `scripts/verify-production.mjs` fetches the live
data and reports them in a section of their own.

**They never turn the run red.** A `vi` locale appearing is an opportunity, not an outage, and failing
on opportunity is how a suite becomes noise nobody reads. Drift writes `premise-drift.json`, and the
workflow opens or updates a **`premise-drift`** labelled issue — distinct from the `production-smoke`
failure issue — which closes again once every premise holds. Severity lives in the message: a premise
marked `blocking` (`COLLECTION-SET-DRIFT`, where customers are getting hard 404s) reads differently
from one marked `opportunity`.

Two properties are worth copying into any premise check added later:

- **Pure evaluator, network at the caller.** The drifted branch never runs locally, so it is the branch
  most likely to be wrong the day it fires — the same lesson as the completed-order cart path.
  `src/tests/unit/premise-checks.test.ts` exercises **both** states of every premise, 18 tests, with
  the false-positive cases (`frontpage`, `en-GB`) pinned explicitly.
- **A check may expire itself.** `SHOPIFY-PAYMENTS` is unverifiable only while `ordersCount` is 0;
  the first order makes `paymentGatewayNames` readable and the reminder becomes a real assertion.
  Human once, then automatic — better than a deadline nobody agreed to.

The tier ships **unproven against production**, like everything else in the production tier, because
`production-smoke` has still never executed.

### The source-analysis guardrails parse; they do not match

`metadata-data-source.test.ts`, `cache-tag-contract.test.ts` and
`homepage-fetch-budget.test.ts` all read application source to enforce a rule. They use the
**TypeScript compiler API** through `src/lib/analysis/tsAstScan.ts`, not regular
expressions.

That was not an aesthetic preference. The first two started as regex, were reviewed as
fragile with three specific evasions predicted, and when each was measured **two of the
three predictions were wrong and two real gaps had gone unnamed**: comments produced false
positives, `import * as hj` was invisible, and a second import of the same module in one
file was skipped because the code used `.match` rather than `.matchAll`.

The lesson is not that regex is fragile. It is that **nobody could say what those
guardrails covered** — confident predictions were wrong in both directions. A guardrail
whose coverage is unknowable makes a green run mean something unknown. `typescript` is
already a devDependency, so parsing cost no new packages. See
[ADR 007](adr/007-regex-guardrails-have-unknown-coverage.md).

Text matching is still right for non-code inputs: `audit-workflow-secrets.mjs` scans YAML
and strips comments by hand, which is correct — the argument is about parsing a language we
already ship a parser for.

### The homepage fetch budget

`homepage-fetch-budget.test.ts` pins the homepage at **four** Shopify fetches and asserts
no per-collection query. It previously issued eight — five of them one full collection
query per collection, to read five `svgType` values — so a sixth collection meant a ninth
query.

Worth being precise about the stakes, because the obvious reading is wrong twice over. The
homepage is **`○` Static**, prerendered with `revalidate: 3600`, so those queries run at
build and hourly revalidation, **never per request**. And server components call the
Storefront API directly, not through the rate-limited `/api/shopify` proxy — whose only
caller is `src/store/cart.tsx`. Homepage rendering therefore cannot consume the 60/min
per-IP budget. The guardrail exists because the *pattern* silently grows with the
catalogue, not because there is a live ceiling to hit.

### A fallback indistinguishable from the real thing is indistinguishable from a bug

The static catalogue exists so the site builds and serves without Shopify. That is load-bearing, and
`src/lib/shopify/env-check.ts` warns rather than throws specifically to protect it.

But it has a cost that took a second outage to see. The product page read Shopify in its body and
static `hj-data` in its `generateMetadata`, and because the two catalogues are nearly disjoint, 20 of
the 22 live products served `<title>Product Not Found</title>` from a page that rendered perfectly.
The Open Graph image, `generateStaticParams` and `/search` had the same split.

**No hermetic test could have caught any of it.** Unit tests run with no Shopify credentials; E2E runs
against `placeholder.myshopify.com`. Both are exactly the conditions under which the two data sources
return *the same thing*. The bug is only observable where the catalogues differ, which is production.

Two responses, and the second is the general one:

- `src/tests/unit/metadata-data-source.test.ts` forbids any route under `src/app/` from importing a
  product lookup out of `@/lib/data/hj-data`. Static data is the fallback, reachable only from behind
  `@/lib/shopify` — which already degrades on its own. A route reaching past that door is not "using
  the fallback", it is bypassing Shopify permanently.
- `scripts/verify-production.mjs` asserts the same properties against a **Shopify-only handle** on the
  live deployment, because that is the only place the two sources can disagree.

The same reasoning explains why `searchProducts` shipped broken in a subtler way: it returned `[]`
rather than the static catalogue when a Shopify call failed, alone among the fetchers. Empty renders
as a confident `No results` — a wrong answer that looks like a right one. It went unnoticed because
nothing called the function at all until `/search` was migrated onto it.

Removing it would not break the site. It would remove the only thing standing between a rendering
regression and production — which is exactly how the two defects below reached production in the first
place.

### What E2E has actually caught

- **A dead control.** The header search button rendered correctly, was keyboard-focusable, had a
  correct `aria-label`, and had no `onClick`. It shipped that way. No unit test could see it; the
  component rendered exactly as written.
- **WCAG AA contrast failures.** `--titanium` (#9DA7AF) is 2.25:1 on `--bg` — used as 10-12px body copy
  in nine places. Two were on the homepage, where axe found them.

Neither is a crash. Both are the kind of defect that quietly costs conversions.

---

## Gating policy

Two jobs, and the split is the point (`.github/workflows/ci.yml`):

- **`verify`** — lint, type-check, unit tests, production build. Roughly two minutes. **This is the
  merge gate.** If it is green, the change is safe to land.
- **`e2e`** — the full Playwright suite, both projects, on every PR. Blocking.

`e2e` is blocking *because* it is fast now. It previously took **24.2 minutes and had never once been
green**, which is not a gate — it is a notification everyone learned to ignore. A check that cannot be
satisfied does not protect anything.

If E2E is ever red and the change is genuinely urgent, merging is still possible: nothing in GitHub
prevents it. That should be a decision someone makes deliberately, not the default state.

### Cost, and a correction with security consequences

> **This section previously stated "The repository is private, so Actions minutes are billed."
> That was wrong in both halves.** Verified against the GitHub API on 2026-08-08:
> `private: false`, `visibility: "public"`, `allow_forking: true`.

Two things follow, and the second matters more than the first.

**Actions minutes are free.** GitHub does not bill Actions for public repositories, so the
numbers below are wall-clock time and developer-latency, not money. They are still worth
keeping — a 24-minute gate is a gate people learn to ignore — but no cost argument should
be made from them. The `production-smoke` tier runs every 6 hours precisely because that
costs nothing.

**The repository is public, so secret handling is a real constraint, not a formality.**
Repository secrets are readable by every workflow in the repo and by anyone with write
access, and the repo is forkable. GitHub withholds secrets from `pull_request` runs
triggered by forks, but `push`, `schedule` and `workflow_dispatch` runs get them in full.
`production-smoke.yml` therefore uses an **environment** (`production-readonly`) rather
than bare repository secrets, so the credential set carries a boundary that can hold
required reviewers and a branch allowlist. **That key is not a control on its own**:
GitHub auto-creates a named environment with no protection rules, and a job with an
`environment:` key still receives repository secrets, so a misconfiguration goes green
silently. `scripts/preflight-secrets.mjs` is what makes the difference observable — see
[ADR 006](adr/006-controls-must-fail-loudly.md). Its secrets are read-only by design: a
Storefront token (public-safe by construction, the same class already shipped to browsers),
a read-scoped Admin token used only for a publication count, and the webhook signing secret.

Anyone reasoning about exposure from the old sentence would have concluded the opposite of
the truth. That is the reason this correction is recorded rather than silently edited.

| | Before | After |
|---|---|---|
| E2E wall time | 24.2 min | ~3-5 min |
| Runner minutes per push | ~27 | ~7 |
| Superseded runs | ran to completion | cancelled |

Measured breakdown of a green run, so the next person optimising has real numbers rather than
guesses:

| Job | Step | Time |
|---|---|---|
| `verify` (1m51s) | install · lint · type-check · unit | 50s |
| | production build | 45s |
| `e2e` (4m15s) | setup · install · artifact download | 31s |
| | Playwright browser install | 27s |
| | test execution | 3m21s |

Three changes account for the drop from 24 minutes:

1. **Production server instead of `pnpm dev`.** `playwright.config.ts` used to launch a Turbopack dev
   server, which compiles each route on first request — with ~12 routes across two projects, that
   dominated the run. This is primarily a **correctness** fix: a dev server has different
   static-generation, RSC and image-optimisation behaviour from the artifact Vercel serves, so the old
   configuration tested a target that is never deployed.
2. **Parallelism.** `workers: 2` (runners are 4-vCPU) and `retries: 1` instead of 2 — a 30-second
   timeout used to cost 90 seconds before it was even reported.
3. **`concurrency: cancel-in-progress`.** PR #8 burned roughly 108 billable minutes across four pushes
   because every superseded run finished a 24-minute job nobody would read.

The build is produced once, in `verify`, and handed to `e2e` as an artifact, so E2E validates the exact
artifact the gate approved.

Two caches shave the fixed overhead further:

- **`~/.cache/ms-playwright`**, keyed on the Playwright version rather than the lockfile — browser
  binaries only change when Playwright does, so keying on the lockfile would discard a good 130MB
  download every time an unrelated dependency moved. On a hit the job still runs `install-deps`,
  because the OS packages the browser links against live outside any cacheable path.
- **`.next/cache`**, restored before the build and deliberately excluded from the uploaded artifact,
  so it speeds the build up without changing a byte of what E2E tests.

### Deliberately not done

- **Sharding E2E across runners.** It would take test execution from ~3m20s to under two minutes, but
  it buys wall-clock time with a second runner: billable minutes go from ~7 to ~10 per push. Worth
  revisiting if turnaround starts to hurt more than spend.
- **Running `e2e` in parallel with `verify`.** It would save about a minute, at the cost of the
  property that E2E tests the exact artifact the gate approved. A minute is not worth that guarantee.

### Branch protection

`main` requires both `verify` and `e2e` to pass. This is the part that makes the rest stick: before it,
a red suite was ignorable, and PRs #3 and #4 were both merged with CI failing — which is how three
defects reached production. Enabling it was only reasonable once a passing run existed to enforce
against.

PRs use GitHub auto-merge, so a change lands the moment its checks go green rather than waiting on
someone to notice.

---

## Running things locally

```bash
pnpm lint
pnpm type-check
pnpm exec vitest run
pnpm build

pnpm e2e                                    # full suite, both projects
pnpm e2e:ui                                 # interactive runner
pnpm exec playwright test e2e/a11y.spec.ts  # one file
pnpm exec playwright test -g "search"       # one test by name
```

`pnpm e2e` builds and starts a production server for you. Two environment variables adjust that:

- `PLAYWRIGHT_SKIP_BUILD=1` — start the existing `.next` instead of rebuilding. CI sets this after
  restoring the artifact. Do not set it locally unless you know your `.next` is current.
- `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome` — use a Chromium already on the machine. Sandboxed images
  and dev containers often pin a browser build that does not match the installed `@playwright/test`.

---

## Recorded exceptions

**Decorative ordinals are excluded from the axe contrast check.**
`src/components/home/MaterialsSection.tsx` renders oversized `01 / 02 / 03` numerals in `--ash`
(1.36:1 on `--bg`). They are deliberately faint, `aria-hidden="true"`, and convey nothing the adjacent
material heading does not. WCAG 1.4.3 exempts pure decoration from the contrast minimum.

axe cannot infer intent, so those nodes carry `data-decorative` and `e2e/a11y.spec.ts` excludes that
selector — a narrow attribute match, never a blanket `[aria-hidden="true"]` exclusion, which would also
hide genuine failures inside hidden subtrees.

This is written down so it stays a decision someone made, rather than a permanently red check.

---

## Design tokens and contrast

`src/tests/unit/design-tokens-contrast.test.ts` reads the palette straight out of
`src/app/globals.css` and asserts a WCAG 2.1 ratio for every documented text pairing.

A contrast ratio is arithmetic over two hex values — it does not need a browser and should not cost
one. Running it in the fast gate means a token regression fails in **milliseconds**, against *every*
documented pairing, rather than 25 minutes into E2E against whatever happens to be rendered on the four
pages the a11y spec visits.

`--titanium` is the accent token: borders, tints, fills, and text on dark surfaces (7.29:1 on `--ink`).
`--titanium-text` (#5E6870, 5.23:1 on `--bg`) is what carries titanium-toned text on light surfaces.
The test asserts that `--titanium` **fails** AA on `--bg`, so the reason the second token exists is
itself part of the contract.

---

## Adding tests

- **Logic, formatting, validation, store behaviour** → unit test. Cheapest, fastest, most precise.
- **Design tokens** → add the pairing to `design-tokens-contrast.test.ts`.
- **Something a user has to see or click** → E2E. Especially anything where "the element renders" and
  "the element works" can diverge: click handlers, opacity, layout at a breakpoint, focus order.

For visual assets specifically, `e2e/visual-assets.spec.ts` is the model. Presence is not visibility:
the tiles that started this whole effort were present, requested successfully, and invisible. Assert
that the bytes arrive (`naturalWidth > 0`), that the element occupies space, and that the **effective**
opacity — the product of the element's own and every ancestor's — clears the legibility floor.

### …and visibility is not legibility

`visual-assets.spec.ts` then passed on a mobile homepage where the hero showed only a rock wall with
the body copy lying on top of it, unreadable. Every assertion it makes was true. The photograph was
present, sized, and fully opaque — it was simply the wrong 25% of the frame, with text on it.

`e2e/hero-legibility.spec.ts` closes that gap, and it is the model for any composition where text
meets imagery:

- **A width matrix**, not two device presets. The hero's split layout was correct above ~866px and
  degraded continuously below it. Testing at 390px and 1280px would have found the failure; testing at
  1280px and 1440px would have missed it entirely. The matrix straddles the breakpoints that matter —
  and includes the *floor* of each layout mode, not just a width either side of the boundary. 901px
  is in the matrix because it is the narrowest width that still gets the split layout, and therefore
  the width at which every split-layout invariant is under the most pressure. It was for a while the
  one width never measured.
- **Geometry.** Where a scrim protects text, assert the text actually stays inside the opaque zone.
  The Hero's card is fully opaque and sized to wrap its own content, so the test checks direct
  containment against the scrim's rendered box rather than deriving a boundary from a published
  CSS variable — a prior version read a `--hj-hero-fade` custom property for a gradient-fade scrim
  model the component no longer uses; the property was deleted from the component but the test kept
  reading it, silently falling back to `0` in a way that happened to still pass. Direct containment
  has nothing to go stale.

  The transferable rule there is narrower than "never read a token from a test", and worth stating
  precisely, because reading the source of truth is what `design-tokens-contrast.test.ts` does on
  purpose rather than duplicating it. The defect was reading one **without asserting it resolved**:
  a deleted property parses to `NaN`, and a `NaN` that falls back to a permissive default turns a
  guardrail off in the one way nothing reports. So: derive a boundary directly where you can, and
  where a test must read a token, assert it parses to a sane value first — a missing token has to
  fail the test, never disable it.
- **A bound on the protection itself.** The scrim that makes the two checks above pass is sized by
  its own content, and both of those checks are satisfied *better* the larger it gets — so on their
  own they license the card growing until the photograph is decoration behind a floating memo, with
  everything green the whole way. A protection that can only grow is not a constraint. Assert the
  ceiling too, relative to whatever the scrim is protecting the text *from*: `hero-legibility.spec.ts`
  caps the card at `--hj-hero-card-max-ratio` of the photograph's own rendered box, as both a width
  ratio and an occluded-area ratio (area is the only one that catches a card that stays narrow but
  grows to full height). See [ADR 013](adr/013-a-protection-that-can-only-grow.md).
- **Rendered contrast.** For each text node, make its glyphs transparent, screenshot the element, and
  compute the *worst* contrast between the text colour and any pixel behind it. Worst, not average:
  averaging hides a light word sitting on one pale patch of an otherwise dark photo, which is exactly
  the failure worth catching.

### …and legibility is not composition

`hero-legibility.spec.ts` can be perfect while the page around it says the same thing three times.
Every homepage assertion before 2026-08-25 was a single-element existence check, and each passed no
matter what surrounded it — which is what per-component testing *is*, not an oversight in any one
spec. Measured consequence: deleting `<MaterialsSection />` from `page.tsx` left all twelve tests in
`homepage.spec.ts` green, because `page.getByText(/niobium/i).first()` matched the **hero eyebrow**
and the other two matched **product cards in the first scroll strip**. A homepage assertion that
never says *which section* cannot notice a section going missing.

`e2e/homepage-composition.spec.ts` is the model for whole-page properties. What makes a question
belong there rather than in a section's own spec is that **it cannot be answered from inside one
section**:

- **Sequence.** `CLAUDE.md`'s "Homepage Section Sequence" is a design decision, and prose-only
  decisions drift. The rendered order is asserted against it, and `homepage-fetch-budget.test.ts`
  asserts the source order, so the two disagreeing is itself a finding.
- **Distinctness.** The three scroll strips are one component with one layout, card, reveal and
  "View All" destination — their contents are the entire difference between them. Two of the third
  strip's four cards were products the visitor had already scrolled past, because the three lists
  were computed independently and never compared.
- **Truthfulness of a label.** The strip titled TITANIUM contained a 316L steel pendant and a niobium
  chain, each rendering its own contradicting material line. Every card was correct; only the
  relationship between a label and its contents was wrong.
- **Outline, not fragments.** Exactly one `h1`, and no skipped heading level across the whole page.

The general rule, and the reason this tier keeps earning its place: **a guardrail that gets greener
the more you add cannot see repetition.** Add a fourth identical strip and every existing homepage
assertion improves — more product links, more material names. Only a comparative question notices
that the fourth strip said nothing the first three had not. That is the same shape as
[ADR 013](adr/013-a-protection-that-can-only-grow.md), one level up: there it was a card that could
only grow, here it is a page that can only accumulate.

What this tier deliberately does **not** assert is whether the sequence is *good*. That is not a
property a test can hold. What it holds is the evidence a human needs to argue about it — that the
strips are distinct, the labels true, the order intended — so the creative question is settled
against real structure instead of a guess.

**axe cannot do this.** Its `color-contrast` rule reports *incomplete* rather than *violation* when
the backdrop is an image, because it has no way to know what the pixels are. Anything relying on axe
alone is unprotected the moment text is placed over a photograph.

Two things that took a debugging round each, and are commented in the spec so they don't take another:

- Use `locator.screenshot()`, never `page.screenshot({ clip })`. Under mobile emulation
  `boundingBox()` returns layout-viewport coordinates while `clip` resolves against the visual
  viewport, so at a fractional device pixel ratio the captured region drifts off the element and
  samples something else entirely.
- Collapse entrance animations with `reducedMotion: 'reduce'`. The hero staggers its children in, and
  a clip taken from a still-moving element lands where the element *was*. Waiting for opacity is not
  enough either — the effect applies its starting values after mount, so a naive check reports
  "settled" before the animation has begun.

---

## Checkout, currency, and configuration

Placing an order produced nothing — no confirmation screen, no payment step. Tracing it end to end
found six independent breaks, and the E2E suite reported the feature as working the whole time.

### Why the suite was green

`e2e/checkout.spec.ts` asserted only that clicking Checkout navigated *away from the product page*.
Its own comment conceded "or `/checkout` fallback when no store domain" — so the one outcome that
matters, landing on Shopify's hosted checkout, was never asserted, and the dead end was inside the
assertion's definition of success.

It now asserts the two outcomes that exist: on success the browser ends at the Shopify checkout URL
(payment happens there; the site never takes a card), and on failure the customer is told what
happened, in their language, with the bag intact. Shopify is reached through the `/api/shopify`
persisted-query proxy, so intercepting that single route drives the whole flow without credentials.

**The site sends no order confirmation, deliberately.** Shopify's own confirmation email *is* the
confirmation. A second email from us would arrive with worse data, no order status, and no way to stay
in sync with refunds or fulfilment.

### There is no confirmation screen either, and that is not the bug

The site hands off to Shopify's hosted checkout and the customer never returns. If nothing appears
after clicking Checkout, the redirect failed — the new error states name which of the causes below it
was, rather than spinning.

### Currency: the price quoted must be the price charged

Every price on the site was rendered as USD unconditionally — `formatPrice(price, 'USD')` in the card
and detail page, bare `$` template literals in the cart drawer, the cart page and the **homepage
strips**, and `priceCurrency: 'USD'` in the Product JSON-LD that feeds Google Shopping. Meanwhile
`mapShopifyProduct` discarded `priceRange.minVariantPrice.currencyCode`, so the real currency never
reached the UI to contradict any of it.

For a store selling in VND that means advertising "$89.00" and charging ₫ — a hundred-fold misquote,
shown at the moment a customer decides to buy and published to search engines before they arrive.

`HJProduct.currencyCode` now carries Shopify's currency through to every surface.
`src/tests/unit/currency-consistency.test.tsx` enforces it from both ends:

- **Behaviour** — a VND product must render `₫`, must not render `$`, and must render no decimal
  places, because dong has no minor unit. A USD product must still render `$`: a blanket swap would be
  as wrong as the hardcoded dollar it replaced.
- **Source** — no file outside the formatter may pass a currency literal to `formatPrice`, omit the
  currency argument, or print a currency symbol beside an interpolated price.

That second rule is what found the homepage strips. They never called `formatPrice` at all, so a check
that only inspected the formatter's arguments would have declared the site fixed while six surfaces
still said `$`.

**E2E assertions must not pin `$`.** `product-detail.spec.ts` and `shop.spec.ts` now match
`/[$€£₫]\s?[\d,]+/`. Pinning the dollar sign would turn those specs red the day a non-USD store
connects — failing for correct behaviour, which is the worst kind of failing test.

### Configuration traps that produce no error message

`src/lib/shopify/env-check.ts` prints these at build time when a variable is missing. It **warns, it
does not throw**: the static-fallback catalog exists so the site builds without Shopify, and a throw
would break local development and the architecture the check protects.

- **`NEXT_PUBLIC_*` is inlined at build time.** Setting `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` in Vercel
  does nothing to an already-built deployment, and a *redeploy* can reuse the cached build. It takes a
  **fresh build**. This is very likely why earlier attempts to "just set the env vars" appeared to
  change nothing.
- **Vercel scopes variables per environment.** Setting them for Production alone leaves every Preview
  deployment broken in exactly the same way, with no warning that the two differ.
- **Missing configuration is silent by design.** Because every fetch falls back to the static catalog,
  an unconfigured deployment builds clean, renders every page and reports healthy — right up until a
  customer clicks Checkout.

CI sets mock values for all four (`.github/workflows/ci.yml`) so the warning stays silent there. A log
that always prints "Shopify is not fully configured" trains everyone to ignore the one line that would
catch a genuinely unconfigured deploy.

### Webhooks

`orders/create` and `orders/paid` are logged without PII — id, name, total, currency, status, line
count. HMAC verification runs over the **raw body** before any `JSON.parse`, and returns 401 on
mismatch.

**Shopify retries, so duplicate deliveries are expected.** They are harmless here because the handler
only logs and revalidates. An in-memory dedupe map would not help: serverless invocations do not share
memory, which this repo already learned when the in-memory rate limiter was replaced with Upstash
Redis. If a future handler ever mutates state, dedupe must be durable.

### Known tradeoffs, recorded rather than silently accepted

- **Abandoned checkouts are not tracked.** `checkoutUrl` is only requested at sync time, so a bag
  abandoned before the customer clicks Checkout never appears in Shopify Admin. Fixing it costs a
  Shopify API call per add-to-cart and creates a real cart for every casual browse.
- **`svg:` tags now degrade rather than disappear.** An untagged product falls back to its
  *collection's* illustration, and an unrecognised tag does too. Previously an untagged product got
  `'ring-arc'` regardless, and an unrecognised one got nothing at all — see below.
- **The static catalog's variant IDs are placeholders.** `gid://shopify/ProductVariant/hj-001-default`
  is not a GID Shopify will accept; real ones are numeric. The store now refuses to sync a bag
  containing one rather than firing a mutation that is certain to fail, so tests of the success path
  must seed a realistic ID (see `seedBag` in `e2e/checkout.spec.ts`).

---

## The headless storefront, and the four failures with no error message

Next.js on Vercel renders the site; Shopify serves catalogue and checkout through a Storefront API
token. Four things must be true for an order to reach Shopify, and **none of them produces an error
anywhere when false** — the site builds, renders, and reports healthy in all four cases, because the
static fallback catalogue absorbs every one of them.

They are listed in the order they must be fixed. Each survives the fix below it, which is why fixing
them out of order looks like nothing changed.

### 1. Products must be published to the headless channel

This is the one that costs days. A Storefront API token is scoped to the app that issued it, and it
can only see products published to **that app's publication**. Publishing to the Online Store is not
enough and is not the same thing.

The live store had 22 products on Online Store and **0 on the headless channel**. Every Storefront
query returned an empty list, `getProducts()` fell back to the static catalogue, and the static
catalogue's placeholder variant IDs made `cartCreate` fail. The visible symptom — "online checkout is
temporarily unavailable" — is three layers away from the cause.

Confirm it, don't assume it:

```graphql
{ productsCount(query: "publication_ids:<HEADLESS_PUBLICATION_ID>") { count } }
```

If that count is lower than your total product count, nothing else in this section matters yet. Fix
with `publishablePublish`, and publish the **collections** too — collection queries fail identically
and independently.

### 2. Environment variables, in every environment, followed by a fresh build

Covered above. Worth repeating only that the store domain is the `*.myshopify.com` one Shopify
assigns, which is usually **not** a recognisable brand string.

### 3. Variants must be sellable

`inventoryQuantity: 0` with `tracked: true` and `inventoryPolicy: DENY` gives `availableForSale:
false`. The site handles this correctly — every product renders "Sold Out" and Add to Bag is disabled
— which means a fully-configured, fully-published store can still sell nothing, honestly and
silently. For made-to-order stock, `inventoryItem.tracked: false` makes variants permanently
sellable with no counts to maintain.

### 4. Webhooks must be registered

`orders/create` and `orders/paid` must point at `/api/webhooks/shopify`. HMAC verification has been
correct and waiting the whole time; with no subscription there is simply nothing to verify.

---

## Data integrity: the store's vocabulary is not the code's

Connecting Shopify does not just switch the data source — it switches the *vocabulary*. Three
defects were dormant behind the static catalogue and would all have gone live together.

**Tags are a translation layer, and translation failures are silent.** Shopify tags products
`material:steel`; the code's handle is `surgical-steel`. The old matcher looked for bare, exact
handles, matched nothing on any of the 22 products, and fell through to `?? 'titanium'`. Six niobium
and four steel pieces would each have claimed to be titanium — on a brand that exists so people with
metal sensitivities know what is against their skin. An unmatched tag is indistinguishable from an
absent one, which is why nothing complained.

`src/lib/shopify/tags.ts` now owns both translations, accepts the prefixed and bare forms, and
reports whether it matched so the caller can warn. `src/tests/unit/shopify-mapping.test.ts` asserts
it against **tag arrays captured verbatim from the live store**. That matters more than it sounds:
the previous tests used synthetic fixtures written in the code's own vocabulary, so they asserted the
mapper agreed with itself and passed throughout. A fixture that cannot disagree with you cannot catch
this class of bug.

**`JewelrySVG` must never return `null`.** It ended in `default: return null`, and two types its own
union declared — `charm-classic`, `charm-disc` — had no case at all, so the entire Charms collection
rendered empty boxes. The live catalogue then added nine products tagged with shapes the union never
contained (`svg:ring-halo`, `svg:charm-star`, …), and the mapper *cast* the tag straight to
`HJSvgType`. A tag anyone can type in Shopify Admin could blank out a product tile.

Three changes close it: `HJ_SVG_TYPES` is a runtime array with the type derived from it, so tests can
walk it; `parseSvgType` validates instead of casting and degrades to the collection's illustration;
and the `default` branch draws a visible mark that identifies itself, so
`src/tests/unit/svg-coverage.test.ts` can tell a real case from a silent fallback.

**Money is never a bare number.** `CartDrawer` rendered `{product.price}` — the raw string — so the
line item read "112.00" beside a total reading "$112.00". The currency guard missed it because that
line calls no formatter and prints no symbol: it is invisible to a rule that looks for *wrong*
formatting rather than *absent* formatting. `currency-consistency.test.tsx` gained a fourth clause
for exactly this shape, and the E2E cart assertion now checks both the line item and the total
(it previously matched one element and passed for that reason).

**Locale, not just currency.** `formatPrice` formatted everything as `en-US`, giving `₫1,450,000`,
while Shopify's own money format is `{{amount}}₫` and its checkout shows `1.450.000₫`. Same currency,
same amount, two shapes — shown at the moment a customer compares the site against the checkout.
Locale is now chosen per currency, and `formatPriceVND` is an alias rather than a second
implementation that knew better than the function everything actually calls.

---

## The purchase journey has an ending

Everything above concerns getting a customer *to* Shopify. This is about what happens after, and it
is the part with the worst failure mode in the whole system.

### Completed carts are deleted, and Shopify will not tell you they were

From Shopify's Cart API documentation, verbatim:

> **"Completed carts are deleted upon order creation.** Unlike the Checkout API, you can't query a
> completed cart for order information or completion status. You can subscribe to webhooks to receive
> information about the created order."

So a successful purchase and an expired cart are **indistinguishable** from the storefront: `cart(id:)`
returns null for both. The store collapsed both into "no cart" and silently rebuilt it from the local
lines, which meant a customer who had just paid returned to a bag still holding everything they had
bought, with a live Checkout button. **The failure mode is charging someone twice.**

Shopify offers no completion flag, so the discriminator has to be one we record: `pendingCheckoutCartId`
is written the instant a customer is sent to pay. On the next sync, a cart that is gone *and* matches
that id is an order — clear the bag, show the confirmation. A cart that is gone and does *not* match is
expiry — rebuild it silently, exactly as before.

**Both halves are load-bearing, and the second is the one at risk.** The obvious fix — treat every
missing cart as an order — would empty the bag of anyone whose cart merely expired.
`checkout-journey.test.ts` pins both, and reintroducing the old collapse turns 7 assertions red while
leaving the 9 expiry assertions green. That split *is* the specification.

`pendingCheckoutCartId` and `justCompleted` are in `partialize` on purpose: paying takes the customer
off this origin entirely and they return on a fresh page load, so anything held only in memory is gone
at exactly the moment it is needed.

**The site still sends no confirmation email.** Shopify's is the receipt. The on-site confirmation
claims nothing the storefront cannot know — no order number, no total, no delivery date — because it
genuinely does not have them.

### Money: Shopify is the source of truth, not `localStorage`

The bag persists the whole product, price included, with no expiry, and totals were summed from those
frozen numbers. A bag left open across a price change quoted the old price while Shopify charged the
new one.

`CART_FRAGMENT` had been fetching `cost.totalAmount` and every line's `merchandise.price` the entire
time; `ShopifyCartPayload` declared three fields and discarded the rest. The fix was reading what was
already on the wire. Every sync now adopts Shopify's line prices and total.

**This is the third time this project has shipped a price nothing guaranteed.** Hardcoded USD;
`{product.price}` rendered as a bare number; now a stale persisted price. Different mechanism each
time, same rule broken. If you are touching anything that renders money, assume you are about to be
the fourth.

### Failures now distinguish "try again" from "this cannot work"

`postShopify` ignored the HTTP status entirely, so a **503** from our own proxy — which is what it
returns when the *server-side* `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is missing while the public store
domain is set — arrived as "a body with no data", identical to Shopify refusing the cart. The customer
was shown "try again" and a button that could never work, forever. The client's only configuration
check is the public domain, which cannot see a server-side variable.

Status now maps explicitly: 503 → `not-configured` (no retry offered), 5xx/429 → `network`, other
non-2xx → `shopify-error`. Shopify also signals throttling **in band** — HTTP 200 with a `THROTTLED`
code in the GraphQL `errors` array, which the old transport dropped — so that is retried exactly once,
then reported.

A cart that comes back with fewer lines than were sent is `lines-unavailable`. That one names its cause
in the customer-facing copy, breaking the general rule, because a sold-out piece is the only failure
here the customer can resolve themselves.

### Two webhook secrets, and picking the wrong one is silent

An **app-created** webhook (Admin API `webhookSubscriptionCreate`) is signed with the **app's client
secret**. A webhook created in **Settings → Notifications** is signed with the **signing secret shown
on that page**. They are different values, and using the wrong one 401s every delivery forever with
nothing in any log to say why.

The route now logs which trap it is likely hitting on a signature mismatch. The *response* stays a bare
401 — a wrong secret and a forged request are indistinguishable from the signature alone — but the log
is actionable.

Related, and worth knowing before you conclude your webhooks are missing: the Admin API's
`webhookSubscriptions` query returns **only webhooks owned by the querying app**. Webhooks created in
the Admin UI are invisible to it. An empty result is not evidence they do not exist.

The endpoint also now allowlists topics (unhandled ones get `202`, which acknowledges receipt without
claiming work that never happened, and without retry-baiting Shopify) and rejects deliveries whose
`x-shopify-shop-domain` is not the configured store.

### `/api/shopify` is rate-limited

It is public and unauthenticated by necessity — the browser must reach it — and it spends the store's
Shopify API quota and creates real carts. It had no limiter, while `/api/contact` got one after a
security audit; the softer target was the one that costs money.

Both routes now share `src/lib/utils/rateLimit.ts`. ⚠️ **It is only durable if
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.** Without them it falls back to an
in-memory map, which on Vercel counts per Lambda instance — the exact single-instance weakness that
audit already corrected once. `RateLimiter.distributed` reports which mode is active rather than
leaving it to be assumed.

### Secrets and the client module graph

`config/site.ts` exported three `SHOPIFY_*` constants read from non-public env vars, and
`ContactForm.tsx` (`'use client'`) imports that file. Separately, `config/shopify.ts` — with getters
for the Storefront token, the Admin token and the revalidation secret — was imported by the cart
store, which is also a client module.

**Nothing leaked**: Next inlines non-`NEXT_PUBLIC_` env vars as `undefined` in client bundles. The
danger was that the only test on them asserted `typeof === 'string'`, which `''` satisfies — the code
looked covered while proving nothing, and one rename to `NEXT_PUBLIC_*` would have shipped a Storefront
token to every visitor with no test turning red.

The dead exports are gone, and `config/shopify-public.ts` now carries the browser-safe values so the
cart store never imports the server config. `secret-exposure.test.ts` walks the **real client import
graph** — following `'use client'` entry points through their imports, so a module is caught by being
*reachable*, not by lacking a directive. It also asserts the graph is non-empty first, because a broken
resolver would otherwise make every assertion vacuously true, which is precisely the failure this file
exists to prevent.

### The fallback is still there, and no longer quiet

An unconfigured deployment renders every page and returns 200 everywhere, which is why every failure in
this project stayed hidden so long. The fallback stays — a Shopify outage must not take the site down —
but `reportFallback()` now emits one structured `console.error` naming the fetcher, the reason, and
whether each credential is present. `error` rather than `warn`, because in Vercel's logs that is the
difference between a line nobody filters for and one that surfaces.
