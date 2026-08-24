# Architecture Decision Records

Decisions whose rationale is **cross-cutting** — restated in three or more places, or
spanning files that cannot reference each other.

## Why only those

This codebase explains itself unusually well in comments, and that is worth protecting.
A comment sitting directly above the line it justifies is read by everyone who touches
that line; an ADR is read by whoever goes looking. Moving *all* rationale out of the code
would trade locality for an index, and locality is the more valuable half.

So the rule is duplication, not length. When the same reasoning has to be restated in a
route, a doc, a runbook and a state file, those four copies drift — and the version a
reader trusts is whichever one they happened to find. That is what an ADR fixes. A long
docblock explaining one function stays exactly where it is.

Each record below replaces prose that existed in 3+ locations. The code keeps a one-line
pointer; the reasoning lives here once.

| # | Decision | Why it is cross-cutting |
|---|---|---|
| [001](001-two-webhook-secrets.md) | Two webhook signing secrets, and the trap between them | Restated in the route, `docs/webhooks.md`, the runbook, and `STATE.md` |
| [002](002-cart-completion-discriminator.md) | `pendingCheckoutCartId` tells a paid order from an expired cart | Spans `cart.tsx`, its tests, and `docs/testing-strategy.md` |
| [003](003-client-server-config-split.md) | Client-safe config is a separate module from secrets | Spans two config modules, a guardrail test, and `STATE.md` |
| [004](004-static-fallback-is-not-a-data-source.md) | The static catalogue is a fallback, never a source | The lesson behind three separate outages and two guardrails |
| [005](005-english-only-storefront.md) | The storefront stays English-only | A decision with live evidence, easily re-litigated without it |
| [006](006-controls-must-fail-loudly.md) | A control that depends on manual setup must fail loudly without it | Spans the smoke workflow, the preflight, the inventory, and the runbook |
| [007](007-regex-guardrails-have-unknown-coverage.md) | A guardrail that parses source with regex has unknown coverage | Spans three guardrails, the shared AST helper, and the testing strategy |
| [008](008-decisions-need-premise-detectors.md) | A decision needs a detector for the premise it rests on | One rule behind five separate decisions, two ADRs, `STATE.md` and the smoke workflow |
| [009](009-api-version-must-be-asserted-not-declared.md) | A pinned API version must be asserted against Shopify, not declared | Spans the public config, the client, the cart proxy, the smoke script and a premise |
| [010](010-a-control-that-cannot-fail.md) | A control's reporting path is part of the control | Third instance of the ADR 006 pattern; spans both workflows, a guardrail, and the runbook |
| [011](011-repeated-identical-failures-must-escalate.md) | A channel that repeats itself is a channel people mute | Spans the smoke workflow, `loop-constraints.md`, and `STATE.md` |
| [012](012-an-unassigned-escalation-is-not-yet-escalated.md) | An unassigned escalation is not yet escalated | Spans the smoke workflow, ADR 011, `loop-constraints.md`, `LOOP.md`, and `STATE.md` |
| [013](013-a-protection-that-can-only-grow.md) | A protection that can only grow is not a constraint | Spans `globals.css`, `Hero.tsx`, `hero-legibility.spec.ts`, `docs/testing-strategy.md` and `STATE.md` |

## Format

Context → Decision → Consequences. Short. An ADR that needs a table of contents has
become documentation and should live in `docs/` instead.
