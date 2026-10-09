# ADR 047 — A function ships what it traces

**Date**: 2026-10-04
**Status**: Accepted. Found while checking resource constraints for the owner's
deployment-debugging request ([ADR 046](046-a-resolved-conflict-is-a-write-nobody-reviewed.md)).

## Context

`next build` writes a `.nft.json` beside every server function: the files that function may read
at runtime. Vercel packages the function with exactly those files. Every production build carried
this warning, twice:

> Dynamic filesystem access causes tracing of the whole project

It came from the product share card, which read its two bundled fonts with
`readFile(FONT_FILES.regular)`, a path held in an object. Turbopack could not resolve it, so it
assumed the read could be any file and traced everything into the card's route. It also traced
everything into the product page, which imports the card module for its metadata. Measured from
the traces:

| Function | Files | MB | Repository files in it |
|---|---|---|---|
| `products/[handle]` page, before | 774 | 54.77 | 520 |
| `products/[handle]/opengraph-image` route, before | 752 | 54.43 | 520 |
| Any other route | ~250 | ~42.7 | 0 |
| `products/[handle]` page, after | 256 | 42.77 | 2 (the fonts) |
| `products/[handle]/opengraph-image` route, after | — | — | 2 (the fonts) |

The 520 were the repository itself:
- 124 test files;
- 46 ADRs;
- 47 scripts;
- 25 e2e specs;
- every root `.md`;
- locally, the `coverage/` and `test-results/` output too.

All of it shipped as server code on every deploy. Nothing failed, and nothing was near Vercel's
size limit. The cost was upload, cold start, and documents and tests deployed as part of a
production function. The only signal was a warning in a log nobody reads, which is ADR 011's
pattern.

## Decision

1. **The paths are written at the call**:
   `readFile(path.join(process.cwd(), 'public/fonts/NotoSans-regular.ttf'))`, the scoped form
   the warning asks for. The warning count goes from 2 to 0. The page's trace drops by 518 files
   and 12 MB, and the two fonts stay in both traces.
2. **The traces are checked, not the warning.**
   `scripts/audit-function-traces.mjs` runs in `verify` after the build and reads every
   `.nft.json`. It fails on two things:
   - **Nothing extra.** A repository file in any trace, unless `RUNTIME_READS` names it for
     that trace. The fonts are required in the card's route and only allowed in the page.
   - **Nothing missing.** A `RUNTIME_READS` file absent from its trace. Such a file is on every
     developer's disk and on no Vercel function, so only production would fail.

## Consequences

- **Proven on real builds.** Restoring the original object path turns the probe red, naming 520
  files in each of the two traces, grouped by directory.
- **The "nothing missing" half could not be provoked on a real build, and that is recorded rather
  than glossed.** Four mutations all left the fonts traced:
  - the object path with `turbopackIgnore`;
  - the literal path with it;
  - a constant-folded `['public', 'fonts'].join('/')`;
  - a directory taken from an environment variable.

  Turbopack folds constant paths, and the trace pass follows a partly unknown one by wildcard.
  The check stays because that generosity belongs to two tools, not to this repository. Its unit
  tests drive it with synthetic traces, and a sentinel (`function-trace-strays`) proves the
  stray half's tests can fail.
- `RUNTIME_READS` is a hand-kept list. A new runtime read of a repository file must be added to
  it, with the trace it belongs to and a reason. That is the friction intended: a list, not
  `public/**`, because `public/**` would have admitted the nine public files the whole-project
  trace swept in.
