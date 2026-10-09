# ADR 053 — The other layers, and the tree the browser reads

**Date**: 2026-10-09
**Status**: Accepted. The owner asked for "systemic consistency and multilayered alignment for exceptional website
aesthetics and functionality, from front-end to backend, and the overall architecture", with an accessibility
review, a `CLAUDE.md` review and a system-design pass. It extends [ADR 052](052-the-original-pair-on-the-quiet-archive.md)'s
method (measure what is rendered, collapse the spread to a scale, make the spread unwritable) from type to every
other layer, and adds the one measurement type had not needed: the browser's **accessibility tree**.

## Context

The type system was one scale. Nothing else had been asked the same question. Read off the rendered and served site,
and out of the source, the spread was this:

| Layer | The spread | Why it mattered |
|---|---|---|
| Accessibility tree | every piece link on `/shop`, the collection pages and `/search` had **no accessible name** | a screen reader announced "link" for each piece; `axe` reported nothing |
| Structured data | `organizationJsonLd()` and `webSiteJsonLd()` were written and unit-tested; **no page rendered them** | the Organization logo "fix" of 2026-10-04 corrected a function nothing called |
| Components | two badge implementations with two looks; `GhostButton` unused beside `.btn-ghost`; a `sale` variant no record can carry | the same word looked one way on the home page and another on `/shop` |
| Colour | an error red typed as a hex; badge tints typed as the RGB of a token; a shadow typed `rgba(0,0,0,…)` | no contrast test knew the red was a colour; a palette change would have left the tints behind |
| Motion | twenty-two durations typed in seconds beside `--duration-fast`, `-base` and `-slow`; easing as keywords | the tokens existed and were used by a minority |
| Layers | z-index typed as 89, 90 and 94 | the order of menu, header and notice lived nowhere |
| Space and breakpoints | five odd-pixel paddings; a piece page that switched at 768px beside a header that switches at 769px | an iPad held upright (768 wide) got one layout from each |
| Robots | `Disallow: /api/` and a sitemap at `/api/sitemap` | the sitemap is under a path the file disallows |
| Accessibility, other | no skip link (2.4.1); two sideways tables unreachable by keyboard (2.1.1); form fields with no purpose (1.3.5); errors unannounced and focus left on the button (3.3.1, 4.1.3); no `<h1>` on search; a 404 with no landmarks and the home page's title; decorative numerals failing axe contrast on four routes | each is a WCAG 2.1 AA criterion, and a first-time visitor on a keyboard or a screen reader met most of them |

## Decision

**1. The accessibility tree is measured, not inferred from the DOM.** `e2e/a11y.spec.ts` reads
`Accessibility.getFullAXTree` through the protocol and fails on any link or control with no name, on every page. It
also runs `axe` on every page route, at every impact level, with the consent notice up and answered, and in the
states a visitor reaches (menu open, contact form in error). The listing card is a `<div>` inside the link, not an
`<article>`: Chrome builds no link name through an `article`. The hover specification is `aria-hidden` (it is a duplicate
of what the piece page prints and, first in the DOM, it made every name begin with a measurement) and is revealed by
CSS for a pointer and for keyboard focus alike, which is why `ProductCard` is no longer a client component.

**2. A function is not a feature; the page's output is.** The home page renders Organization and WebSite structured
data, and `e2e/metadata.spec.ts` reads the served page for both, and for the absence of `offers`, `price` and
`availability`.

**3. One of each thing.** One badge (`ProductBadge`, the `.badge` chip, opaque so its label's contrast is a property of
the chip and not of whatever is behind it, a tile today and a photograph the day a piece has one). `ui/Badge` and
`GhostButton` are deleted, with the `sale` variant. `CampaignBand` stays: ADR 051 holds it with a sentinel, and its claim
record belongs to legal review, which is not a reason to delete it from the code here.

**4. Every other layer is a token, and a test says so.** `design-layers.test.ts`:

| Layer | Rule | Tokens |
|---|---|---|
| Colour | no hex or `rgb()` outside the `:root` block, and none in a component (named exceptions: the placeholder illustrations, `themeColor`, held equal to `--bg`) | `--error-text` is new and classified |
| Motion | a `transition` or `animation` names a `--duration-*` step and `--ease` or `--ease-sharp`, never a time or an easing keyword | existing three |
| Layers | a `z-index` is a `--z-*` token, or a small local number | `--z-menu`, `-header`, `-consent`, `-skip`, ordered the way a visitor meets them |
| Elevation | a shadow is a token | `--shadow-float`, derived from `--ink` with `color-mix` |
| Space | padding, margin and gap move in even pixels | none: the grid is the rule |
| Shape | a corner is `--radius-control`, `--radius-frame`, none or a circle | existing |
| Breakpoints | max 359, 600, 768, 900; min 769, 961 (media queries cannot read a property, so the set lives in the test) | none |

The piece page's two-column layout now begins at 769px, like every other desktop layout, so no width is in both a
phone layout and a desktop one.

**5. The rest of the accessibility findings are fixed where they were found:** a skip link as the first stop of every
page and `id="main"` on every `<main>`; `role="region"`, a name and a tab stop on the two scrolling tables; `autocomplete`
on the contact fields, `role="alert"` on the errors and `role="status"` on the success, focus to the first invalid
field; a visible `<h1>` on search (`PageHeader`); the header, the footer and a title of its own on the 404; and the
decorative numerals drawn as generated content (`.hj-ghost-numeral`, `content: attr(data-numeral) / ""`) so they are not
text at all. WCAG exempts decoration, but a scanner cannot know a span is decoration, and the old fix was an exclusion in
the scanner: an escape hatch nothing else uses is one a failure can hide in.

**6. `robots.txt` allows the sitemap it names** (`Allow: /api/sitemap`, the longer rule wins). Moving the sitemap to
`/sitemap.xml` would touch the route inventory, the commerce contract and the probes, and is left to a change that owns
all three.

**7. `docs/architecture.md`** is the map of the whole system, front end to back end: requirements, components, data
flow, the API table, the security boundary, caching, delivery, trade-offs and what to revisit.

## Consequences

| Guard | What it now holds |
|---|---|
| `src/tests/unit/design-layers.test.ts` (new) | colour, motion, layers, elevation, space, shape and breakpoints, each shown to fail on the previous tree (eight of fourteen assertions) |
| `src/tests/unit/page-landmarks.test.ts` (new) | every route has one `<main>`, and it is `#main`, the skip link's target; a Suspense fallback is not a second one (the `/search` fallback was, so while results streamed the document had two main landmarks and two ids) |
| `src/tests/support/styleScan.ts` (new) | the source-scanning helpers `design-layers`, `typography-tracking` and `typography-scale` share |
| `e2e/a11y.spec.ts` (rewritten) | every page, any impact, both projects; the menu and the contact form in error; **the tree's names**; the skip link; one `<h1>` per page; the 404's landmarks |
| `e2e/metadata.spec.ts` | Organization and WebSite on the served home page, and no price in them |
| `src/tests/unit/design-tokens-contrast.test.ts` | the badge's composited-tint assertions are replaced by an assertion that the chip is opaque and its labels clear 4.5:1 on `--bg`; `--error-text` has three pairings |

**What it found on the way, and fixed.** The new guards did not wait for CI. A full run on the first draft failed 22
tests: sixteen specs selected `article`, which the card no longer is; the footer's "Measurement preferences" control came
out 42px high on a phone, because its target was padding round a line box and the type and the leading had moved onto
their scales (it is now `min-height: 44px`, a declaration and not a consequence); and one mobile drawer probe failed once
under full-suite load and passed twelve of twelve in isolation. The `visible focus indicators` probe fails locally on
roughly two attempts in three **on the previous commit as well** (measured: 22 of 32 against 20 of 32, retries off) and
passes in CI; it is the local browser, not these changes.

## What this does not do

- It does not move the sitemap, add a nonce to the CSP (`'unsafe-inline'` scripts stay, because a nonce ends
  prerendering), or remove the legacy Shopify webhook route (the owner's WS-F ordering).
- It does not migrate the placeholder illustrations' greys to tokens; the file is a named exception until pieces have
  photographs.
- It does not draw an arrow on closed `<select>`s (the sort control and the contact form's subject): observed, left.
- It does not build the catalogue and piece pages of ADR 051's plan (B5) or `DESIGN.md`'s rewrite (B6).
