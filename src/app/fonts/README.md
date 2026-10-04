# Typefaces — Zen Kaku Gothic Antique for the site, Barlow Condensed for the name

Two families, one job each. The brand name has its own (see the last section); one family sets
every other role on the site (display, UI, body). It is chosen as the closest openly
licensed relative of the FW Tsukiji Gothic family (方正FW筑紫黑) that Songmont's identity is set
in — see `DESIGN.md`, "Reference: Songmont", for the evidence and what is still unverified.

| File | Weight | `OS/2` weight class | SHA-256 |
|---|---|---|---|
| `zen-kaku-gothic-antique-latin-400.woff2` | Regular | 400 | `8a7ab467520efcba7960b9e576e8b6edad236ee3812c4de575b16003974af053` |
| `zen-kaku-gothic-antique-latin-500.woff2` | Medium | 500 | `3c5566ca218dd2c7a4755ccf490eeab27ffba7a2d3474414d82c71608c2ceee5` |

## Where they come from

Each file is the `/* latin */` `@font-face` source Google Fonts serves for
`https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+Antique:wght@400;500`
(version `v19`, fetched 2026-10-04), byte for byte. Nothing was re-encoded or re-subset here.

- Designer: Yoshimichi Ohira. Upstream: https://github.com/googlefonts/zen-kakugothic
- Copyright, as each file's own `name` table states it (the upstream `OFL.txt` header names
  "The Zen Kaku Gothic Project Authors" instead; both are quoted as found):

  > Copyright 2022 The Zen Project Authors (https://github.com/googlefonts/zen-kakugothic)
- Licence: SIL Open Font License 1.1, in `OFL.txt` beside these files (copied unmodified from
  `google/fonts/ofl/zenkakugothicantique/OFL.txt`). It declares no Reserved Font Name, so the
  subset Google serves may be redistributed under the family's own name.

## Why self-hosted, and why only the latin slice

Google serves this family — a Japanese typeface — as 121 unicode-range slices per weight.
`next/font/google` downloads every slice at build time (121 files per weight) to serve
the one slice a Latin page uses. The latin slice is 9.7 KB per weight: 19.4 KB for both,
against the 66.3 KB of preloaded latin faces they replace (Barlow Condensed 400 and 500 at
14.7 KB each, and DM Sans as one 37.0 KB variable file), measured from the 2026-10-04 builds.

## Why 400 and 500, and no 300

Weight numbers do not carry between families. The site set its body copy and small labels in
DM Sans 300; measured as ink per unit of text in Chromium (advance width × font size, at 1× and
2×), this family's 300 lays down **43–56%** of what DM Sans 300 did and its 400 **75–95%**. Kept
at 300, every paragraph and label would have rendered about half as dark as it shipped — a
legibility loss no contrast ratio sees, because the colour never changed. So the 300 role became
400, and the Light file, with nothing left to set, is not shipped.

The cost is coverage: the slice draws 219 characters — printable Latin-1, typographic quotes and
dashes, the ellipsis, the bullet, the euro sign. A character outside it does not fail; the
browser quietly takes it from the fallback face, mid-line. So the set is enforced:

- `src/tests/unit/font-files.test.ts` reads each file's tables: the weight class against the
  weight `layout.tsx` declares for it, the family, the licence, the SHA-256 above, and every
  string in `src/content/**` against the `cmap`.
- `e2e/glyph-coverage.spec.ts` does the same for the text each route actually renders.

To replace a file, update the table above in the same commit; the test compares them.

## The brand name — Barlow Condensed, latin slice

The logotype ("HEALTHY JEWELLERY" in the header and the footer) keeps the face it had before the
Songmont reference. It is the owner's ruling (2026-10-04, [ADR 048](../../../docs/adr/048-the-name-keeps-its-own-face.md)):
Songmont is a reference for the site, not a template for the brand. It is set as it was: 500 in the
header, 400 in the footer, in tracked capitals. `--font-brand` names it, and
`typography-weights.test.ts` fails if any rule but the logotype's uses it.

| File | Weight | `OS/2` weight class | SHA-256 |
|---|---|---|---|
| `barlow-condensed-latin-400.woff2` | Regular | 400 | `7fff1bb22e5773f0d1a55d3093068b6dac4539e8bb3ac23fb9f0a729df2c7bb4` |
| `barlow-condensed-latin-500.woff2` | Medium | 500 | `460f141ec8f6c9a1516bfd2bd9fe71656246d7a9d04a0955faf53158d8970c4c` |

- **Source:** each file is the `/* latin */` `@font-face` source Google Fonts serves for
  `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500` (version `v13`, fetched
  2026-10-04), byte for byte. It is the same family `next/font/google` served before 2026-10-04,
  now self-hosted beside the site face.
- **Designer:** Jeremy Tribby. Upstream: https://github.com/jpt/barlow
- **Copyright**, as each file's own `name` table states it:

  > Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)
- **Licence:** SIL Open Font License 1.1, in `OFL-BarlowCondensed.txt` beside these files, copied
  unmodified from `google/fonts/ofl/barlowcondensed/OFL.txt`. It declares no Reserved Font Name.
- **Size:** 21.2 KB and 21.4 KB. The name renders above the fold in the header, so both are
  preloaded with the site face.
- **Coverage:** 227 characters per weight, every letter of the name in both cases.
  `font-files.test.ts` checks this against `SITE_NAME`, and `e2e/glyph-coverage.spec.ts` checks it
  against the rendered logotype. That spec also checks the face loaded and that no other element
  renders in it.

