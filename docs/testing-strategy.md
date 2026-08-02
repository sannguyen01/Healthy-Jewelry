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

`vitest.config.ts` scopes **coverage** to the business-logic layer on purpose, with the comment *"UI
components are verified via E2E"*. That single line is the whole argument: with coverage thresholds
deliberately not applied to the rendering layer, **E2E is the only automated coverage the UI has.**

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

### Cost

The repository is **private**, so Actions minutes are billed.

| | Before | After |
|---|---|---|
| E2E wall time | 24.2 min | ~3-5 min |
| Billable minutes per push | ~27 | ~7 |
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
  1280px and 1440px would have missed it entirely. The matrix straddles the breakpoints that matter.
- **Geometry.** Where a scrim protects text, assert the text actually stays inside the opaque zone.
  The Hero publishes its fade width as `--hj-hero-fade` so the test derives that boundary instead of
  hardcoding a number that would go stale the next time the gradient is retuned.
- **Rendered contrast.** For each text node, make its glyphs transparent, screenshot the element, and
  compute the *worst* contrast between the text colour and any pixel behind it. Worst, not average:
  averaging hides a light word sitting on one pale patch of an otherwise dark photo, which is exactly
  the failure worth catching.

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
- **The real catalog needs `svg:` tags.** Without them `src/lib/shopify/index.ts` falls back to
  matching the handle as a substring, and then to `'ring-arc'` — so an untagged product silently
  renders the wrong illustration.
- **The static catalog's variant IDs are placeholders.** `gid://shopify/ProductVariant/hj-001-default`
  is not a GID Shopify will accept; real ones are numeric. The store now refuses to sync a bag
  containing one rather than firing a mutation that is certain to fail, so tests of the success path
  must seed a realistic ID (see `seedBag` in `e2e/checkout.spec.ts`).
