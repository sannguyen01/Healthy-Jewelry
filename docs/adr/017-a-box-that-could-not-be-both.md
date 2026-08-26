# 017 — A box that could not be both

## Context

The product detail page's image tile carried two size declarations that cannot hold at the same
time:

```tsx
minHeight: '480px',
aspectRatio: '1 / 1',
```

`min-height` wins over `aspect-ratio`, and the ratio then derives the width from the height it won.
So the tile rendered **480 × 480 at every width**, regardless of the column it was placed in — a box
hanging **184px past a 320px viewport** and 114px past a 390px one. Not a squeezed layout: an image
a fifth of which was cut off.

Nothing reported it, and nothing could have. `globals.css` sets `overflow-x: hidden` on `html` and
`body`, so there was no scrollbar and no reflow. This is the same blindness
[ADR 016](016-fit-is-a-measurement-nobody-took.md) documents for the header, where
`document.documentElement.scrollWidth === window.innerWidth` at every width from 320 to 1440 while
the MENU button hung 114px past the edge. The tile was measured only after the header taught the
project to measure.

Two further things were true and unmeasured:

- **The tile had no ceiling either.** `products/[handle]/page.tsx` sets no `max-width`, so once
  `min-height` was removed the ratio would grow with the column without limit — 612px measured at
  1440px, and larger beyond. Removing a floor that behaved like a wall would have left a protection
  that can only grow, which [ADR 013](013-a-protection-that-can-only-grow.md) already names.
- **`svgScale` did not measure what it was named for.** Its docblock reads "how much of the tile the
  illustration fills". It sizes the `<svg>` element, and `preserveAspectRatio` then fits a
  coordinate space inside that element — so what reached the customer depended on how much empty air
  each viewBox happened to hold. One `svgScale="70%"` produced a **7× spread** in rendered area:
  33.4% of the tile for `ring-arc` against 4.8% for `earring-stud`. Across all 25 types the ink
  filled between 0.463 and 0.988 of its box's longer side, and much of that air was asymmetric
  (`earring-stud`: 9 units above the drawing, 34 below), so marks rendered visibly high in their
  tiles as well as inconsistently sized.

Every one of these was invisible for the same reason: the quantity that mattered was never
measured. `getBoundingClientRect()` on the `<svg>` reports a flat 49% fill for every product,
because it measures the element rather than the drawing.

All 22 SKUs on the connected store have zero media, so this is the branch **100% of product-page
traffic takes**, not a fallback.

## Decision

The tile's contract is stated in CSS, bounded on both sides, and asserted geometrically.

`--hj-product-tile-max` caps it; `aspect-ratio` alone shapes it; `min-height` is gone. The columns
and the breakpoint move to `globals.css` with the other `hj-` layout rules — the `!important` in the
component's injected `<style>` tag existed only to beat an inline value on the adjacent element, and
with that value gone both disappear, which also lets the two `sizes` hints stop describing a 900px
breakpoint the layout never had.

Each `viewBox` becomes the measured tight bounds of its own artwork, stroke included, plus a 2%
margin, held in `src/lib/svg/viewbox.ts` and read by `JewelrySVG`. With the ink filling its own
coordinate space, every mark gets the same **maximum extent** and sits centred, and `svgScale` means
what it says. Extent spread across the five ratio classes: **1.97× → 1.10×**.

Equal maximum extent rather than equal area, deliberately. A cuff bracelet is wide and flat and a
threader earring is long and thin; equalising area would stretch the threader absurdly. What must
not vary is how large each mark reads.

Scaling the element was the alternative and is unsafe: correcting `earring-stud` that way needs a
134% box, and because its ink is off-centre, growing the box pushes artwork out through
`.card-tile`'s `overflow: hidden` — where a breach is a silent crop, not a scrollbar. Re-centring
the coordinate space fixes placement and size in one move.

This reaches all six `JewelrySVG` surfaces rather than the detail page alone. Normalising one would
re-create precisely the drift `ProductImage` exists to prevent, described in its own docblock as
"four surfaces switching over while the fifth quietly keeps drawing a ring outline".

**This does not reopen [ADR 014](014-monochrome-was-not-decided.md).** Nothing here reads
`product.material`; the material-accent question keeps its trigger, which is photography coverage
moving off zero.

## Consequences

`e2e/product-image-fit.spec.ts` measures the tile and the ink drawn inside it across five products —
one per distinct viewBox ratio — at 320, 390, 768 and 1280. It asserts containment, squareness, the
cap, extent bounded **on both sides**, no clipping, the spread across ratios, and the buy control's
position. Run against the pre-change build it reports 11 failures naming the exact defects above; a
geometry test that passes before the fix is testing nothing, so that was checked rather than
assumed.

The probes measure ink, not element boxes, and throw when they find nothing — the discipline
`e2e/support/viewportFit.ts` already carries, because a probe that quietly reports "fine" because it
could not find its target is how `hero-legibility.spec.ts` once read a deleted custom property, got
`NaN`, and kept passing.

The bounds carry their provenance in comments, including the buy control's, which guards a
regression rather than expressing a target — if page copy legitimately grows past it, it should be
raised deliberately and for a stated reason, not to turn a red test green.

Marks change size across the whole storefront, not only on the detail page. `earring-stud` roughly
doubles, being the type whose box held the most air. That is the defect being corrected rather than
a side effect, but it is a visible change on the cards, the homepage strips and the collection
tiles, and it was reviewed as one.

What this ADR does **not** settle is whether 70% is the right fill, or 560px the right cap. Those
are now single numbers in named places with tests bracketing them, which is the whole difference
from the state it replaces: the previous values were not wrong choices, they were never choices.

This is the fourth instance of the shape ADRs 013, 014 and 016 describe — a quantity nobody measured
assumed to sit inside a bound nobody wrote down.
