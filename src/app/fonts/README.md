# Typefaces — the original pair (ADR 052)

Barlow Condensed is the display voice and the brand name; DM Sans is everything else. Four static
files, each one weight of one family, all latin slice, all SIL OFL 1.1. This is the typography the
brand had before the Songmont reference (ADR 043) and before the Quiet Archive's trial of three
voices (ADR 051): the design stays, the typography goes back.

| File | Role | Weight | `OS/2` weight class | SHA-256 |
|---|---|---|---|---|
| `barlow-condensed-latin-500.woff2` | display (`--font-display`): headings, names, menu links; and the header's name | Medium | 500 | `460f141ec8f6c9a1516bfd2bd9fe71656246d7a9d04a0955faf53158d8970c4c` |
| `barlow-condensed-latin-400.woff2` | the footer's name (`--font-brand`) | Regular | 400 | `7fff1bb22e5773f0d1a55d3093068b6dac4539e8bb3ac23fb9f0a729df2c7bb4` |
| `dm-sans-9pt-latin-300.woff2` | running text (`--font-body`) | Light | 300 | `80f13c410ec41f210a5553e7f420f8a51f459180019274df0b3faea314916f90` |
| `dm-sans-9pt-latin-500.woff2` | labels, controls, badges (`--font-ui`) and emphasis (`strong`, `b`, `th`) | Medium | 500 | `19bf1984956517c35c2bd35b6cdedac12a21d6fcd3596c614ecdfb88b648909d` |

The Bodoni Moda pair and DM Sans 400 of the three-voice trial (ADR 051) are gone, with Bodoni's
licence file and its copies in `public/fonts/`; so is the Zen Kaku Gothic Antique pair of ADR 043.
Nothing asks for a 400 in DM Sans, and `typography-weights.test.ts` fails if something does.

## Where they come from

Each DM Sans file is the `/* latin */` `@font-face` source Google Fonts serves for a **fixed
instance** of the variable family, byte for byte (fetched 2026-10-09). Nothing was re-encoded or
re-subset here. The request names the axes, and the answer is a static file with one weight:

| File | Request (`https://fonts.googleapis.com/css2?family=…&display=swap`) | Version |
|---|---|---|
| `dm-sans-9pt-latin-300.woff2` | `DM+Sans:opsz,wght@14,300` | `v17` |
| `dm-sans-9pt-latin-500.woff2` | `DM+Sans:opsz,wght@14,500` | `v17` |

DM Sans's optical axis is requested at 14 and the file names itself "DM Sans 9pt": the axis runs 9 to
40 and the instance is cut at its lower end, which is the text cut. A request that names both weights
at once returns one variable file instead, so each weight is asked for on its own.

- **DM Sans.** Designer: Colophon Foundry. Upstream: https://github.com/googlefonts/dm-fonts.
  Copyright, as each file's own `name` table states it:

  > Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)
- **Licence.** SIL Open Font License 1.1, copied unmodified from `google/fonts/ofl/` into
  `OFL-DMSans.txt` beside these files. It declares no Reserved Font Name, so the subset Google serves
  may be redistributed under the family's own name. Barlow Condensed's is in the section below.

## Why static instances, and why 300 and 500 in DM Sans

The variable DM Sans file is 61 KB and carries axes the site never sets. A fixed instance is about
14 KB, and `font-files.test.ts` can read its weight class straight out of `OS/2` without parsing an
`fvar` table.

The site asks for the weights it has files for, and only those. `html { font-synthesis: none }`
means that a request for any other weight is drawn in the nearest real face, not smeared into a fake
one, and a nearest-face rule is a trap with no 400 file: a request for 400 is answered with the 500.
So the rule is enforced, not hoped for (`typography-weights.test.ts`):

| Token | File | Weight | Used for |
|---|---|---|---|
| `--font-display` | Barlow Condensed | 500 | headings, page titles, every piece, collection and metal name, the menu's links |
| `--font-brand` | Barlow Condensed | 500 / 400 | the logotype: 500 in the header, 400 in the footer (ADR 048) |
| `--font-body` | DM Sans | 300 | running text; 500 for `strong`, `b` and `th` through the same token |
| `--font-ui` | DM Sans | 500 | labels, controls, badges, metadata |

The body is 300 because it always was, until the Songmont reference replaced it with a gothic whose
400 lays down about as much ink as this family's 300 (ADR 043). DM Sans has its own 300 back, so
the colour is the one the brand shipped.

The cost is coverage: each slice draws 222 to 227 characters, printable Latin-1, typographic quotes
and dashes, the ellipsis, the bullet, the euro sign. A character outside it does not fail; the
browser quietly takes it from the fallback face, mid-line. So the set is enforced:

- `src/tests/unit/font-files.test.ts` reads each file's tables: the weight class against the
  weight `layout.tsx` declares for it, the family, the licence, the SHA-256 above, and every
  string in `src/content/**` against the `cmap` of **every** face (a character any one face lacks
  might be set in that face somewhere).
- `e2e/glyph-coverage.spec.ts` does the same for the text each route actually renders.

To replace a file, update the table above in the same commit; the test compares them.

## What is preloaded

Everything, and it is less than the pair it replaced: both Barlow Condensed weights (21.2 KB and
21.4 KB) and both DM Sans weights (13.7 KB and 14.3 KB), 70.6 KB in all, because the bar and the hero
need both families on the first paint. (The three-voice trial preloaded 71.0 KB; the Songmont
reference's Zen Kaku and Barlow pair preloaded 62 KB.)

## The copies in `public/fonts/`

`next/font` content-hashes the files it serves, so a document that is not rendered inside the layout
cannot name them: the 410 page a retired URL answers with (a plain `Response`) and
`global-error.tsx` (which replaces the root layout). They declare their faces themselves, from
`public/fonts/barlow-condensed-latin-500.woff2`, `dm-sans-9pt-latin-300.woff2` and
`dm-sans-9pt-latin-500.woff2`, **the files above byte for byte** (same SHA-256), through
`src/lib/design/siteFace.ts`. `src/tests/unit/type-system-floor.test.ts` compares each copy with its
source, so a replaced file must be replaced in both places in the same commit.
([ADR 050](../../../docs/adr/050-one-face-means-no-borrowed-ones.md), restated by ADR 052.)

## The share-card copies (TTF) in `public/fonts/`

The Open Graph cards (`/opengraph-image`, `/products/[handle]/opengraph-image`) are rendered by
Satori, which reads TTF, OTF and WOFF and not the WOFF2 the site ships. So they bundle the same
fixed instances as TrueType, each file read at the call with a literal `process.cwd()` path
(ADR 047) and named in `scripts/lib/function-traces.mjs`. They were Noto Sans until 2026-10-09 (ADR 051).

| File | Role on the card | `OS/2` weight class | SHA-256 |
|---|---|---|---|
| `barlow-condensed-500.ttf` | the piece's name, the metal, the brand name | 500 | `de6afc7fd8afde724454ccc1e56f6319f18994a87eb3a78d9a886338344c078d` |
| `dm-sans-9pt-300.ttf` | the positioning line | 300 | `1e943db6ea127d08309dccae4b15b2a827ef9d2cf2ef9a4df81bcb1800567d72` |
| `dm-sans-9pt-500.ttf` | the material chips | 500 | `376427b5322148d8de1e03f263bcca4935a2d60ba71d9f94f4947ab664c711ae` |

Each is the file Google Fonts serves for the same request as the WOFF2 above when it is made with a
user agent that predates WOFF2 (an Android 2.2 browser), which makes the answer `format('truetype')`,
byte for byte. The legacy path serves each family's whole Latin set and not the 222 to 227 character
slice a browser is sent, which is why these files are three to four times the size; they are read on
the server only, so nothing is sent to a visitor.

| File | Request | Version |
|---|---|---|
| `barlow-condensed-500.ttf` | `Barlow+Condensed:wght@500` | `v13` |
| `dm-sans-9pt-300.ttf` | `DM+Sans:opsz,wght@14,300` | `v17` |
| `dm-sans-9pt-500.ttf` | `DM+Sans:opsz,wght@14,500` | `v17` |

Same designers, copyright lines and licences as the WOFF2 files they mirror. `font-files.test.ts`
reads each one's own tables (`describeSfnt`), and `opengraph-bundled-font.test.tsx` rasterises every
title and material in the catalogue with them through the real Satori.

## The brand name — Barlow Condensed, latin slice

The logotype ("HEALTHY JEWELLERY" in the header and the footer) keeps the face it had before the
Songmont reference. It is the owner's ruling (2026-10-04,
[ADR 048](../../../docs/adr/048-the-name-keeps-its-own-face.md)): Songmont is a reference for the
site, not a template for the brand. It is set as it was: 500 in the header, 400 in the footer, in
tracked capitals. `--font-brand` names it, and `typography-weights.test.ts` fails if any rule but
the logotype's uses it.

Barlow Condensed is also the display voice (`--font-display`): every heading, page title, piece,
collection and metal name and menu link is set in it, in capitals (ADR 052). That is the same
*face* and a different *token*: `--font-brand` still names the name alone. The files are unchanged,
byte for byte, from the ones ADR 048 shipped.

- **Source:** each file is the `/* latin */` `@font-face` source Google Fonts serves for
  `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500` (version `v13`, fetched
  2026-10-04), byte for byte.
- **Designer:** Jeremy Tribby. Upstream: https://github.com/jpt/barlow
- **Copyright**, as each file's own `name` table states it:

  > Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)
- **Licence:** SIL Open Font License 1.1, in `OFL-BarlowCondensed.txt` beside these files, copied
  unmodified from `google/fonts/ofl/barlowcondensed/OFL.txt`. It declares no Reserved Font Name.
- **Size:** 21.2 KB and 21.4 KB. Both are preloaded: every heading and the bar render the 500 above the
  fold, and the 400 is the footer's name on every page.
- **Coverage:** 227 characters per weight, every letter of the name in both cases.
  `font-files.test.ts` checks this against `SITE_NAME`, and `e2e/glyph-coverage.spec.ts` checks it
  against the rendered logotype.
