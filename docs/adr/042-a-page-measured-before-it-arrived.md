# ADR 042 — A page measured before it arrived

**Date**: 2026-10-04
**Status**: Accepted.

## Context

The header-fit probes measured the header right after `page.goto`, and in about one cold load
in forty there was no header to measure. The page arrives as the root `loading.tsx` fallback
plus a `<div hidden id="S:0">` holding the real content; an inline script swaps them, but React
batches reveals, and the swap landed ~250ms after the load event `goto` waits for. Until then
`document.querySelector('header')` found the copy inside the hidden segment: every box zero, so
nothing reached past the viewport, so `offendersPastViewport` reported a header that fits.

Nothing failed. It was found because a new probe — the brand lockup's — refused to measure a
lockup with no neighbours and threw, intermittently, on the mobile project. The existing probes
had been passing on the same frames for as long as the root loading boundary has existed.

## Decision

- `settle()` waits for every streamed segment to be revealed before its double
  `requestAnimationFrame`, inside the one `evaluate` it already made — a polled
  `waitForFunction` per width added a round trip that, in two runs of eight, stalled a 141-width
  sweep past its 30-second budget.
- `offendersPastViewport` throws on a root with no box instead of reporting that nothing
  overflows. A probe that cannot see what it measures must fail, the rule this file already
  stated for a root that does not exist.

## Consequences

- Header-fit: 8 of 8 full runs green after the change, the mobile sweep at 12.0–13.6s; the
  original intermittent failure 0 of 10.
- A user-facing finding, recorded for W5 rather than fixed here: a statically prerendered
  homepage still paints "LOADING" first on some cold loads, which is first-paint and LCP cost.
  Whether the root `loading.tsx` earns its place is a performance decision, with a measurement.
