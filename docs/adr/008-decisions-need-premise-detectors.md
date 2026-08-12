# 008 — A decision needs a detector for the premise it rests on

## Context

Every guardrail in this project asserts **"the code still does X."** Not one asserted
**"the premise behind X still holds."**

That gap is invisible while the premises hold, which is why it survived six rounds of
audit without being named once. A decision made on good evidence quietly becomes a
decision made on stale evidence, and nothing anywhere goes red.

Three instances were raised. Scanning for the *shape* rather than the instances found two
more, one of which was introduced by the change that fixed the soft-404 in Round 5:

| Decision | Premise it rests on | Detector before |
|---|---|---|
| OG route dropped `runtime = 'edge'` | Cold start stays under crawler unfurl timeouts | none |
| `SHOPIFY-PAYMENTS` is human-only | Admin API cannot expose provider state | none |
| [ADR 005](005-english-only-storefront.md) — English-only | Store has no `vi` locale content | none |
| `dynamicParams = false` on `/shop/[collection]` | Shopify's collections ⊆ `hjCollections` | none |
| `custom.spec` deliberately empty | No product has real measurements yet | none |

Each was recorded honestly and with evidence. That is what makes the pattern worth an
ADR: **none of these is a case of sloppy reasoning.** They are five careful decisions that
each wrote down *why* and never wrote down *when to look again*.

Two of them were measured rather than assumed while writing this:

- **Open Graph.** Against a production build: cold **0.513s**, warm **0.054s**, image
  **15,282 bytes**. Published guidance puts unfurl timeouts at 3–5s and Slack caps fetched
  content at 32kB, so both look comfortable. But 0.51s is a **floor, not an estimate** —
  locally the Shopify call fails fast against a placeholder domain, where production
  performs a real Storefront round-trip on top of a Vercel Node cold start.
- **Collections.** Shopify has `rings, necklaces, earrings, bracelets, charms` plus
  `frontpage`; `hjCollections` has the same five. Matches today. A sixth collection created
  in Shopify Admin **hard-404s** — worse than the soft-404 `dynamicParams = false` was
  introduced to fix, and silent.

## Decision

**A decision that rests on a checkable premise ships with a check for that premise.**

The premise checks live in `scripts/lib/premise-checks.mjs`, are run by
`scripts/verify-production.mjs` against the live store, and are reported in a section of
their own.

Three properties make this a tier rather than four more assertions:

**1. Pure evaluators, network at the caller.** Each function takes already-fetched data and
returns a verdict. That makes the **drifted** branch testable, and the drifted branch is
the one that never runs locally — so it is the one most likely to be wrong the day it
finally fires. This project has paid for that before: the completed-order branch of the
cart could not be exercised in development and was the half that broke. Both states of
every premise are covered in `src/tests/unit/premise-checks.test.ts`.

**2. Drift is not failure.** A `vi` locale appearing is an *opportunity*, not an outage.
Premises report separately from the pass/fail checks and never turn the run red; drift
opens a `premise-drift` labelled issue, distinct from the `production-smoke` failure issue,
which closes again when every premise holds. Failing on opportunity is how the 24-minute
E2E suite became noise nobody read. The one exception is severity in the *message*:
`COLLECTION-SET-DRIFT` is marked `blocking` because customers are getting 404s while it
holds false.

**3. A premise check may expire itself.** `SHOPIFY-PAYMENTS` cannot be verified today —
`PaymentSettings` exposes only `supportedDigitalWallets`. But `Order.paymentGatewayNames`
*is* readable, so the moment a single order exists the premise "not machine-verifiable"
stops being true and the check upgrades from a reminder into a real assertion of the
gateway. Human once, then automatic. That is the honest alternative to a deadline nobody
agreed to — the thing a stale `TODO(2026-Q3)` pretends to be.

## The general rule

> **An assumption recorded in prose expires silently; an assumption recorded as a check
> expires loudly.**

This is the sibling of [ADR 007](007-regex-guardrails-have-unknown-coverage.md)'s rule that
*a guardrail scoped narrower than its invariant reports success about the part it examined,
in the voice of the whole*. Both are failures of what a green run means. 007 is about a
check that looks at too little; 008 is about a decision with no check at all.

The test for whether a decision needs one is short: **can the thing that would change my
mind be read from an API?** If yes, read it on a schedule. If no — `VISUAL-QA-LIVE` needs a
human with a phone — say so explicitly rather than leaving a reader to assume it is
watched.

## Consequences

- New ADRs and new `STATE.md` items state their re-check trigger, or state that none is
  possible. ADR 005 was amended to add the one it was missing.
- `SHOPIFY-SPEC-METAFIELD` and `SHOPIFY-PAYMENTS` now watch themselves; the backlog says
  which items do and which still need a human.
- **A premise check that only warns can be ignored.** The separate issue is the mitigation.
  If `premise-drift` issues start accumulating unread, the right response is to promote the
  specific premise to a failing check, not to make all of them fail.
- The whole tier ships **unproven against production**, because `production-smoke` has
  still never executed — scheduled triggers only fire from the default branch. Stated again
  rather than allowed to fade.
- The 2.5s Open Graph budget is derived from published unfurl-timeout guidance, not from
  Vercel measurements. First real runs may show it needs adjusting; the number is recorded
  with its derivation so changing it is an informed decision rather than a silent
  loosening.

Referenced by: `scripts/lib/premise-checks.mjs`, `scripts/verify-production.mjs`,
`.github/workflows/production-smoke.yml`,
`src/app/products/[handle]/opengraph-image.tsx`, `docs/testing-strategy.md`, `STATE.md`.
