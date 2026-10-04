# ADR 041 — A transparent logo is a measurement

**Date**: 2026-10-04
**Status**: Accepted. The four product decisions below are the owner's, made on 2026-10-04
against a design canvas of the header and footer at desktop and phone widths.

## Context

The owner believed the knot logo was in the header and the footer. It was in neither. The
pre-redesign header rendered `/logo.png` beside the name (2067624); the redesign replaced it
with a text wordmark, the footer never had it, and every test passed, because no test asked
whether a mark was there — only whether the images that *were* there rendered.

Asked to make sure the logo was transparent, the obvious check passed: the master's background
is α=0 across 73% of its 2560² pixels. The defect was at the edge. Its 146,669 partially
transparent pixels had been keyed out of black and kept black's colour in proportion to their
transparency — premultiplied against black, so stored luminance rose linearly with alpha. On
`--bg` that composites to a grey ring around the whole knot, visible in the owner's own
screenshot. Measured on the 512px derivative: the faint edge (α < 50%) averages 48.4 with the
matte, 157.6 without; the composited rim 189.3 against 202.0. At the header's 30px raster the
same comparison is 157 against 172 — a hairline, which is why nobody saw it at that size.

The brand was also spelled two ways on the same page: "HEALTHY JEWELLERY" in the header,
"Healthy Jewelry" in the footer beneath it, the page titles, the share cards and the 410 pages'
paragraphs. Each surface had been typed by hand.

## Decision

- **The served mark is derived, never exported.** `scripts/build-brand-mark.mjs` reads the
  master (`assets/brand/knot-master.png`, moved out of `public/`), un-premultiplies every edge
  pixel (F = C / α), crops to the artwork so a rendered size is the visible size, and
  area-averages down to `public/brand/knot-silver.png` (512²) and the two icons. Pure
  JavaScript on `pngjs`, which the repository already had: deterministic to the pixel, no new
  dependency.
- **Silver on light surfaces** (owner). The ink name beside it carries the lockup's contrast; the
  silver is a graphic, never a text colour. A graphite recolour was offered and declined.
- **"Healthy Jewellery"** (owner), spelled as the domain is, held in `SITE_NAME`. The registered
  company name stays `LEGAL_ENTITY_NAME` ("Healthy Jewelry") on the legal pages and the footer's
  copyright line until counsel says otherwise: a registration is a fact, not a style.
- **Below 360px the header shows the mark alone** (owner). Measured, the whole name fits from
  320px but with under 8px of air beside MENU and Search, where the controls keep 24px between
  themselves; with that spacing it fits from 353px. 360 is the first common width above it.
- **The knot is the browser-tab icon, the home-screen icon and the Organization logo** (owner).
  The icons put it on a `--black` tile: bare silver is near-invisible on a light tab strip at
  16px, and iOS fills transparency with black anyway. The placeholder `favicon.svg` (a double
  circle no page linked) is deleted.

## Consequences

- `brand-mark-asset.test.ts` re-derives every file from the master and compares pixels, asserts
  the edge metrics above with thresholds between the clean and the matted file, and proves it can
  fail by running the pipeline with the un-premultiply left out.
- `brand-name.test.ts` fails on a typed copy of *either* spelling in rendered code, outside the
  held legal pages it lists with reasons.
- `header-fit.spec.ts` asserts the name is whole or absent at all 141 widths — never cut off,
  never crowding a control — and prints the measured breakpoint headroom on every run.
  `visual-assets.spec.ts` asserts one mark in the header and one in the footer, so the next
  silent removal fails.
- Open, for counsel: the legal entity's spelling. For the claims reviewer: the pending
  `faq-continuous-wear` wording says "your Healthy Jewelry".
