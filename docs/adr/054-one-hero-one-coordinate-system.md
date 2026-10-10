# ADR 054 — One hero, one coordinate system

**Date**: 2026-10-10
**Status**: Accepted. The owner asked for the mobile hero to open the way the Songmont reference does: the photograph
fills the first viewport, the header and the copy sit inside it, and desktop and phone read as one composition. They
then ruled on three open questions: the existing photograph is an **interim** held behind an owner gate; the header's
tone over the photograph is **data, proven by measurement**; and the consent notice **publishes its height** so the
hero's copy rides above it. It supersedes the stacked-phone clause of [ADR 051](051-three-voices-one-archive.md), amends
[ADR 013](013-a-protection-that-can-only-grow.md) and [ADR 021](021-a-metric-with-only-one-direction.md), and reads
[ADR 044](044-decided-from-the-language-not-the-page.md)'s "no filter laid over the photograph" as a rule about
palette, not about legibility.

## Context

Below 900px the hero was a different object from the one above it. A component-scoped `<style>` of `!important`
overrides turned it into a column: 104px of clear space, the copy first, the photograph second as a 16:9 band, the card
made transparent. The first screen of a phone was a page header with a picture under it. Five things owned one box:

| Owner of the geometry | What it did |
|---|---|
| Inline styles on the section, card and media | desktop values the phone block then overrode with `!important` |
| A scoped `<style>` in `Hero.tsx` | the whole phone composition, invisible to the stylesheet's own guards |
| A JavaScript reveal | set every copy child to `opacity: 0` after hydration; reduced motion zeroed the transition but not the delays |
| The header | fixed, 64px typed in about fifteen places, state read from `scrollY > 60` on every route |
| One `object-position` | `right center` kept 25% of the frame at 390px and none of the subject |

Measured while planning this change:

| Finding | Evidence |
|---|---|
| A cover crop of the 1376×768 photograph shows 25.8% of its width at 390×844 and 430×932, 31.4% at 320–375, 41.9% at 768×1024 | computed from the file's own dimensions |
| That crop is scaled 3.3× in device pixels at 390×844 | same |
| The "at least half the frame" floor of ADR 021 cannot hold for any viewport-filling phone hero | same |
| All four lifestyle and collection JPEGs carry an embedded C2PA manifest from Google naming a trained-algorithmic source type, and a SynthID marker | byte-level read of each file |
| The hero shows gold shell and sun necklaces, rings and bangles, not titanium, niobium or 316L pieces | the photograph |
| Light header text on a 46% top veil over this photograph's sky is about 3.2:1; AA is 4.5:1 | arithmetic on the palette |
| The overlay header has no veil, and no test measured its legibility over the photograph | `hero-legibility.spec.ts` samples hero copy only |
| The consent notice is fixed to the bottom and about 230–260px tall on a phone | `ConsentBanner.tsx` |
| A section with a dark background fails the single-dark-band test | `homepage-composition.spec.ts` |

## Decision

**1. One composition on every width.** The photograph is the hero's geometry: it begins at the top of the page beneath
the fixed header and fills the first viewport. The copy occupies a safe zone inside it. Below 900px the crop, the
size and the alignment change; the photograph never moves under a separate panel. The breakpoint stays 900 (already in
the guarded set), so no width is added to `design-layers`.

**2. Art direction is data.** `src/content/hero/home.json` carries, for a desktop and a phone crop: the source file and
its dimensions, a focal point, a subject box, the corner the copy sits in, and a variant (`overlay` or `card`). It carries
the literal alt text, the header tone and the image's provenance. The record is validated through Zod at module load
like the catalogue and the claims, so a malformed one fails the build, and it is read only through `src/lib/catalog`.

**3. Provenance is a field, and its rules are enforced.** A `photographed` image must name real catalogue pieces and
every handle must exist. An `ai-generated` image names none, because it cannot depict a real piece. An `approved` rights or
consent state needs a reviewer and a date. **No agent writes an `approved` state.** The current record says what the bytes
say: `ai-generated`, rights `unreviewed`. It is an interim; replacing it with photography of the actual pieces is one
record edit and at most two files, and is an owner gate in `STATE.md`.

**4. The card is a variant, not a doctrine.** `variant: "card"` keeps ADR 013's opaque, bounded card
(`--hj-hero-card-max-ratio`) for a crop whose photograph has no safe zone for copy; `variant: "overlay"` lays the copy on
a bottom veil. The wide crop may be either, and desktop keeps the card for the current photograph; the narrow crop is
always an overlay, and the schema refuses a card there, because a card bounded to a fraction of the photograph is a column
too narrow for a sentence at a phone's width and nothing rendered or tested it. The first screen is one composition either
way: the photograph, the header over it, the copy inside it.

**5. A veil is a legibility device, not a filter.** ADR 044 forbids a filter that imitates a palette. A gradient whose
strength is set by the lowest contrast measured under the text it protects does not imitate one, and is allowed. Its
strength is a token (`--hj-veil-bar` for the header's, `--hj-veil-copy` for the copy's) and is set by the rendered-pixel test, not by eye. The two are different contracts: the bar's is photograph-independent arithmetic (it cannot know what scrolls under it), the copy's is measured against the photograph it lies on.

**6. The header's tone is data, its veil is its own, and its state comes from the hero.** `headerTone` is `light` (light
type on a darkened band) or `dark` (ink on a light band of the page ground). The band is drawn by the header itself
(`.hj-header::before`, only while it overlays the hero), at the viewport's top edge wherever the page is scrolled, in
the type's opposite colour, at a strength that clears AA over pure black and over pure white (`header-veil.test.ts`
computes it for both tones), because the bar cannot know what is under it. The rendered-pixel test measures the worst
pixel behind the bar's own type (MENU, the brand name, SEARCH, CONTACT), its search glyph (3:1) and its focus ring, at
five depths of the hero at four widths and with the photograph blocked. The **logotype is exempt**: the knot and the name
as a mark are a logo, which WCAG 1.4.3 and 1.4.11 do not hold to a ratio, and are not measured. What is guaranteed is the
bar's legibility; the copy that scrolls under the bar is faintly visible through its band, which is the cost of a
translucent bar and was judged better than an opaque one over a photograph. The header's state is `hero-overlay`, `solid`
or `menu-open`, and it is derived from the hero's own sentinel, not from a scroll distance: a page without a hero is
`solid` from its first byte, and a sentinel below the fold is still overlay. While the menu is open `main` and the footer
are inert, so the dialog is a true modal.

**7. One number for the header.** `--header-height` is declared once. The bar, the drawer's top edge, the hero's safe
zone and the page offsets read it.

**8. The reveal is CSS, and the hero is a server component.** The entrance is an animation on tokens, removed under
`prefers-reduced-motion` and independent of JavaScript. Copy is never at `opacity: 0` waiting for a script.

**9. The consent notice publishes its height.** While it is showing it writes its measured height to
`--hj-consent-h`, the hero's bottom padding adds it, and the document's `scroll-padding-bottom` reads it, so a focused
control is never hidden by it (WCAG 2.4.11). Its copy and its logic are unchanged. Whether anyone is asked is in
`localStorage`, which the server cannot read, so a hero that reserved the room only after the notice had measured itself
moved its copy by the notice's whole height a few hundred milliseconds after a first visit's first paint. A script at the
top of `<body>` (`CONSENT_PREPAINT_SCRIPT`, in `consent.ts`, held equal to `readConsent` by `consent-prepaint.test.ts`)
therefore reserves an estimate (`--hj-consent-reserve`, by width) when nobody has answered, and the notice replaces it with
its real height or gives it back.

**10. The frame floor becomes a subject floor.** ADR 021's "at least half of the source frame" is replaced by: at every
width the record's subject box is at least 90% visible after the cover crop, and none of it lies under the copy. It is
computed from the record by `coverVisibleRect` and checked against the browser's own boxes. The box must span at least
5% of the image on each axis (`MIN_SUBJECT_SPAN`), because a tiny box is trivially in frame and clear of the copy and
would make both checks pass for any crop.

## Consequences

| Guard | What it now holds |
|---|---|
| `hero-media.test.ts` | a malformed record, a photographed image with no pieces, an AI-origin image naming pieces, an approval with no reviewer, a source outside `/images/`, or dimensions that disagree with the file all fail |
| `cover-crop.test.ts` | the crop arithmetic the subject floor stands on |
| `Hero.test.tsx` | one `h1`, no line break element, the sentinel, the literal alt, the variant, and no inline `opacity: 0` |
| `hero-overlay.test.ts`, `Nav.test.tsx` | the sentinel predicate, including a sentinel below the fold; the three header states; the modal's inert background |
| `hero-legibility.spec.ts` | eleven widths, including 900 and 901: first viewport, no overlap, safe area, worst-pixel contrast for the copy and the header (photograph present and blocked), subject visibility, reduced motion, no JavaScript, forced colours, 200% text, a short phone with the notice up |
| `navigation.spec.ts` | the header's state on `/`, after the hero, on a page without one, and with the menu open |
| `header-height-token.test.ts` | the bar's height is written once, including inside a `calc()` and in the scroll offsets |
| `header-veil.test.ts` | the bar's own veil is strong enough for any backdrop, in both tones |
| `consent-prepaint.test.ts` | the pre-paint reservation agrees with the notice about who is asked, over every stored value and a storage that throws |
| `analytics.spec.ts` | a first visit shifts nothing when the notice arrives (the browser's score and the copy's own travel), and the published room is the notice's place on screen, also after a scrolled reopen from the footer |

What it found on the way:

- The brief's draft set `background: var(--ink)` on the hero section. That is a second dark band to
  `homepage-composition.spec.ts`; the dark fallback lives on the media wrapper.
- The focus ring and the primary button are both `--ink`, and vanish on a dark veil. The overlay variant inverts both.
- A `<picture>` or a `display: contents` parent of the image breaks the aspect check of `layout-invariants.spec.ts`;
  the picture is a block that fills the media wrapper.
- Every page's header was transparent for its first 60px, whether or not the page had a hero.
- The photograph's own provenance was written down nowhere in the repository.

Measured values (veil strengths, focal points, subject box, header tone, the phone floor) are recorded under "Integration" below.

## What this does not do

- **It does not make the photograph real.** The interim is an AI-origin image of gold jewellery. At 390×844 it is a
  3.3× upscale. Both are known and gated, neither is solved here.
- **It does not restyle the catalogue or piece pages.** That is the next workstream and inherits this one's grammar.
- **It does not change consent copy or logic.** It reads the notice's height and nothing else.
- **It does not touch the platform webhook, its secret or any control row.** The sentinel for the card's bound is
  preserved by keeping its anchor line verbatim.
- **It does not claim a measurement it did not take.** The local baseline is a production build in a container; the
  live deployment is read back by the owner after a merge.

## Integration

Recorded after the rendered-pixel run on a local production build (2026-10-10; the screenshot matrix and its manifest
are `scripts/capture-hero-evidence.mjs`, and the pull request has the receipt). Worst pixel behind each node, as
`e2e/support/backdropContrast.ts` samples it: the header's MENU control, brand name, search control and CONTACT link,
and the hero's eyebrow, headline, sentence and two actions. AA asks 4.5:1 of this small type.

| Viewport | Variant | Hero height | Header, worst | Copy, worst |
|---|---|---|---|---|
| 320×568 | overlay | 720 | 14.8 | 6.2 |
| 360×640 | overlay | 720 | 8.4 | 6.0 |
| 375×667 | overlay | 720 | 11.0 | 6.2 |
| 390×844 | overlay | 844 | 12.9 | 6.1 |
| 430×932 | overlay | 932 | 13.9 | 6.1 |
| 768×1024 | overlay | 1024 | 14.7 | 6.1 |
| 900×900 | overlay | 900 | 14.7 | 5.9 |
| 901×900 | card | 900 | 14.8 | 6.4 |
| 1024×768 | card | 768 | 14.7 | 6.4 |
| 1280×900 | card | 900 | 14.7 | 6.4 |
| 1440×900 | card | 900 | 14.5 | 6.4 |

**These header figures are the first measurement, and they were taken at scroll 0 only**, with the bar's veil drawn by the
hero at the top edge of the photograph. They are kept as the record and not as a claim about the finished page: the
independent review found the bar illegible while the hero scrolled under it (see "After the independent review"), and the
test now measures five depths per width.

What the numbers decided:

- **Header tone is `dark` for this photograph.** Light type on a top veil measured about 3.2:1 on its sky and needs about
  two thirds of the sky darkened to reach 4.5:1; ink on a veil of the page ground clears 8:1 everywhere. The record can
  flip to `light` for a darker photograph with no code change; the test decides whether it may.
- **The bottom veil is 72%, and it is deliberately not lower.** Over the brightest pixels of this photograph (white foam, a
  cream garment) 64% would sit at the edge of 4.5:1, and the local Chromium is not the one CI uses. The headroom is the
  cost of that. A veil of fixed height failed first: the eyebrow, at the top of the copy, sat on the part of it that had
  already faded (2.1:1). The veil is now in the copy's own grid row, as tall as the copy plus a fade above it.
- **The phone floor is 720, not the 640 the brief proposed.** At the two narrowest phones the sentence wraps and the copy is
  400px tall; with the header above it and the face clear of it the hero needs about 713px. At 640 the eyebrow landed on the
  face by 22px. One floor for every width, so the override under the breakpoint is gone.
- **The focal points** are 80% by 40% for the narrow crop and 69% by 45% for the wide one; the subject (face and hair) is the
  box from 62% to 84% across and 4% to 36% down. At 390×844 the narrow crop shows about a quarter of the photograph's width,
  and the whole subject is inside it.
- **The consent notice's room is its layout position, not its painted one.** Read from the painted box it was 23px short
  while the notice was still in its entrance animation, and nothing resizes when the animation ends, so the observer never
  corrected it; an action sat 21px under the notice at 375×667. `offsetTop` does not move.
- **A test's own sampler was wrong twice, and both looked like the page's fault**: a ghost button's own light border, curving
  through the sampled corner at 2.625 device pixels per CSS pixel, was read as the backdrop of light type (found at 900px on
  a phone, missed at 390px by which pixels a stride of three landed on); and a focus ring was measured against itself because
  the capture beat the repaint that hid it.
- **The short-phone notice.** On a phone too short for the header, the copy and the notice at once (the three shortest: 320×568, 360×640 and 375×667, an iPhone SE) the
  actions cannot all be above it. The requirement there is the honest one: a focused action is not hidden, its centre is clear
  of the notice (WCAG 2.4.11 asks that it not be entirely hidden), and answering the notice returns the room.

## After the independent review

A reviewer with no context read the branch against its contract and found what this record had overclaimed.

- **The bar was illegible once the hero scrolled under it.** The table above says "AA at every width" from scroll 0, where
  the photograph's sky is behind the bar. The bar stays an overlay for as long as any of the hero is under it, so after
  the first screen it lay over the hero's own copy and the veil beneath it: at 320×568 the primary action's label printed
  through the brand mark. The new test measured it first (the worst pixel behind MENU was 1.00 to 1.11:1, and 5 of 5 cases
  failed), and passed after the veil moved to the bar. Both a measurement taken only where it was convenient and a claim
  written from it were the defect; the matrix of screenshots gained an `under-bar` state for the same reason.
- **The forced-colours check could not fail.** It walked from the headline to the body and found the section's own ground,
  which is not behind the copy at all (the photograph is a sibling layer). It now searches below the section, requires
  all the copy inside the surface it finds, and has a twin that removes the surface and requires the same predicate to find
  none. The twin first failed for a reason that was the harness's (a computed value read in the frame it changed, on an
  element that transitions), found by reading the chain in the browser.
- **The consent notice moved the page on a first visit.** The reviewer inferred it and it was measured: layout shift 0.39 at
  320×568, 0.36 at 375×667 and 0.23 at 390×844, the copy travelling 221 to 258px, none for a returning visitor. The browser's
  own score was not reported at all on the Pixel 7 emulation for the same movement, so the test also samples the copy's
  position in every frame. After the pre-paint reservation: at most 0.016 across twelve widths of a throwaway measurement,
  the copy's travel at most 11px; the committed test holds six of them, one in each band the estimate is fitted to. The reviewer's other claim, that the published room is wrong once the page has scrolled, did not reproduce on
  either project (reopening the prompt from the footer of a scrolled page publishes the figure the browser's own box
  implies); the tests that showed it stay.
- **Smaller:** a two-file picture is asked to load at once (`loading` defaults to lazy and `fetchPriority` does not undo
  it); a narrow card is refused by the schema; the card must hold all of its copy; a subject box has a floor; `Nav`'s
  props are a union; the scanners see a literal in a `calc()`; 200% text is checked on two phones.
- **Not done, on purpose:** the phone floor leaves the primary action below the fold at 320×568 (the header, the copy and
  the notice do not share 568px); non-hero pages now show the bar's hairline at scroll 0; the interim photograph is a
  3.3× upscale on a phone and is AI-origin. The first is a design trade-off for the owner; the others are the gated
  photography.

## After the geometric review

The homepage was then measured as a page rather than as a hero: every band at thirteen widths from 320 to 1920 (horizontal
overflow, overlaps between non-nested boxes, clipping, distorted images, undersized targets, each band's left and right
edge and padding), and looked at band by band, desktop and phone. It found no overflow, no overlap, no clipping, no distorted
image and no undersized target. It found the page's edges disagreeing with themselves:

- **Three things were not on the page's container.** Every band was on the twelve-column grid, whose ceiling is written
  `--hj-container`; the hero's copy, the product strip and the footer each had an edge of their own. From 1440px up
  the hero and the strip's head and first card stood off the viewport's gutter while every band stood off the
  container's (at 1920px: 72px against 312px), and the footer was a narrower container (1200px, so its text began 48px in
  from every band's at 1440px).
- **The strip ended where nothing ended.** Cards of a fixed width ran the fourth 56px past the heading's "View all" and
  left the fifth off screen, so at the common desktop width the row stopped 16px short of the viewport's edge, which
  reads as a mistake and not as a row that goes on.
- **What was done.** The container is one token. The hero's safe zone is laid on the container's grid lines (the
  copy takes the middle track, the veil spans all three, the clearance under the copy is a row of its own), which also
  removed the veil's negative margins that mirrored the padding. The strip's head and row pad to `--hj-edge`, and from
  961px a card is a quarter of the container, so four fill it and the fifth is begun. The footer takes the container.
  `e2e/homepage-composition.spec.ts` holds the hero's copy, the strip's heading, "View all", first and fourth card and the
  fifth card's start, and the footer's mark and last line, to the edge the Materials band establishes, at six widths from
  1024 to 2560 (it failed on all of them before).
- **Left alone on purpose.** The collection tiles' stagger and the index's offset are an editorial composition, not a
  misalignment, and are the designer's to change; the follow-up band is centred where the others are left-aligned.

The bar's legibility is also measured now over pure white and pure black in both tones (eight cases), so it no longer depends on the
interim photograph; whether the copy can clear the consent notice is declared per viewport (the three shortest phones cannot)
and asserted, where it had been derived from the measurement it judged; and the evidence script gained the state the first
matrix never visited, the headline under the bar.

The four-angle simplification review of the whole branch then removed what the refactors had left behind:
`data-variant-narrow` (a constant, since the narrow crop is always an overlay), the custom property that toggled the
veil per variant, a second copy of the overlay palette, the veil's `data-edge` attribute, an unused grid-area, a
bottom-clearance expression typed twice, dead exports, and `Nav`'s two coupled props, which are one: `heroTone`, whose
absence means no hero. The header's attribute is `data-bar-tone` and the veil tokens are named for what they protect,
because `data-tone` already means a dark ground on a band.

