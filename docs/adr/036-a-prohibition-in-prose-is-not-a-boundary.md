# ADR 036 — A prohibition in prose is not a boundary

**Date**: 2026-09-25
**Status**: Accepted
**Supersedes**: nothing. Extends [ADR 018](018-a-claim-about-a-control-is-not-a-control.md)
and [ADR 034](034-the-catalogue-is-the-source.md).

## Context

Every prohibition this repository has written in prose has been violated at least once,
usually by somebody acting in good faith on a different document.

`/terms` listed three card-and-wallet brands as accepted payment methods for eleven days
after Add to Bag was deleted. `/shipping` opened "All orders ship free" with no way to place
an order. `/faq` told a customer to email "with your order number" about an order-confirmation
email this site has never sent. `docs/controls.json` claimed a merge gate GitHub had never
been told about. A pinned vendor API version was believed for seven months after the vendor
retired it.

None of those went red. Prose has no type checker, and every reconciliation this repository
owns checks something else: numbers in documents, claims about controls, rendered geometry.
A sentence describing a capability is none of those.

The decommission makes this worse in a specific way. **Its output is an absence**, and an
absence is the one thing nobody notices returning. A cart component re-added next quarter
looks like a feature. A commerce SDK arriving as a transitive of an image plugin looks like
lockfile churn. A runbook telling somebody to reconnect the storefront looks like
documentation. `docs/browse-only-masterplan.md` is a careful plan that nothing enforces, and
the day it stops being followed is a day that looks exactly like every other day.

The obvious control — fail the build on any tracked file containing `shopify` — is unusable,
and the reason decides the design. It calls `src/tests/unit/browse-only-copy.test.tsx` a
defect, and that file is the check that *forbids* the word. It calls seventeen ADRs defects
for recording decisions correctly. A guardrail that fails on its own guardrails collects
exemptions until it is quiet, which is [ADR 011](011-repeated-identical-failures-must-escalate.md)'s
muting pattern pointed at a linter.

## Decision

**The prohibition becomes a specification that is parsed, and a register that is
reconciled — in both directions, on every merge.**

`COMMERCE-ELIMINATION-CONTRACT.md` states what may not exist, in tables addressed by HTML
anchors so the prose around them can be rewritten without breaking the parse. A missing
section throws rather than parsing to an empty list, because a rule enforced against nothing
passes and checks nothing.

A finding is a function of **the identifier and the position it occupies**, never the
identifier alone:

- **Scope** — `value` (a credential value: a finding in any position, in any class, with no
  exemption), `absolute` (cart, checkout, payment, customer, discount, Storefront and Admin
  request shapes: no register row excuses one in running code), `staged` (the vendor name,
  its hosts, its environment variables: permitted on a declared and shrinking surface).
- **Position** — `code` is outside comments; `prose` is comments and Markdown. **A comment
  inside a code file is free**, deliberately. The paragraph above the webhook route
  explaining why it is still standing is the most useful sentence in that file, and a rule
  that deletes it makes the decommission harder to finish rather than closer to done.
- **Class** — `excluded`, `historical`, `specification`, `negative-control`, `superseded`,
  and `executable` as the default, so **a new file is a defect until somebody classifies
  it**. Every non-default class has an earning condition that is itself checked: a
  `superseded` document must carry a dated banner in its first fifteen lines; a
  `negative-control` must contain an assertion; a `specification` must be named in another
  file's *code*, because a mention in a comment is a citation and only a read breaks when the
  document changes shape.

`docs/commerce-dependency-register.md` carries one row per remaining artefact with the eight
facts a removal needs — path, identifiers, owning system, trigger, data class, action,
proving check, workstream. A file carrying a commerce identifier with no row fails the build.
**A row whose file no longer carries one fails too.** That second direction is the one most
registers omit, and it is what keeps the document worth reading: a register that over-reports
makes a finished decommission look permanently unfinished.

## Consequences

The register's row count is the decommission's burn-down number, and it moves one way. It
started at 58.

Rules that cannot be argued around have to be lived with, and the first thing the scanner
failed was its own author's work — twice. A credential-shaped literal in the test that proves
the credential rule fires; then a sentinel whose scar text named payment brands in a `.mjs`
string literal. Both were fixed by changing the text, because the `value` and `absolute`
scopes admit no exemption. That is the intended cost and the clearest evidence the rule is
real.

Four guardrails now overlap on the same subject and that is deliberate, not redundancy.
`price-absence-contract` forbids a currency symbol reaching a render. `browse-only-copy`
forbids copy describing a capability the deployment lacks. `commerce-route-inventory`
reconciles the route tables against the filesystem, `next.config.ts` and the E2E spec.
This contract forbids the identifier arriving at all. Each catches a different stage, and
[ADR 035](035-a-control-outlives-its-subject.md) is the warning against assuming one of them
covers another.

The limits are recorded in `docs/controls.json` rather than left to be discovered. The
position split is a lexer, not a parser, so a `//` inside a string literal ends the code half
early — a direction that weakens a finding rather than inventing one, asserted as a known
limit rather than described as a safeguard. The scan reads tracked text files, so a
dependency reached through a generated path or an assembled environment variable is invisible
to it; the bundle-level question needs a build-output scan that does not exist yet.
`negative-control` and `specification` are whole-file exemptions, so a genuine regression
inside one of those files would not be seen — bounded by their earning conditions, not
eliminated.

Registering it cost the usual tax, and the tax is the point of
[ADR 035](035-a-control-outlives-its-subject.md): three registries refused the change until
they were updated with it — the spec-anchor coverage map, the numeric-claims registry, and
the sentinel list. The `commerce-boundary` sentinel now mutates the contract to downgrade the
one class allowed to name a payment brand, and `probe-assertion-liveness.mjs` reports it
alive. A gate never observed failing is documentation.
