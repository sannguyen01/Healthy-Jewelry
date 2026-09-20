# 034 — The catalogue is the source

**Supersedes [ADR 004](004-static-fallback-is-not-a-data-source.md).**

## Context

ADR 004's rule was: *the static catalogue is a fallback, never a source.* It is reachable
only from behind `@/lib/shopify`, every fetcher there degrades to it, and a module reaching
past that door "is not using the fallback; it is bypassing Shopify permanently, on every
request, in production."

That was right, and the five defects it lists are the argument for it — 20 of 22 products
serving `Product Not Found`, a site search that could not find a single real product, a
homepage illustrating collections with products that are not in them. Every one of them was
one module reading product data from somewhere its neighbours did not.

The decommission removes the other side of that door. There will be no Shopify to be
authoritative, so "fallback" stops describing anything, and the question ADR 004 answered —
*which of two sources wins?* — stops having two candidates. Left in place, its rule would
say the only remaining data source may not be read.

The premise expired. The **reasoning did not**, and this ADR is mostly that reasoning
pointed the other way.

## Decision

1. **`src/content/catalog/**` is the only product data source.** One JSON file per product
   and per collection, reviewed as content in Git rather than edited in an admin console.
2. **`src/lib/catalog/**` is the only runtime access layer.** No page, component, API route,
   script or test may import a raw record.
3. **Every record is validated against a Zod schema at module load**, which during a build
   is build time, and an invalid record **stops the build**.

### Two controls, because the rule is worth exactly its enforcement

**Build-time validation.** `next.config.ts` imports the reader and reads from it. That
import *is* the check: loading `src/lib/catalog` parses all 22 records and throws on the
first bad set.

The import is load-bearing and looks like it is not, which is its own hazard — a bare
side-effect import is the shape an "unused import" cleanup deletes. So the config calls
`getAllProducts()` rather than importing for effect, and `catalog-content.test.ts` reads
`next.config.ts` back out and fails if either the import or the call goes. The order matters
too: `manifest.ts` imports its JSON with **relative** paths, because Next's config loader
does not apply tsconfig path mappings, and an `@/` alias anywhere in that import graph would
break the build-time check by *skipping* it rather than by failing.

This was verified by breaking it, three ways, and watching the build go red each time:

| mutation | build exit | what it said |
|---|---|---|
| a product title set to `""` | 1 | `1 invalid product record(s)` · `Too small: expected string to have >=1 characters` |
| a `price` field added back | 1 | `1 invalid product record(s)` · `Unrecognized key` |
| two records claiming one handle | 1 | `Duplicate product handle(s) … A handle is a URL` |

Before `next.config.ts` imported the reader, the first of those passed `pnpm build`
cleanly. The claim was prose for about twenty minutes, which is
[ADR 018](018-a-claim-about-a-control-is-not-a-control.md) happening in real time and is why
it is written down here rather than quietly fixed.

**An AST-resolved import boundary.** `catalog-import-boundary.test.ts` walks every `.ts` and
`.tsx` file in `src/` and `e2e/` through the TypeScript compiler API and fails on any module
outside `src/lib/catalog/**` that reaches into `src/content/catalog/**`.

Not a regex. [ADR 007](007-regex-guardrails-have-unknown-coverage.md) records why, and three
cases decide it:

| written as | a text scan says | the truth |
|---|---|---|
| `// import x from '@/content/catalog/…'` | violation | a comment is not a node |
| `` `@/content/catalog/${h}.json` `` | violation | a template literal is not an import |
| `await import('@/content/catalog/a.json')` | violation only if you matched that form | a real breach |

The third is the one that matters. Moving an import inside an `await import()` reads as a
lazy-loading tweak and silently reopens the wall, so `moduleSpecifiers` covers static
imports, bare imports, re-exports, `import()` and `require()`, and resolves relative
specifiers against their own file before comparing.

It too was verified by breaking it: a static import added to `src/app/shop/page.tsx` and a
dynamic one added inside a function in `src/app/search/page.tsx` each turned it red, and so
did emptying the reader's own content imports — because a boundary around an empty room is
satisfied trivially.

### The schema is not the old type with the price fields deleted

`src/lib/catalog/types.ts` is still the Shopify wire format; PR #77 moved it and changed
"not a field, not a name, not an export". Measured against the fifteen public-identity
fields the decommission must preserve, it carries five outright, five only in a commerce
shape, and **five not at all**: SKU, care instructions, an availability statement, a
last-reviewed date, and legacy redirects.

Those five have no source anywhere. Three ways to handle that, one honest:

| option | why not |
|---|---|
| invent plausible values | ships fabricated claims about a real brand's products |
| leave the field optional | `undefined` reads as "no care instructions exist", which is itself a claim |
| **an explicit pending state** | says *not authored yet*, and can be counted |

The decommission brief already reached this for photography — it "converts *we have no
photo* from an accidental absence into an explicit content state". Every unsourced field
here gets the same union, with one extra benefit: a pending state is **countable**.
`totalPendingFields()` is 51 today (17 products x 3), and `catalog-content.test.ts` ratchets
it. Down is progress; up means a new record shipped thinner than its neighbours, which is
precisely what an optional field hides.

Media gets the same treatment in three states rather than two, because `featuredImage: null`
conflated *this piece is drawn, deliberately* with *nobody has decided what this looks like*.
CLAUDE.md is explicit that the hand-drawn SVGs are "the site's whole visual language today",
so a chosen `illustration` is not debt and does not count; `illustration-pending` is and does.

## Consequences

- **`Sale` leaves the badge vocabulary.** It was derived from an active compare-at price,
  and there are no prices. One product carried it — `split-ring-titanium` — and becomes
  unbadged rather than being given a badge it never earned.
- **Sizes stop being variants.** `['Default Title']` and `['Default']` were Shopify
  placeholders reaching the UI; one size is now the empty list. The generator that produced
  these records matched only the first spelling and leaked `"Default"` into ten files —
  caught by the test, not by review, which is the argument for having written the test
  first.
- **No price, currency, variant id or checkout URL exists in the schema at all.** Not
  nullable: absent. A page trying to render one fails to compile.
- **The five-product delta stays visible.** 17 records here, 22 in Shopify.
  `catalog-content.test.ts` asserts `17 + 5 = 22` so the gap is a number that has to be
  edited deliberately when WS-2 closes it — and so a product silently disappearing fails too.
- **ADR 004 is superseded, not deleted.** Its defect list is the reason this boundary is a
  compiler and not a convention, and it should be read before anyone touches
  `src/lib/catalog/index.ts`.
- **Nothing is wired to the new reader yet, and nothing Shopify has been removed.** The old
  path is still the one serving pages; this is deliberate, per the decommission plan's G4
  gate — the new catalogue has to render the same browsing experience in Preview while the
  old one is still there to compare against.
