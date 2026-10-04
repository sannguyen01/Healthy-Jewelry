# Brand typeface — Zen Kaku Gothic Antique, latin slice

One family sets every role on the site (display, UI, body). It is chosen as the closest openly
licensed relative of the FW Tsukiji Gothic family (方正FW筑紫黑) that Songmont's identity is set
in — see `DESIGN.md`, "Reference: Songmont", for the evidence and what is still unverified.

| File | Weight | `OS/2` weight class | SHA-256 |
|---|---|---|---|
| `zen-kaku-gothic-antique-latin-300.woff2` | Light | 300 | `55aba51c57ee8f487013b6738cb848b2f3387d50751bc8a9fc5b78a085100a95` |
| `zen-kaku-gothic-antique-latin-400.woff2` | Regular | 400 | `8a7ab467520efcba7960b9e576e8b6edad236ee3812c4de575b16003974af053` |
| `zen-kaku-gothic-antique-latin-500.woff2` | Medium | 500 | `3c5566ca218dd2c7a4755ccf490eeab27ffba7a2d3474414d82c71608c2ceee5` |

## Where they come from

Each file is the `/* latin */` `@font-face` source Google Fonts serves for
`https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+Antique:wght@300;400;500`
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
`next/font/google` downloads every slice at build time (363 files for three weights) to serve
the one slice a Latin page uses. The latin slice is 9.6 KB per weight: 29.0 KB for all three,
against the 66.3 KB of preloaded latin faces they replace (Barlow Condensed 400 and 500 at
14.7 KB each, and DM Sans as one 37.0 KB variable file), measured from the 2026-10-04 builds.

The cost is coverage: the slice draws 219 characters — printable Latin-1, typographic quotes and
dashes, the ellipsis, the bullet, the euro sign. A character outside it does not fail; the
browser quietly takes it from the fallback face, mid-line. So the set is enforced:

- `src/tests/unit/font-files.test.ts` reads each file's tables: the weight class against the
  weight `layout.tsx` declares for it, the family, the licence, the SHA-256 above, and every
  string in `src/content/**` against the `cmap`.
- `e2e/glyph-coverage.spec.ts` does the same for the text each route actually renders.

To replace a file, update the table above in the same commit; the test compares them.
