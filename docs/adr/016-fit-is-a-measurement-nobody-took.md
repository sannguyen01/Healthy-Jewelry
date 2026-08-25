# 016 — Fit is a measurement nobody took

## Context

A production screenshot of a product page on a phone showed `ACCOUNT`, `BAG (4)` and a
truncated `MI…` running off the right edge of the viewport. `<header>` needed **414px** of
width to lay out with an empty bag and **435px** with one item in it — 40px of padding, a
182px brand lockup pinned at `flexShrink: 0`, and a 212px cluster of four text controls with
no shrink capacity anywhere. Every phone is narrower than both numbers. Measured overhang:
114px at 320px, 74px at 360px, 24px at 390px, 2px at 412px. The casualty was the MENU button,
which on a phone is the only route to navigation there is.

Three things in this repository could have caught it. None of them can, and the reasons are
worth writing down because they are properties of the tools rather than gaps in the coverage:

1. **`toBeVisible()` is a rendering predicate, not a containment predicate.**
   `navigation.spec.ts` asserts the menu toggle is visible at a 390px viewport. It passed —
   while `document.elementFromPoint()` at that same button's centre returned `null`.
2. **`.click()` routes around the failure by design.** Playwright picks an in-viewport point
   inside the element rather than its geometric centre, so the click test passed too. A thumb
   has neither affordance: 12 of the button's 37px were on screen.
3. **A `document.scrollWidth` guard would have been blind twice over.** The header is
   `position: fixed`, and fixed boxes do not contribute to the document's scrollable overflow;
   and `globals.css` sets `overflow-x: hidden` on `html` and `body`, which clamps `scrollWidth`
   to `clientWidth` regardless. Measured: `scrollWidth === innerWidth` at every width from
   320px to 1440px, including the ones where the header hung 114px past the edge. That
   `overflow-x: hidden` is also what turns this class of bug from a visible scrollbar into
   silent amputation.

This is the third instance of one shape. [ADR 013](013-a-protection-that-can-only-grow.md): the
hero card had no ceiling because every check was satisfied better the larger it got.
[ADR 014](014-monochrome-was-not-decided.md): the palette had no classification because nothing
asked what a colour was for. Here: the width the header requires is a function of the loaded
face, the letter-spacing, the length of the words `HEALTHY JEWELLERY` and `ACCOUNT`, and whether
the bag badge is showing — and it was compared against nothing at all. In each case a quantity
nobody measured was assumed to sit inside a bound nobody wrote down.

The diagnosis that came with the screenshot — that `Nav`'s 768px collapse disagrees with the
hero's 900px convention — is not the cause. The two breakpoints are each internally consistent,
and the overflow is present at 320px and gone at 414px, nowhere near either threshold. Worth
recording because it is the more attractive explanation: a breakpoint is a number in the source
that one can argue about, and the required width is a number that has to be measured.

## Decision

**A layout that can run out of room must say which part gives.** In the header the brand gives
and the controls do not: the brand link is `flex: 0 1 auto; min-width: 0` and the wordmark
ellipsises, while the control cluster is `flexShrink: 0`. A truncated wordmark costs a few
letters; a control pushed past the edge costs the visitor the only navigation they have.

**Search and Account move into the full-screen overlay below 769px**, where the primary links
already live. Account had never been in that overlay at all, so on a phone it was reachable only
through a 10.88px word crammed against the viewport edge.

**The pixel breakpoint stops being load-bearing for fit.** A measured collapse — `ResizeObserver`,
container queries — does not remove the guess, it relocates it and buys a hydration flash. What
removes the failure is making the layout shrink-safe by construction, after which the breakpoint
selects a *composition* rather than deciding whether the page works, which is all it was ever
meant to do.

**Fit invariants belong in the pre-deploy E2E tier, and are geometric.** `e2e/support/viewportFit.ts`
measures element boxes against `window.innerWidth`, never `scrollWidth`, and
`e2e/header-fit.spec.ts` reports the *narrowest width at which the header fits* — a binary search
per layout mode rather than a list of widths someone thought to enumerate. The number is recorded
as a test annotation on success as well as on failure.

**A verifier being dark is a finding in its own right.** `production-smoke.yml` has failed at
preflight for 30 consecutive scheduled runs (issue #24), so `verify-production.mjs` has not
executed since 2026-08-17. That is not why this shipped — nothing in that tier has ever looked at
how the live site *renders* — but the two facts were indistinguishable from outside, and that is
the problem: a job reporting *skipped* reads exactly like a job reporting *passed*. This is
[ADR 006](006-controls-must-fail-loudly.md)'s rule at job level rather than check level.

## Consequences

- The header now fits below 200px in both bag states, against a supported floor of 320px. The
  wordmark stays intact at every real device width; at exactly 320px with a non-empty bag it
  clips by 6px, which is the designed degradation rather than a tolerated defect.
- `hero-legibility.spec.ts` gives up its private `Box`/`intersection` to the shared module. Two
  specs asking geometric questions about the same rendered boxes should not carry two tolerances.
- The sweep is deliberately **not** a discontinuity detector. The hero recomposes at 900px and the
  nav collapses at 769px on purpose; a check that flagged layout changes would flag both. The
  shared invariant is width-*independent*: nothing a visitor must tap leaves the viewport.
- Binary search is only valid inside one layout mode, so `LAYOUT_SEGMENTS` bounds it at those two
  breakpoints and the sampled sweep is what establishes that monotonicity holds within each.
- **Tap-target size is still unmeasured.** The header controls are 26–37px against WCAG 2.5.5's
  44px. The new spec asserts reachability, not size; the size question is named here so it is not
  mistaken for something this change closed.
- **The workflow half is escalated, not implemented.** Making a skipped smoke job report as
  something other than success is a `.github/workflows/**` edit, which `gate.yaml` denylists.
  Named in the pull request for a human, alongside issue #24 and branch protection.

Referenced by: `src/components/layout/Nav.tsx`, `e2e/support/viewportFit.ts`,
`e2e/header-fit.spec.ts`, `e2e/hero-legibility.spec.ts`, `CLAUDE.md`, `STATE.md`.
