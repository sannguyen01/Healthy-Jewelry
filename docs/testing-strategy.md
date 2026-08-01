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

Three changes account for it:

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
