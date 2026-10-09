# Typefaces — three voices (Quiet Archive, ADR 051)

Bodoni Moda speaks, DM Sans explains, Barlow Condensed labels. Six static files, each one weight of
one optical size of one family, all latin slice, all SIL OFL 1.1.

| File | Voice | Weight | `OS/2` weight class | SHA-256 |
|---|---|---|---|---|
| `bodoni-moda-96pt-latin-400.woff2` | display (`--font-display`) | Regular | 400 | `e787779966ad37532cc74490619a19b6416f1ce5306a338b7e798e29f5c2817f` |
| `bodoni-moda-24pt-latin-400.woff2` | titles and names (`--font-title`) | Regular | 400 | `2c6acf1249288ff7394ada50a85e05f6a4b9f4b1abb9dc7ef3e3724c9cd88ee1` |
| `dm-sans-9pt-latin-400.woff2` | running text (`--font-body`) | Regular | 400 | `4ab51eb2cd7305d177187908d6397474d4520663f6c6e572feb0a64f4fa80006` |
| `dm-sans-9pt-latin-500.woff2` | emphasis (`--font-body-medium`) | Medium | 500 | `19bf1984956517c35c2bd35b6cdedac12a21d6fcd3596c614ecdfb88b648909d` |
| `barlow-condensed-latin-400.woff2` | the footer's name (`--font-brand`) | Regular | 400 | `7fff1bb22e5773f0d1a55d3093068b6dac4539e8bb3ac23fb9f0a729df2c7bb4` |
| `barlow-condensed-latin-500.woff2` | labels (`--font-ui`) and the bar's name | Medium | 500 | `460f141ec8f6c9a1516bfd2bd9fe71656246d7a9d04a0955faf53158d8970c4c` |

The Zen Kaku Gothic Antique pair that set every role from 2026-10-04 to 2026-10-09 (ADR 043) is
gone, with its licence file and its two copies in `public/fonts/`.

## Where they come from

Each Bodoni Moda and DM Sans file is the `/* latin */` `@font-face` source Google Fonts serves for a
**fixed instance** of the variable family, byte for byte (fetched 2026-10-09). Nothing was re-encoded
or re-subset here. The request names the axes, and the answer is a static file with one weight:

| File | Request (`https://fonts.googleapis.com/css2?family=…&display=swap`) | Version |
|---|---|---|
| `bodoni-moda-96pt-latin-400.woff2` | `Bodoni+Moda:opsz,wght@96,400` | `v28` |
| `bodoni-moda-24pt-latin-400.woff2` | `Bodoni+Moda:opsz,wght@24,400` | `v28` |
| `dm-sans-9pt-latin-400.woff2` | `DM+Sans:opsz,wght@14,400` | `v17` |
| `dm-sans-9pt-latin-500.woff2` | `DM+Sans:opsz,wght@14,500` | `v17` |

DM Sans's optical axis is requested at 14 and the file names itself "DM Sans 9pt": the axis runs
9 to 40 and the instance is cut at its lower end, which is the text cut. The request that names both
weights at once returns one variable file instead, so each weight is asked for on its own.

- **Bodoni Moda.** Designer: Owen Earl. Upstream: https://github.com/indestructible-type/Bodoni.
  Copyright, as each file's own `name` table states it:

  > Copyright 2020 The Bodoni Moda Project Authors (https://github.com/indestructible-type/Bodoni)
- **DM Sans.** Designer: Colophon Foundry. Upstream:
  https://github.com/googlefonts/dm-fonts. Copyright, as each file's own `name` table states it:

  > Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)
- **Licences.** SIL Open Font License 1.1, copied unmodified from `google/fonts/ofl/` into
  `OFL-BodoniModa.txt` and `OFL-DMSans.txt` beside these files. Neither declares a Reserved Font Name,
  so the subset Google serves may be redistributed under the family's own name.

## Why static instances, and why two cuts of Bodoni Moda

The variable files are 45 KB (Bodoni Moda) and 61 KB (DM Sans) and carry axes the site never sets.
A fixed instance is about 14 KB, and `font-files.test.ts` can read its weight class straight out of
`OS/2` without parsing an `fvar` table.

The price is that **an optical size is a file.** A didone's contrast is drawn for the size it is set
at: at display sizes its hairlines are meant to be fine; at the size of a piece's name the same
hairlines break up. So Bodoni Moda is two loaders, and which one a rule uses is a function of its
size token (`typography-weights.test.ts`):

| Token | File | Used for |
|---|---|---|
| `--font-display` | 96pt | `--text-display`, `--text-hero`, and literal sizes of 36px or more |
| `--font-title` | 24pt | everything smaller: `--text-2xl` and below, every piece and collection name |

`e2e/rendered-fonts.spec.ts` closes the loop in the browser: Chrome reports the cut it drew
("Bodoni Moda 96pt"), and the spec fails on the 96pt cut under 36px.

## What is preloaded, and what is not

`preload` is a property of a `localFont` call, not of a file. What the first paint needs is
preloaded: the 96pt cut (the hero), DM Sans 400 (all running text) and both Barlow Condensed
weights (the bar and every label). The 24pt cut and DM Sans 500 are calls of their own with
`preload: false`: a browser fetches a face when text that uses it is laid out, so they cost a page
only what the page uses (every piece name needs the 24pt cut; only a page with a `<strong>` or a
`<th>` needs the 500). Preloaded in all: 14.2 + 14.2 + 21.2 + 21.4 = 71.0 KB, against 62 KB for the
Zen Kaku and Barlow pair this replaces.

## The three copies in `public/fonts/`

`next/font` content-hashes the files it serves, so a document that is not rendered inside the layout
cannot name them: the 410 page a retired URL answers with (a plain `Response`) and
`global-error.tsx` (which replaces the root layout). They declare their faces themselves, from
`public/fonts/bodoni-moda-24pt-latin-400.woff2`, `dm-sans-9pt-latin-400.woff2` and
`barlow-condensed-latin-500.woff2`, **the files above byte for byte** (same SHA-256), through
`src/lib/design/siteFace.ts`. `src/tests/unit/type-system-floor.test.ts` compares each copy with its
source, so a replaced file must be replaced in both places in the same commit.
([ADR 050](../../../docs/adr/050-one-face-means-no-borrowed-ones.md), widened by ADR 051.)

## Why 400 and 500, and no 300 and no 600

The site asks for the weights it has files for, and only those. `html { font-synthesis: none }`
means that a request for any other weight is drawn in the nearest real face, not smeared into a fake
one. Bodoni Moda is 400 only: weight does not carry hierarchy in a didone, size and cut do. DM Sans
has 400 for running text and 500 for `strong`, `b` and `th` (the only rule that names
`--font-body-medium`). Barlow Condensed has 500 for labels and the bar's name and 400 for the
footer's name.

The cost is coverage: each slice draws 222 to 227 characters, printable Latin-1, typographic quotes
and dashes, the ellipsis, the bullet, the euro sign. A character outside it does not fail; the
browser quietly takes it from the fallback face, mid-line. So the set is enforced:

- `src/tests/unit/font-files.test.ts` reads each file's tables: the weight class against the
  weight `layout.tsx` declares for it, the family, the licence, the SHA-256 above, and every
  string in `src/content/**` against the `cmap` of **every** face (a character any one face lacks
  might be set in that face somewhere).
- `e2e/glyph-coverage.spec.ts` does the same for the text each route actually renders.

To replace a file, update the table above in the same commit; the test compares them.

## The share-card copies (TTF) in `public/fonts/`

The Open Graph cards (`/opengraph-image`, `/products/[handle]/opengraph-image`) are rendered by
Satori, which reads TTF, OTF and WOFF and not the WOFF2 the site ships. So they bundle the same
fixed instances as TrueType, each file read at the call with a literal `process.cwd()` path
(ADR 047) and named in `scripts/lib/function-traces.mjs`. They were Noto Sans until 2026-10-09 (ADR 051).

| File | Voice on the card | `OS/2` weight class | SHA-256 |
|---|---|---|---|
| `bodoni-moda-96pt-400.ttf` | the piece's name, the metal | 400 | `f78618157a7fb2dabf08dbd0d2216188c31bd183845aa3804a87a900a3d663bb` |
| `dm-sans-9pt-400.ttf` | the positioning line | 400 | `6fd5773a637cb4a7c36839eeca3106dcd1a8d92b138d1652e60fd4b2e31f74ab` |
| `barlow-condensed-500.ttf` | the brand name, the material | 500 | `de6afc7fd8afde724454ccc1e56f6319f18994a87eb3a78d9a886338344c078d` |

Each is the file Google Fonts serves for the same request as the WOFF2 above when it is made with a
user agent that predates WOFF2 (an Android 2.2 browser), which makes the answer `format('truetype')`,
byte for byte. The legacy path serves each family's whole Latin set (403 to 525 characters) and not
the 222 to 227 character slice a browser is sent, which is why these files are three to four times
the size; they are read on the server only, so nothing is sent to a visitor.

| File | Request | Version |
|---|---|---|
| `bodoni-moda-96pt-400.ttf` | `Bodoni+Moda:opsz,wght@96,400` | `v28` |
| `dm-sans-9pt-400.ttf` | `DM+Sans:opsz,wght@14,400` | `v17` |
| `barlow-condensed-500.ttf` | `Barlow+Condensed:wght@500` | `v13` |

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

Under the Quiet Archive the same face is the label voice (`--font-ui`): the name is "the first
label of the system". That widens who may use the *face* and not who may use the *token*. The
files above are unchanged, byte for byte, from the ones ADR 048 shipped.

- **Source:** each file is the `/* latin */` `@font-face` source Google Fonts serves for
  `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500` (version `v13`, fetched
  2026-10-04), byte for byte.
- **Designer:** Jeremy Tribby. Upstream: https://github.com/jpt/barlow
- **Copyright**, as each file's own `name` table states it:

  > Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)
- **Licence:** SIL Open Font License 1.1, in `OFL-BarlowCondensed.txt` beside these files, copied
  unmodified from `google/fonts/ofl/barlowcondensed/OFL.txt`. It declares no Reserved Font Name.
- **Size:** 21.2 KB and 21.4 KB. Both are preloaded: the bar renders the 500 above the fold on every
  page, and the 400 is the footer's name on every page.
- **Coverage:** 227 characters per weight, every letter of the name in both cases.
  `font-files.test.ts` checks this against `SITE_NAME`, and `e2e/glyph-coverage.spec.ts` checks it
  against the rendered logotype.
