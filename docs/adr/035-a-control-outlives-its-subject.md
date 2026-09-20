# 035 — A control outlives its subject

**Status**: accepted · 2026-09-20
**Supersedes**: nothing. **Extends**: [ADR 020](020-a-test-that-cannot-fail-is-documentation.md),
[ADR 033](033-a-premise-that-expired-mid-decommission.md).

## Context

WS-4b/4c deleted the Shopify read path: `src/lib/shopify/index.ts`, `client.ts`,
`queries/products.ts`, `env-check.ts` and `tags.ts`, together with
`src/lib/catalog/types.ts` (the wire format) and `src/lib/utils/formatPrice.ts`. Every
surface now reads `@/lib/catalog`, per [ADR 034](034-the-catalogue-is-the-source.md).

Seven specs went with those modules, which is unremarkable — a test for a deleted function
is deleted. What was not anticipated is how many *other* controls broke, and how differently
each one broke. Eleven registries refused the change. The instructive ones:

| control | what it measured | what happened when its subject went |
|---|---|---|
| `cache-tag-contract` | tags **registered** by a fetcher vs **revalidated** by a webhook | the registering side vanished, so *every* surviving `revalidateTag` became an orphan and the widow check went vacuously green — one false alarm and one false assurance from the same missing producer |
| `failure-mode-registry` | `FallbackReason`'s six modes vs `docs/failure-modes.md` | the type was gone; the document still described six degradations of a read that no longer happens |
| `metadata-data-source` | "no route bypasses `@/lib/shopify` to read `hj-data`" | the rule inverted — `hj-data` is not a fallback to be bypassed, it is a file with no products in it |
| `typography-weights` | every `fontWeight` resolves to a downloaded face | a *new* spec rendering bundled Noto Sans at 700 was reported as `weight 700 on an unresolved font`: a confident failure about the wrong font |
| `currency-consistency` | every price carries the currency Shopify will charge | there are no prices; the rule collapsed into a simpler and stronger one |
| `homepage-fetch-budget` | Shopify round trips per homepage render | there are no fetches. The number it pinned had no units left |
| `production-smoke-handles` | `FALLBACK_ONLY_HANDLES` vs `SHOPIFY_ONLY_HANDLES` | the discriminator now separates two things that are the same thing |

The failure shape is one shape. **A control is written against a subject, and deleting the
subject does not delete the control — it silently changes what the control means.** Three
outcomes are possible and only one is loud:

1. it fails, naming a file that no longer exists (loud, easy);
2. it passes vacuously, because the set it compares is now empty (silent, worst);
3. it fails on correct behaviour, because its scope caught something it was never about
   (loud, but the obvious fix is to widen an exemption and lose the rule).

Outcome 2 is the one this project has paid for repeatedly. ADR 006 is `environment:
production-readonly` proving nothing; ADR 033 is `not-configured` meaning "nobody set this
up" after a decommission emptied the secrets; ADR 011 is eleven merges onto an unbuildable
`main` while every check reported `skipped`. A control whose subject was deleted joins that
family, and it arrives in bulk during a decommission rather than one at a time.

## Decision

**When a control's subject is deleted, the control is re-founded, suspended behind a premise
detector, or deleted — never narrowed to keep it green.**

Which of the three, decided explicitly:

- **Re-found** when the invariant survives in a new mechanism. `metadata-data-source` still
  asks whether a page and its metadata read the same catalogue; only the catalogue changed.
  `currency-consistency` became `price-absence-contract`, and its rule got *stronger*: not
  "every price carries the right currency" but "no price, in any currency, anywhere."
  `homepage-fetch-budget` became `homepage-composition-contract` — two of its assertions
  were never about fetches, and they kept the file alive.
- **Suspend behind a premise detector** when the invariant is real but temporarily
  unaskable. `cache-tag-contract`'s orphan and widow checks are commented in place, not
  deleted, and a new test asserts `registered.size === 0` and fails — naming both checks by
  name — the moment anything registers a cache tag again. The conditions return with the
  producer.
- **Delete, with the removal recorded where the claim was.** `docs/failure-modes.md` keeps
  the six `FallbackReason` rows as prose under a heading saying they are gone and why. A
  table that quietly loses six rows is indistinguishable from a table nobody maintains.

Two supporting rules, both learned from outcome 3:

- **Scope a source scan to what it is about.** `typography-weights` now walks past
  `src/tests`: a spec declaring a weight is exercising a component, not shipping a
  typeface. The exemption is a directory with a reason, not a filename added under
  pressure.
- **A detector that produces only absences must be pointed at known answers.**
  `price-absence-contract` carries a table of eleven lines — six that are money, five that
  are punctuation — because its first two drafts were both wrong in the *loud* direction
  (`$` matched every template literal, then every regex end-anchor) and the third could
  just as easily have been wrong in the silent one. This is [ADR
  024](024-a-tool-never-pointed-at-a-known-answer.md) applied to a rule whose passing state
  is an empty array.

## Consequences

- The suspended orphan/widow checks are **not** coverage today. That is stated in the file
  rather than implied, and `nothing registers a cache tag` is what stops the suspension
  becoming permanent by inattention.
- `docs/failure-modes.md`'s parse floor moved from 15 rows to 10. Lowering a tripwire to
  accommodate a change is usually wrong, so the reason is written at the assertion: the
  number exists to catch the *parser* returning nothing, not to ratchet the document's
  size. Twelve rows survive; a syntax break takes the count to zero, not to nine.
- `.claude/skills/project-conventions/SKILL.md` records why the unit spec count fell from
  91 to 86 — seven specs deleted, two added, three renamed — because a falling spec count
  is exactly what that reconciliation exists to make somebody explain.
- One control is **knowingly left inert**: `scripts/verify-production.mjs` and its
  `FALLBACK_ONLY_HANDLES` / `SHOPIFY_ONLY_HANDLES` discriminator. It is registered in
  `docs/controls.json`, invoked by `production-smoke.yml`, and its premise — that a live
  site serving the bundled catalogue is a *defect* — is now false. It is not re-founded
  here because `scripts/verify-browse-only.mjs` is its successor and pointing the workflow
  at it is WS-6's change, not WS-4's. Recorded so the gap is a decision rather than an
  oversight.

## Spans

`src/tests/unit/cache-tag-contract.test.ts`, `failure-mode-registry.test.ts`,
`metadata-data-source.test.ts`, `typography-weights.test.ts`,
`price-absence-contract.test.tsx`, `homepage-composition-contract.test.ts`,
`collection-handle-contract.test.ts`, `svg-coverage.test.tsx`,
`opengraph-bundled-font.test.tsx`, `docs/failure-modes.md`, `scripts/lib/sentinels.mjs`,
`.claude/skills/project-conventions/SKILL.md`.
