# 007 — A guardrail that parses source with regex has unknown coverage

## Context

Two guardrails matched patterns against raw source text: `metadata-data-source.test.ts`
(no route may read the static catalogue directly) and `cache-tag-contract.test.ts` (every
cache tag registered must be revalidated, and vice versa). Both encode rules that had
already cost real defects.

They were reviewed as fragile, with three specific evasions predicted. **Two of the three
were wrong, and two real gaps went unnamed.** Measured, not argued:

| Pattern | Regex behaviour |
|---|---|
| `revalidateTag(\n  expr\n)` across lines | **caught** — the pattern already spanned newlines |
| `import { getProductByHandle as x }` | **handled** — the alias was split off correctly |
| a call written inside a comment | ✗ **false positive** |
| `import * as hj from '@/lib/data/hj-data'` | ✗ **missed entirely** — not predicted |
| a second import of the same module in one file | ✗ **missed** — `.match`, not `.matchAll` |

The lesson is not "regex is fragile" — everyone already believes that, which is why the
prediction felt safe. It is sharper:

> **Nobody could say what these guardrails covered, including the people who wrote and
> reviewed them.** Confident predictions about the coverage were wrong in *both*
> directions — imagining holes that were closed, and missing holes that were open.

A guardrail's value is entirely in the set of things it catches. When that set is
unknowable, the green run means something unknown.

## Decision

Both guardrails parse with the **TypeScript compiler API**, through a shared helper at
`src/lib/analysis/tsAstScan.ts`.

`typescript` is already a devDependency, so this costs **no new packages** — `ts-morph`
would have been a dependency to solve a problem the compiler already solves.

What changes structurally, rather than by adding another rule:

- **Comments are never nodes.** The false positive is not filtered out; it cannot occur.
- **Every import form is a distinct node type.** Named, aliased, default, namespace and
  re-export are each handled explicitly, and a form nobody anticipated shows up as an
  unhandled node type rather than as silence.
- **Formatting is irrelevant.** A call is a `CallExpression` however it is wrapped.

Each converted guardrail keeps one test that feeds the **old regex** its evading input and
shows it missed — so the reason for the parser survives the next person who finds it
verbose.

## The pattern this belongs to

A second instance appeared immediately after this ADR was written, and it was not about
regex at all.

`cache-tag-contract.test.ts` read **two files by name**. It therefore never saw
`src/app/api/revalidate/route.ts`, a third revalidation surface still calling
`revalidateTag('collections')` — the exact orphan the contract existed to eliminate,
surviving the fix that removed it everywhere the test happened to look.

The parser was not the issue there; the **scope** was:

> **A guardrail scoped narrower than its invariant reports success about the part it
> examined, in the voice of the whole.**

Both failures are that sentence. The metadata guardrail walked only `src/app` and missed a
catalogue read in `src/components`. The tag contract named two participants and missed the
third. Neither was wrong about what it checked; both were read as checking more.

The operational rule: **scan everything and exempt explicitly.** An exemption list states a
reason and shows up in review. A narrow scan states nothing and looks identical to full
coverage.

Widening has a cost worth expecting — it changes what a query means. Broadening the tag
scan to every module immediately matched the product `tags` field in `hj-data.ts`,
reporting `rings` and `titanium` as cache tags. The fix was to identify a Next cache-options
object *structurally* (by its `revalidate` sibling) rather than by hoping a property name is
unique, which is the same move as parsing instead of matching.

## Consequences

- Coverage is now enumerable: the node types handled are listed in one file.
- New guardrails start from `tsAstScan.ts` rather than a fresh regex, which is the part
  that compounds.
- `src/lib/analysis/` is **test-only**. It must not be imported by application code, or
  `typescript` becomes a runtime dependency. `secret-exposure.test.ts` already fails if a
  server-only module becomes reachable from the client graph.
- Text matching is still right for **non-code** inputs. `audit-workflow-secrets.mjs` scans
  YAML and strips comments by hand, correctly — the argument here is about parsing a
  language we already ship a parser for, not about regex in general.

Referenced by: `src/lib/analysis/tsAstScan.ts`,
`src/tests/unit/metadata-data-source.test.ts`, `src/tests/unit/cache-tag-contract.test.ts`,
`src/tests/unit/homepage-fetch-budget.test.ts`, `docs/testing-strategy.md`.
