# 021 — A metric that only ever passes more easily in one direction is not a constraint

## Context

[ADR 013](013-a-protection-that-can-only-grow.md) found that every guardrail on the hero copy
card was satisfied *better* the larger the card grew — its containment check, its
rendered-contrast check, axe's verdict over imagery. A larger card is a better answer to all of
them. The one test that sounded like a counterweight, "the hero photograph shows a usable
portion of the frame", measures how much of the *source* survives `object-fit: cover`, not how
much of it a reader can see: a card covering 95% of a perfectly framed photo scores 100% there.

So the codified pressure on that card's size pointed in exactly one direction, and the end state
that direction leads to is a photograph that is decoration behind a floating memo, with every
check green the whole way. Five rebuilds went by.

[ADR 017](017-a-box-that-could-not-be-both.md) found the same asymmetry in a sharper form four
weeks later. `min-height: 480px` and `aspect-ratio: 1 / 1` on one element is not a floor plus a
ratio, it is two competing authorities: the minimum wins, the ratio derives the other axis from
it, and the box stops responding to its container. The tile rendered 480×480 at every viewport
and hung 184px past a 320px screen — invisibly, because `globals.css` sets `overflow-x: hidden`,
so there was no scrollbar and no symptom.

Both were found by a person looking at one component. Two instances is where a defect stops
being a bug and becomes a category, which is the argument the colour-token audit already made:
the fix is not to check this box, it is to check every box.

## Decision

**Audit the shape, across the codebase, the way `design-tokens-contrast.test.ts` audits every
hex value.** `src/tests/unit/bounded-geometry.test.ts` collects every size declaration in
`src/components/**`, `src/app/**` and `globals.css` — grouped *per element*, because every
property this is about is a relationship between declarations on the same box — and enforces
three rules:

1. **An absolute floor needs a ceiling, or a classification.** `bounded` (something on the same
   element caps it), `intrinsic` (the container or the content does, and the entry says which),
   or `unbounded` with the reason. No fourth state.
2. **A ratio needs a bound on the axis it derives from**, for the same reason.
3. **A minimum dimension and an aspect-ratio on one element is forbidden outright** — ADR 017's
   contradiction, which is not a classification question but an error.

Nine declarations needed classification. Each entry states a real reason, and the reverse
direction is checked too: a classification describing a declaration that no longer exists fails,
because an entry outliving its subject reads as a considered decision and is an old note.

### What is deliberately not audited, and why that is the interesting half

**A bare `max-width` needs no entry.** A ceiling with no floor is the safe asymmetry — it can
only make a box smaller, and nothing in this repository's history has gone wrong that way. There
are about ninety of them. Requiring an entry for each would produce ninety rows reading
"BOUNDED — has a max", and a table nobody reads is how `--sage` got missed in the first place.
A completeness check earns its keep only where the entries carry information.

**The E2E suite turned out to be already symmetric.** The audit was run across `e2e/**` looking
for measured floors with no paired ceiling, and found none worth fixing:
`product-image-fit.spec.ts` already pairs `MIN_MARK_EXTENT` with `MAX_MARK_EXTENT` (PR #41 got
that right), and the two remaining floors — the hero's in-frame fraction, and the imagery
opacity floor in `visual-assets.spec.ts` — have no meaningful ceiling, because more of each is
strictly better.

So the lint rule this ADR was expected to carry — forbid a bare `toBeGreaterThan` on a measured
value — would fire on exactly those two legitimate assertions and nothing else. It was not
written. A guardrail whose entire yield is false positives trains people to suppress it, which
is [ADR 011](011-repeated-identical-failures-must-escalate.md)'s finding about notification
channels applied to lint rules.

### The clamp that could not vary

`HorizontalScroll.tsx` carried `width: clamp(220px, 260px, 280px)`. The middle argument is what
a clamp interpolates; a constant there pins the result at 260px at every viewport, so the bounds
either side are decoration. It reads as fluid and is not.

A comment thirty lines below already knew — *"a fixed 260px, not a fluid grid cell"* — which is
the tell that matters. The knowledge existed and the code did not act on it, so the next reader
got the comment or the declaration depending on which they reached first.

`eslint-rules/no-degenerate-clamp.mjs` flags any `clamp()` whose preferred value carries no
viewport, percentage or container unit. It fires on exactly one place in this codebase today,
and would have fired the day that line was written.

The fix keeps the ceiling at **260px rather than 280px**, so every viewport at or above 383px
renders exactly what it rendered before — this is a correctness fix, not a redesign. Below that
the card now shrinks instead of eating the screen: at 320px it was 260px, 81% of the viewport,
leaving almost no sight of the next card in a strip whose entire affordance is that you can see
there is a next one.

## Consequences

- **Three rules, not a taxonomy.** Each encodes a defect this repository actually shipped. The
  audit is narrow on purpose: it is the sharp version of "classify every size", and the blunt
  version would have been rubber-stamped.
- **The scan asserts its own ground.** It checks that it can still see both inline styles and
  stylesheet rules, and that the product tile — the ADR 017 element — is still visible to it. A
  refactor that moved it would otherwise leave this audit green over a smaller world.
- **`isRelative` had this exact bug while being written.** Its first version anchored the unit
  pattern with `\b`, and in `100dvh` the digit and the `d` are both word characters, so there is
  no boundary and the pattern matched nothing — reporting every `minHeight: '100vh'` in the app
  as an unbounded absolute floor. A scanner failing *open* is the failure mode this directory
  exists to prevent, found in the tool built to prevent it.

Referenced by: `src/lib/analysis/sizedElements.ts`, `src/tests/unit/bounded-geometry.test.ts`,
`eslint-rules/no-degenerate-clamp.mjs`, `src/components/home/HorizontalScroll.tsx`,
[ADR 013](013-a-protection-that-can-only-grow.md), [ADR 017](017-a-box-that-could-not-be-both.md).
