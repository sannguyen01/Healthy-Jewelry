# 019 — An unclassified entry is an unverified one

## Context

`--sage` shipped as 9–13px text in four places, at contrast ratios between 1.97:1 and
2.36:1 against a 4.5:1 floor. It did not fail the contrast check.

It was **absent from the list the check reads**. `design-tokens-contrast.test.ts` iterates
`TEXT_PAIRINGS`, a hand-maintained table of every foreground/background combination the design
system uses for text, and asserts each clears its level. A token nobody had thought about was
in no row, so it was never measured — and the suite reported green with the same confidence it
would have had if `--sage` were compliant.

That is a third state between pass and fail, and it is invisible from either side. A failing
check names what is wrong. A passing check implies everything named is right. Neither says
anything about what was never named, and nothing in the output distinguishes *checked and fine*
from *not checked*.

The fix for colour was to make the enumeration total: every token must appear in `TEXT_PAIRINGS`
or in `ACCENT_ONLY`, with no third option. That closed the hole for one list. It did not ask how
many other lists in this repository have it.

Three do, and one had already gone wrong:

**The sitemap.** `src/app/api/sitemap/route.ts` named sixteen paths by hand. `/contact` — a
marketing route with a working contact form — was not among them. Neither were `/cart`,
`/checkout` and `/account`, which are absent *correctly*. Four omissions, three of them right,
and nothing anywhere saying which. A missing sitemap entry produces no error and no warning: the
page renders, the links work, and it is simply less discoverable than intended for as long as
nobody counts. The list also carried a second copy of `hjCollections` — five collection paths
written out one per line, with nothing joining them to the catalogue they came from.

**The preflight.** Three hand-maintained lists describe the same five credentials: the `env:`
block on the preflight step, the argument list on the line below it, and `WHERE` inside
`preflight-secrets.mjs`. A secret added to the workflow and not to the argument list is a secret
the preflight never looks at — so it fails later, in a downstream step, with an error that reads
as an outage. That is the exact failure `SHAPE_RULES` exists to prevent, arriving through the
list instead of through the value.

**The safety policy.** `gate.yaml` denies twelve paths to an unattended loop.
`loop-constraints.md` told a human three. `vercel.json` was added to the machine-readable policy
by [ADR 015](015-a-gate-that-was-only-ever-documented.md) and never reached the prose, so the two
documents disagreed about what a loop may rewrite, and whichever a reader found first was the
answer they got. Its own header says it "Mirrors loop-constraints.md" — a mirror nobody looks
into.

## Decision

**Every enumeration that mirrors a source of truth is either derived from that source, or
reconciled against it by a test that requires each divergence to be classified.** No third
option, because "not in the list" is not a state anything can observe.

Derivation first, where it is available — it is strictly better, because there is then only one
list. The sitemap's five collection paths now map over `hjCollections`: a collection added to the
catalogue reaches the sitemap without anyone remembering this file exists. Reconciling two lists
is the fallback for when there genuinely are two.

Where reconciliation is the only option, the test runs in **both directions**. One direction
catches the omission; the other catches the fossil — an entry describing something that is gone,
harmless today and indistinguishable tomorrow from an entry that was dropped by accident.

Applied to the three lists above:

- `sitemap-completeness.test.ts` walks `src/app/**` and requires every route to be in
  `STATIC_PAGES` or in the new exported `SITEMAP_EXCLUDED`, which maps a path to the reason it is
  excluded. It also checks the reverse — a published path that no route serves spends crawl
  budget teaching a search engine the site is broken — and asserts the rendered XML carries what
  the list declares, because a correct list and a broken template ship nothing while passing
  everything.
- `preflight-enumeration.test.ts` holds the three secret lists together, and adds the assertion
  that matters most: **every secret the smoke job references anywhere must be one the preflight
  is given.** It also requires each `SHAPE_RULES` key to be in the argument list, since a shape
  rule for a secret nobody passes is dead code that reads as coverage.
- `gate-denylist-contract.test.ts` compares `gate.yaml` against a ```denylist-paths fence in
  `loop-constraints.md`, both ways, and separately pins the four paths ADR 015 reasoned about —
  because an edit that dropped one from *both* lists would satisfy the agreement checks while
  quietly removing the protection.

The fence convention is the same one [ADR 018](018-a-claim-about-a-control-is-not-a-control.md)
introduced for check names: structural rather than prose-parsed, because a guardrail that guesses
at grammar has unknown coverage ([ADR 007](007-regex-guardrails-have-unknown-coverage.md)).

## Consequences

- **`/contact` is in the sitemap.** It should have been all along. The fix is one line; the
  check that makes it stay is the deliverable.
- **Every parser added here reports what it found, not only what matched.** Each of these tests
  opens by asserting its own parse was non-empty, because every comparison in the file is
  vacuously true over an empty set. This repository has already shipped a security audit that
  exited 0 on a shallow clone by finding nothing, and a smoke workflow whose two real checks
  could not fail.
- **The remaining hand lists are named rather than closed.** `EXEMPT` in
  `typography-weights.test.ts` and in `env-example-completeness.test.ts` are exemption lists —
  the pattern is sound, since each entry carries its reason, and their risk is the opposite one:
  an exemption that outlives the thing it exempted. Left as-is deliberately; they are recorded
  here so the next person asking "what else is hand-maintained" does not have to re-derive the
  inventory.
- **This is ADR 018's rule applied to data instead of to controls.** There, a document may not
  claim a control is configured without a probe. Here, a list may not claim to be complete
  without a comparison. Both are the same sentence: an assertion that nothing checks is a
  decoration.

Referenced by: `src/app/api/sitemap/route.ts`, `scripts/preflight-secrets.mjs`,
`loop-constraints.md`, `gate.yaml`, and the three tests named above.
