# 014 — Monochrome was not decided

## Context

The storefront is monochrome. Nine of the palette's thirteen tokens are warm neutrals, the
illustrations are three hardcoded greys, and the only chroma anywhere is `--titanium`'s desaturated
blue and `--sage`'s green — the second of which appears in four places totalling a badge, a form
confirmation and a shipping row.

That is a defensible register for premium jewelry. The question this ADR settles is not whether it
is defensible but whether it was **chosen**, because a palette that is monochrome by design and one
that is monochrome because nothing colourful was ever available are visually identical and
strategically opposite. The evidence says the second:

- **No ADR, in thirteen.** This directory covers webhook secrets, cart discriminators, English-only
  copy and hero card geometry. Nothing covers the palette. `docs/` mentions "palette" once, and only
  to describe a test's mechanism.
- **The illustrations bypass the design system entirely.** `JewelrySVG` draws with the literals
  `#CECBC6`, `#E4E1DC` and `#8A8784` — no `var(--…)`, so no token test can see them — behind a
  `dark` prop that no call site passes, meaning one of its two branches has never rendered.
- **The one thing that could differentiate is discarded at the last step.** `material` is a closed
  union (`titanium | niobium | surgical-steel`) present on every product and already flowing into
  `ProductImage`, which uses it for nothing. Two products of different metals with the same
  `svgType` render byte-identical output.
- **The copy promised colour the interface could not show.** The FAQ described anodizing niobium to
  create "vivid colors"; `/terms` carried a colour-accuracy disclaimer for a colour display that did
  not exist. Both are corrected in the same change as this ADR.
- **And the single chromatic token was an unnoticed accessibility defect.** `--sage` shipped as
  9–13px text at between 1.97:1 and 2.36:1 — worse than the 2.25:1 `--titanium` case that had
  already forced the `--titanium-text` split — because `TEXT_PAIRINGS` is a hand-maintained list and
  sage was never added to it. A palette nobody decided is a palette whose one exception nobody
  checked.

## Decision

The storefront is monochrome **by default**, and that is now written down as a default rather than
mistaken for a position.

The material-accent question — whether titanium, niobium and steel should each carry a colour
derived from the metal — is **deferred until product photography exists**, not answered here.

The reason is about sequence, not taste. Every product currently renders a line illustration
because all 22 SKUs have zero media. Colour introduced over line art is compensation for absent
photography, and reads as decoration filling a hole. The same colour introduced alongside real
photographs reads as a system, because the photographs supply the reference the palette is
abstracting from. It is a move that can only be made once, and making it now spends it on the worst
possible backdrop.

`--sage` and `--sage-text` remain the only chroma, both bounded and both enforced.

## Consequences

The deferral has a **trigger rather than a date**: it reopens when photography coverage moves off
zero, which `productPhotographyPremise` already reports. Note that detector has never actually
executed — see `STATE.md`'s 2026-08-25 correction — so the trigger is only as good as the fix to
issue #24, and this ADR does not pretend otherwise.

Colour tokens can no longer enter unclassified. `design-tokens-contrast.test.ts` now requires every
`--*: #RRGGBB` in `globals.css` to be either a checked text pairing or an explicit `ACCENT_ONLY`
entry, and separately forbids `--sage` from appearing as a `color:` declaration in any stylesheet or
component. That second test exists because the first cannot see it: reverting `.badge-new` to
`var(--sage)` left every contrast assertion green, since a contrast test reads hex values and has no
idea which token a rule references.

What this ADR does **not** do is claim the monochrome is right. It records that it was never
argued, so that when the question is reopened it is reopened as a decision rather than rediscovered
as a surprise.
