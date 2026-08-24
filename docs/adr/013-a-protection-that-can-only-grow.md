# 013 — A protection that can only grow is not a constraint

## Context

The homepage hero has been rebuilt five times (`b1e5178`, `a4cfb9c`, `c55962a`, `c032532`,
`8788194`, then PR #34). The current model is the first one that removed a class of bug rather
than another instance of it: the copy sits in a fully opaque card sized to wrap its own content,
so there is no independently-measured width to drift out of sync with the text column — the
defect behind the first three of those commits.

What that rewrite did not do — could not do, because it is not a legibility question — is bound
the card. `.hj-hero-scrim` is a flex item with `flex-basis: auto`, so its width is whatever its
widest child needs, in practice the `<h1>` at `--text-hero`. Edit three words of the headline,
raise the type scale, or load a wider face, and the card grows with it.

Nothing objected, and the reason is structural rather than an oversight. Every guardrail on this
section asks *is the copy protected?* — `e2e/hero-legibility.spec.ts`'s containment check, its
rendered-contrast check, axe's incomplete verdict over imagery. **A larger card is a better answer
to all of them.** The one test that sounds like a counterweight, "the hero photograph shows a
usable portion of the frame", measures how much of the *source* survives `object-fit: cover`, not
how much of it a reader can see; a card covering 95% of a perfectly framed photo scores 100%
there. So the codified pressure on the card's size pointed in exactly one direction, and the
end state that direction leads to is a photograph that is decoration behind a floating memo, with
every check green the whole way.

The obvious fix — a bigger `max-width` in pixels — is what was already there
(`calc(720px + clamp(20px, 4vw, 64px) * 2)`, an 848px cap). It cannot express the rule. 848px is
a third of a 2560px photograph and 94% of a 901px one. A constraint about the relationship
between two boxes cannot be written as a constant about one of them.

## Decision

The hero copy card may occupy no more than `--hj-hero-card-max-ratio` of the photograph it sits
on, and that bound is expressed as a fraction of the photograph's own rendered box, not as a
length.

CSS enforces it structurally rather than by convention. The card's containing block *is* the hero
section and the photo is `inset: 0` of that same section, so `max-width: calc(var(--hj-hero-card-max-ratio) * 100%)`
is literally "this fraction of the photograph's rendered width", at any viewport and after any
image swap. One number, one place, no second geometry to keep in sync.

The test is not merely re-measuring the CSS. `max-width: calc(var(--missing) * 100%)` is invalid at
computed-value time, so deleting the token drops the property to its initial `none` and the card is
unbounded again — measured, and worse than it sounds: the cap is not binding today (463px of an
allowed 540px at 901px), so the card's rendered width does not move by a pixel at the moment the
ceiling disappears. A guardrail can be removed here with no visible symptom at all. `max-width`
also says nothing about height, so a card that stays narrow and grows downward is unconstrained by
CSS entirely.

`e2e/hero-legibility.spec.ts` therefore asserts it at every split-layout width, as both a width
ratio and an occluded-area ratio — area because it is the only one that would catch a card that stays narrow
but grows to the section's full height, which the containment check cannot see (it compares one
edge). The test reads the same custom property rather than duplicating the number, and asserts the
property parses before using it: the failure this ADR's own test history warns about is a
guardrail reading `--hj-hero-fade` after that property was deleted, resolving to NaN, falling back
to `0`, and continuing to pass. A token that goes missing must fail this test, never disable it.

The value is calibrated from measurement, not chosen. Measured 2026-08-24: `0.514` at the 901px
split-layout floor, decaying to `0.266` at 2560px as the card plateaus at 682px and the photograph
keeps growing. The ceiling is `0.60` — today's maximum rounded up with one step of headroom.

## Consequences

The cap does not silently reflow the headline. `--text-hero` carries no wrapping pressure and the
`<h1>` uses hard `<br>` breaks, so copy that outgrows the ceiling **overflows the card** onto the
photograph, and the existing rendered-contrast check fails at that width. Verified rather than
assumed: with the ceiling temporarily set to `0.40`, 901px fails with
`eyebrow (rgb(107, 103, 98), 11.88px/400) — worst 1.00:1, needs 4.5:1`. Silent card growth becomes
a red build, through a guardrail that was already there rather than a second one.

Worth recording which guardrail, because the obvious guess is wrong and it says something about
both. The **containment** check does *not* fire — it compares bounding boxes, and a block-level
`<h1>` inside a capped card has a box that stops at the card's edge no matter how far its glyphs
spill past it. Only the pixel-sampling contrast check sees the overflow. Box geometry and rendered
pixels fail in different places, which is precisely why this file runs both, and why the new ratio
assertion measures boxes while the safety net underneath it measures pixels.

`e2e/hero-legibility.spec.ts`'s width matrix gains 901px. Split layout was previously exercised at
only two of the six widths it then had, with nothing between 768 and 1024 — so the width at which this ratio is
tightest, and at which every other split-layout invariant is under the most pressure, was the one
width never measured.

This is a floor under the composition, not a decision about it. Whether an opaque card is the
right creative answer at all — as against typography integrated into the photograph, which is what
this brand's positioning would normally reach for — is a live question and deliberately not
settled here. The ceiling exists so that question can be answered on its own timeline instead of
being foreclosed by drift.
