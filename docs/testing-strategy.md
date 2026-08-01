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
