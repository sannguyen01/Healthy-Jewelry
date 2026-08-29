# 026 — A capability is not a verdict

## Context

Issue #45 reported that nothing had verified production since 2026-08-15. Its diagnosis
named the credential: `SHOPIFY_ADMIN_ACCESS_TOKEN` on the `production-readonly` environment
holds a token of the wrong kind, so `preflight-secrets.mjs` fails, so the live checks are
skipped. Issue #24 has said the same thing, correctly, since the 15th.

That diagnosis was right about the trigger and wrong about the scope, and the gap between
those is the finding.

**The Admin token is read by five of the seventeen live checks.** Counted from the source:

| Needs the Admin token | Needs nothing but Storefront/HTTP |
|---|---|
| Every product is published to the headless publication | Live site serves Shopify data, **not the static fallback** |
| Checkout policies exist and are not stock templates | A real cart yields a real checkout URL |
| The catalogue has product photography at all | Product metadata names the product, not "Not Found" |
| A photographed product actually shows its photograph | Site search finds Shopify products |
| Shopify serves the pinned API version *(Admin surface half)* | The Open Graph image renders a real PNG · renders within budget |
| | Rate limiting is distributed · A signed webhook revalidates |
| | Unknown URLs are not indexable · Revalidation endpoint is locked |
| | `PRODUCTION_SITE_URL` served directly · The deployment identifies itself |

Twelve checks were skipped for fourteen days by a credential none of them reads — including
the fabricated-catalogue detector, the only thing standing between customers and a static
catalogue whose variant IDs Shopify rejects at checkout. The webhook probe was skipped too;
it signs a payload with `SHOPIFY_WEBHOOK_SECRET` and lets the deployed route judge it, and
touches no Admin API at any point.

### Why it was skipped, exactly

The step read:

```yaml
if: steps.preflight.outputs.configured == 'true'
```

`configured` was `'true'` the whole time — it means "not *un*configured", and the state was
`misconfigured`, not `not-configured`. The step was skipped for a different reason: **an
`if:` that names no status function has `success()` implicitly ANDed onto it by GitHub.** A
failed preflight therefore skipped it, and the condition a reader sees is not the condition
that applied.

So the workflow used one answer to a governance question — *is this environment configured?*
— as the answer to an execution question — *can this check reach what it examines?* Those
are different questions, and every check paid the price of the strictest one.

## Decision

**Gate each live step on the credentials that step actually needs.**

`preflight-secrets.mjs` gains `CAPABILITIES`, a map from a capability name to the secrets it
requires, and emits one step output per capability. The workflow reads those:

```yaml
if: always() && steps.preflight.outputs.storefrontReady == 'true'
```

`always()` is explicit now, so the implicit `success()` cannot silently reintroduce the
coupling.

**The setup verdict is unchanged and still loud.** A misconfigured environment still fails
the preflight step, still turns the run red, and still files its issue. Verified by running
the real CLI against production's exact secret shape: it exits 1 with
`✗ Secrets set to the wrong kind of value`, *and* emits `storefrontReady=true`. Nothing is
papered over; the checks that can run simply run.

Two supporting changes make the result readable:

- **`required()` throws an unevaluable error.** A missing credential means a check could not
  look — it says nothing about whether the thing it examines is broken. Without this, a run
  with a wrong Admin token would print five fabricated production failures beside twelve real
  results. This is [ADR 010](010-a-control-that-cannot-fail.md)'s distinction, arriving
  through the credential instead of through the API's response, which is where
  `describeAccessDenial` already catches it.
- **The liveness probe asks whether the step *executed*, not whether it *succeeded*.** It
  required `conclusion === 'success'`, which conflates *nobody is checking* with *somebody
  checked and did not like what they found* — opposite situations with opposite remedies.
  Only the first is that probe's subject; the second is what the smoke run's own failure
  issue is for. `skipped`, `cancelled` and an absent step all remain dark, so the switch
  keeps its teeth.

### Isolation is deliberately not a capability

`SMOKE_SECRETS_SOURCE` exists to make repo-scoped secrets *visible* ([ADR 006](006-controls-must-fail-loudly.md)),
not to prevent a read-only probe from running — the secrets reach the job either way, so
blocking execution protects nothing. Its absence still fails the preflight, so the finding
stays exactly as loud; it simply no longer vetoes checks that would otherwise work.

## Consequences

- **Production goes from zero executing checks to thirteen**, without touching a credential.
  The remaining five stay `unevaluable` and named, and the run stays red until the token is
  fixed.
- **The tests are written against the shape production was actually in**, not one invented to
  make the change look good — the same rule [ADR 024](024-a-tool-never-pointed-at-a-known-answer.md)
  sets for probes, applied to the fix for a probe's subject.
- **The suite passed before the new tests were written**, because nothing exercised a step
  that ran *and failed*. That is ADR 024's lesson landing on this change: green over a case
  nobody wrote is not evidence, and the assertions pinning both halves — lit when it ran,
  dark when it was skipped or cancelled — were added before this was trusted.
- **This is a ninth instance of the family shape, in a new form.** The previous eight were
  controls that reported something other than the truth. This one reported the truth —
  "nothing is verifying production" — while the *reason* was scoped far more narrowly than
  the effect. A correct alarm can still describe a cause much smaller than the damage it
  does, and the fix is to ask what each part actually needs rather than what the whole
  requires.

Referenced by: `scripts/preflight-secrets.mjs`, `scripts/verify-production.mjs`,
`scripts/probe-smoke-liveness.mjs`, `.github/workflows/production-smoke.yml`,
[ADR 006](006-controls-must-fail-loudly.md), [ADR 022](022-absence-needs-its-own-alarm.md).
