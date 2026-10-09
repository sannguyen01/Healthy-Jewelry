# ADR 044 — Decided from the language, not the page

**Date**: 2026-10-04
**Status**: Accepted. The ruling that the live storefront need not be reached is the owner's
("no need to access the website", 2026-10-04); the three decisions under it are engineering
decisions taken against the verified language in `DESIGN.md`, each with its own enforcement.

## Context

ADR 043 aligned the typeface and the case of names with Songmont from verified sources. Three
dimensions were left open because they could only be measured from songmontofficial.com, which
the build environment's network policy denies: the font the US storefront serves for Latin text,
the header's proportions, and image crops. `DESIGN.md` listed them as "not verified", with the
current header and a 1:1 product crop standing in. The owner ruled that the site need not be
reached. That changes what the three are — design decisions to be made from the language — not
what can be claimed about them: none is a measurement of Songmont's pages, and none is recorded
as one.

## Decision

- **Latin font: the one family.** The verified principle is a single family for the whole
  identity. A second face for Latin text would break the one thing that is known, so Zen Kaku
  Gothic Antique sets every role, as ADR 043 already made it.
- **Listing crop: 3:4 portrait.** `--ratio-product` moves from `1 / 1` to `3 / 4` for product
  cards on `/shop`, the collection pages, search and the homepage strip. Three reasons, each
  checkable:
  - *One crop through the homepage.* The collection and material tiles were already 3:4; the
    strip of product cards between them was the one square row.
  - *The illustrations are mostly tall.* Each draws into a 65% × 65% box of its tile, kept at its
    own `viewBox` proportion (`src/lib/svg/viewbox.ts`). Eight of the seventeen are taller than
    wide, and in a square tile their height bound made them the smallest pieces on the page. At
    3:4 those eight draw 1.04–1.33x larger (linear), the other nine draw at exactly the same size,
    and none draws smaller — a 1.12x geometric-mean gain at no cost to any piece.
  - *Portrait is the frame of the verified photographic direction:* pieces worn, with cream,
    beige and tan linen against soft grounds.
- **The product detail tile stays square** ([ADR 017](017-a-box-that-could-not-be-both.md)). At
  3:4 its 560px cap would make it 747px tall, more than the 708px a 900px-high window leaves below
  the header and the page's top spacing.
- **Header: kept.** Centred knot-and-name lockup, two quiet text controls each side, a flat fill
  with a hairline once scrolled, 44px targets. The verified register is restraint — tonal,
  typographic, nothing laid over content — and the composition already says only that.
- **Photography is not imitated.** The verified direction describes images the site does not
  have. The hero photograph stays until the owner replaces it; no filter is laid over it to
  approximate a palette.

## Consequences

- `design-consistency.test.ts` holds the product token and the two homepage tile crops to one
  value (seen to fail with the token set back to `1 / 1`). `layout-invariants.spec.ts` reads the
  crop from `--ratio-product` instead of asserting square, so the next change to the token is one
  line, not a hunt through specs.
- `DESIGN.md`'s "not verified" list becomes "decided from the language, not measured from the
  page", with each decision's reason and enforcer. If the live page is ever read, these are the
  three rows to check first.
- Open for the owner: photography in the verified direction.
