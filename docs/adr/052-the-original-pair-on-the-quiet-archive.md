# ADR 052 — The original pair, on the Quiet Archive

**Date**: 2026-10-09
**Status**: Accepted. The owner's instruction: *"Make sure the design is recovered with this design
approach, and please use the original typography for this design"*, and, on being asked which
typography that meant, **the pre-October brand pair**: Barlow Condensed with DM Sans. This ADR
**supersedes the typography decisions of [ADR 051](051-three-voices-one-archive.md)** (three voices,
Bodoni Moda in two optical cuts, the cut-follows-the-size rule, no forced capitals) and restates
[ADR 050](050-one-face-means-no-borrowed-ones.md)'s measurement and guards for two families. ADR 051's
design (palette, chrome, homepage) **stands**, and so does [ADR 048](048-the-name-keeps-its-own-face.md).

## Context

The site's typography has changed four times in six days, and each change was a decision someone
made for a stated reason, so the sequence is the context:

| When | Typography | Why it came and why it went |
|---|---|---|
| until 2026-10-04 | **Barlow Condensed** (display, tracked capitals) and **DM Sans** (labels and text, 300 for running text) | the brand's own: what the owner calls "the original typography of Healthy Jewellery" |
| 2026-10-04 | one gothic family, Zen Kaku Gothic Antique, set in the case words are written in ([ADR 043](043-one-family-and-the-case-it-is-written-in.md)) | the Songmont reference; the owner then ruled that Songmont is "a reference, not a template" and the brand name keeps Barlow Condensed ([ADR 048](048-the-name-keeps-its-own-face.md)) |
| 2026-10-09 (morning) | **Bodoni Moda** in two optical cuts, DM Sans 400 and Barlow Condensed ([ADR 051](051-three-voices-one-archive.md)) | the Quiet Archive's own type; adopted in full, then set aside by the owner for the original pair |
| 2026-10-09 | **the original pair**, on the Quiet Archive's layout (this record) | the owner's instruction above |

The owner's two instructions in the afternoon were first read the wrong way round. *"Keep current
designs, I just want to change the typography. Reverse now"* was read as "keep the typography, undo the
design", and the palette, the archive menu and the homepage were reverted in one commit. The screenshots
and the next message said the opposite: the design is the thing to keep, the typography is the thing to
change. The revert was itself reverted (`git revert` of the revert, so nothing was lost), and the question
that decides the work (*which* typography is "original": the live site's Zen Kaku or the brand's own
pair) was put to the owner rather than guessed a second time. **That is the lesson worth recording: an
instruction with two readings and a large revert on each is a question, not a judgement call.**

## Decision

Two families, four tokens. The tokens name **roles**, and the weight and case rules key on the role:

| Token | Face | Weight | Case | Used for |
|---|---|---|---|---|
| `--font-display` | Barlow Condensed | **500** | tracked capitals | headings, page titles, every piece, collection and metal name, the menu's links |
| `--font-brand` | Barlow Condensed | **500** / **400** | tracked capitals | the logotype alone: 500 in the header, 400 in the footer (ADR 048) |
| `--font-ui` | DM Sans | **500** | tracked capitals | eyebrows, buttons, badges, metadata, the bar's controls |
| `--font-body` | DM Sans | **300** | as written | running text; `strong`, `b` and `th` are the 500 |

- **Files.** Four static latin instances, 70.6 KB in all and all preloaded (the three-voice trial
  preloaded 71.0 KB, the Zen Kaku and Barlow pair 62 KB). The Bodoni pair, DM Sans 400 and Bodoni's
  licence are deleted. DM Sans **300** is new: the original body weight, which the Songmont pass
  had dropped because its gothic's 400 matched the ink of this family's 300. `src/app/fonts/README.md`
  has the provenance and the hashes.
- **There is no 400 in DM Sans, on purpose.** The nearest-weight rule answers a request for 400 with
  the 500, so one stray `font-weight: 400` would set running text in Medium with nothing in the
  stylesheet to say so. `typography-weights.test.ts` fails on it, and the `body-weight-light` sentinel
  proves that it does.
- **Capitals are the display voice's, and the label voice's.** The original set every `--font-display`
  element in capitals, tracked looser as it gets smaller (`--tracking-display`, `--tracking-title`,
  `--tracking-name`: 0.01, 0.04 and 0.06em). A condensed face in lower case reads as a different, smaller
  typeface, so the case is part of the voice and is declared, never inherited. Running text is never
  capitals.
- **The sizes, the palette and the layout are the Quiet Archive's, unchanged.** Only the faces, weights,
  case and tracking moved. Three styles that were `--font-ui` but are sentences (a field's error, the
  consent banner's current answer, a card's hover specification) became `--font-body`, because the label
  voice is capitals and a sentence is not.
- **`--font-title` and `--font-body-medium` are gone.** There is one display cut now, and the 500 of DM
  Sans is the same file as the label voice, reached by the same loader.

## Consequences

**Guards that moved, and what each now says**

| Guard | Was (ADR 051) | Is |
|---|---|---|
| `typography-weights.test.ts` | six tokens; the cut follows the size; no forced capitals; display weight 400 | four tokens resolved to two loaders; display and label styles are capitals and 500, body styles 300 and never capitals; the fallback lists are valid |
| `font-files.test.ts` | nine files across three families | the four loader files and the three card TTFs, each pinned by SHA-256, weight class, copyright and licence |
| `type-system-floor.test.ts` | one face per voice for the out-of-layout documents | a display, a body and a label face, public copies byte-identical |
| `opengraph-bundled-font.test.tsx` | Bodoni, DM Sans 400 and Barlow cards | Barlow 500, DM Sans 300 and 500, rasterised through the real Satori |
| `rendered-fonts.spec.ts` | each role drawn in its voice; no 96pt cut under 36px | each role drawn in its family **and in capitals where it is set in them**, as Chrome reports it |
| `glyph-coverage.spec.ts` | six files' common characters; display, title, body and label faces loaded | four files; Barlow 400 and 500 and DM Sans 300 and 500 loaded |
| sentinels | `cut-follows-size` | `body-weight-light`; `display-case` now holds capitals, `display-weight-declared` and the weight and file sentinels re-anchored |

**A guard added on the way.** The first menu measured (the dark overlay of ADR 051's predecessor)
failed a new vertical test on eight of twelve real screens: at 1440x900 its first link began at 14px,
under the header and over the brand name; at 1366x768 it began 52px above the viewport and ended 52px
below it, in a drawer with `overflow: visible`. Nothing in the suite had ever asked about height
(`toBeVisible()` passed, because the links were rendered). The archive menu that replaced that drawer
scrolls and starts below the bar; `e2e/header-fit.spec.ts` now holds it there on those twelve screens,
and the probe was shown to fail on the old overlay before it was kept.

**Measured, on the production build.** The full Playwright suite: 838 passed, 8 skipped, none failed;
six flakes, all the documented local-only `visible focus indicators` probe (a 0px outline at the
instant of focus), which passed on retry and passes on CI. The 219-character claim in `CLAUDE.md`
no longer states a count: the safe set is the intersection of two families' slices, and it is read out
of the files by `font-files.test.ts`.

## What this does not do

- It does not restore the *sizes* the original used. A hero headline of up to 136px belonged to a
  gothic's proportions and was retired with ADR 051's board (36 to 60px); condensed capitals hold a
  card well at that size.
- It does not build the catalogue and piece pages of ADR 051's plan (B5) or `DESIGN.md`'s rewrite (B6).
  They carry the new palette and the original typography through the shared tokens, and nothing else
  of the board.
- It does not choose between the live site's Zen Kaku and the original pair for the *production*
  site: production is whatever `main` serves until the owner merges this pull request.
