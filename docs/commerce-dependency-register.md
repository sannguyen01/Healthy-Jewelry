# Commerce Dependency Register

**Compiled 2026-09-21 by `pnpm verify:commerce-contract --draft`, against `main` at the commit
this branch forks from. Reconciled on every run, in both directions.**

Every artefact in this repository that still references commerce machinery, with the eight
facts a removal needs. It is the acceptance criteria for
[`COMMERCE-ELIMINATION-CONTRACT.md`](../COMMERCE-ELIMINATION-CONTRACT.md) §3 and the burn-down
list for the workstreams in `docs/commerce-elimination-masterplan.md`.

## What a row means, and why the columns are these columns

A register of this kind has one characteristic failure: entries like *"remove checkout code"*.
That names no file, assigns no owner, and cannot be checked off — so it stays open forever
while looking like progress, and the decommission ends with somebody deciding it is probably
done. Every column here exists to make that sentence unwriteable.

| Column | Answers | Why it is not optional |
|---|---|---|
| Path | Which file | A register that names systems rather than files cannot be reconciled against a tree. |
| Identifiers | What it says | Two files can reference Shopify for entirely different reasons; the reason is the work. |
| Owning system | Who runs it | A file in this repository can be owned by GitHub, Vercel or Shopify, and the deletion order differs. |
| Trigger | What makes it run | An artefact nothing triggers is dead code; one a cron triggers is a live dependency. |
| Data | Personal, commercial, or neither | Decides whether removal is tidying or a retention question. |
| Action | What happens to it | `delete`, `rewrite` — never "review". |
| Proven by | What shows it happened | A removal nothing checks is a removal somebody will undo. |
| Workstream | Who does it | An unassigned deletion is not yet assigned ([ADR 012](adr/012-an-unassigned-escalation-is-not-yet-escalated.md)). |

## The two reconciliations

`evaluate()` in `scripts/lib/commerce-contract.mjs` runs both directions on every merge:

- **A file carrying a commerce identifier with no row here fails the build.** New commerce
  code cannot arrive quietly; it has to be registered, which means named and owned.
- **A row whose file no longer carries the identifier also fails the build.** A register that
  over-reports is one nobody finishes reading, and a phantom row makes a completed
  decommission look permanently unfinished. This is the direction most registers omit, and it
  is the one that keeps this document worth consulting.

Rows leave this table by being *done*. The row count is therefore the decommission's
burn-down number, and it only moves one way.

## What is deliberately not here

Files classified in the contract's §4 position table: dated records (`historical`), documents
carrying a supersession banner (`superseded`), and the checks whose job is to forbid the thing
they name (`negative-control`). Each of those classes is justified per glob in the contract and
each is itself enforced — a `superseded` document without a banner and a `negative-control`
that asserts nothing both fail. The exemption is never silent.

<!-- contract:register -->

### WS-A — Application

Routes, components, API handlers, configuration and the client bundle.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `src/app/api/revalidate/route.ts` | shopify-env shopify-name | Application | HTTP POST with a shared secret | credential names | delete — a static catalogue is revalidated by deploying, not by purging | `src/tests/unit/api-revalidate-route.test.ts` | WS-A |
| `src/app/api/version/route.ts` | shopify-name | Application | HTTP GET, uncached | public config | rewrite — the stale-build fingerprint stays, its Shopify fields go | `src/tests/unit/api-version-route.test.ts` | WS-A |
| `src/config/build-info.ts` | shopify-name | Application | Build time, inlined into the client bundle | public config | rewrite — drop the store domain from the fingerprinted key set | `src/tests/unit/api-version-route.test.ts` | WS-A |
| `src/config/shopify-public.ts` | shopify-name | Application | Imported by the client graph | public config | delete — nothing in the browser needs a store domain | `src/tests/unit/secret-exposure.test.ts` | WS-A |
| `src/config/shopify.ts` | shopify-env shopify-name | Application | Server-side import | credential names | delete — the last server-side reader of three Shopify secrets | `src/tests/unit/config.test.ts` | WS-A |
| `src/lib/shopify/api-version.ts` | shopify-env shopify-name | Application | Imported by `/api/version` | none | delete with `src/lib/shopify/` entirely | `src/tests/unit/api-version-contract.test.ts` | WS-A |
| `src/tests/unit/api-revalidate-route.test.ts` | shopify-env shopify-name | Vitest | Merge gate | none | delete with its subject | the subject is gone | WS-A |
| `src/tests/unit/api-version-route.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | public config | rewrite — the fingerprint assertions survive the Shopify ones | the subject is gone | WS-A |
| `src/tests/unit/cache-tag-contract.test.ts` | shopify-name | Vitest | Merge gate | none | delete with `cacheTags.ts` and the two routes that register tags | the subject is gone | WS-A |
| `src/tests/unit/config-env-branches.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | credential names | rewrite with the config it covers | the subject is gone | WS-A |
| `src/tests/unit/config.test.ts` | shopify-name | Vitest | Merge gate | credential names | rewrite with the config it covers | the subject is gone | WS-A |
| `src/tests/unit/rateLimit.test.ts` | shopify-name | Vitest | Merge gate | none | rewrite one fixture — the limiter keeps its job, its prefix changes subject | the limiter keeps running | WS-A |

### WS-B — Content

The catalogue schema and the vocabulary it validates against.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `src/tests/unit/collection-handle-contract.test.ts` | shopify-env shopify-name | Vitest | Merge gate | none | rewrite — the built-in-collection exemption has no vendor to be built into | the subject is gone | WS-B |

### WS-C — CI/CD

Workflows, probes, gates, fixtures and the machinery that watches them.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | shopify-env shopify-host shopify-name | GitHub Actions | push and pull_request | credential names | rewrite — drop the mock storefront env block once no test reads it | `src/tests/unit/workflow-validity.test.ts` | WS-C |
| `.github/workflows/diagnose-deployment.yml` | shopify-env shopify-host shopify-name | GitHub Actions | workflow_dispatch | credential names | delete with its script — it diagnoses a headless storefront | `src/tests/unit/workflow-validity.test.ts` | WS-C |
| `.github/workflows/production-smoke.yml` | shopify-env shopify-name | GitHub Actions | Six-hourly cron | credential names | rewrite — retire the Shopify tier once the browse-only smoke files issues | `src/tests/unit/smoke-liveness.test.ts` | WS-C |
| `docs/controls.json` | shopify-env shopify-name | Control registry | Six-hourly control audit | credential names | rewrite — retire the controls whose subject the decommission deletes (ADR 035) | `src/tests/unit/control-registry.test.ts` | WS-C |
| `playwright.config.ts` | shopify-env shopify-host shopify-name | Playwright | Every E2E run | public config | delete the mock storefront env injected into the web server | `e2e/retired-routes.spec.ts` | WS-C |
| `scripts/diagnose-deployment.mjs` | shopify-env shopify-host shopify-name | Deployment diagnosis | workflow_dispatch | credential names | delete — every question it asks is about a headless storefront | `src/tests/unit/deployment-verdict.test.ts` | WS-C |
| `scripts/lib/api-version.mjs` | shopify-env shopify-name | API version pin | Premise checks, six-hourly | none | delete — a pinned vendor API version with no vendor | `src/tests/unit/api-version-contract.test.ts` | WS-C |
| `scripts/lib/escalation.mjs` | shopify-name | Escalation decision | Production smoke | credential names | rewrite — the equivalence relation stays, its Shopify-shaped messages go | `src/tests/unit/escalation-decision.test.ts` | WS-C |
| `scripts/lib/premise-checks.mjs` | shopify-env shopify-name | Premise detectors | Production smoke, six-hourly | none | rewrite — five of six premises are about a store that will not exist | `src/tests/unit/premise-checks.test.ts` | WS-C |
| `scripts/preflight-secrets.mjs` | shopify-env shopify-host shopify-name | Smoke preflight | Production smoke, six-hourly | credential names | rewrite — it gates on five secrets that are being revoked | `src/tests/unit/preflight-secrets.test.ts` | WS-C |
| `scripts/probe-assertion-liveness.mjs` | shopify-env shopify-host shopify-name | Mutation probe | Weekly control audit | credential names | rewrite — its env scaffolding injects a mock storefront | `src/tests/unit/probe-liveness-decision.test.ts` | WS-C |
| `scripts/verify-premises.mjs` | shopify-name | Premise driver | Production smoke | none | rewrite with `premise-checks.mjs` | `src/tests/unit/verify-premises.test.ts` | WS-C |
| `src/tests/unit/api-version-contract.test.ts` | shopify-env shopify-name | Vitest | Merge gate | none | delete with its subject | the subject is gone | WS-C |
| `src/tests/unit/audit-workflow-secrets.test.ts` | shopify-env shopify-name | Vitest | Merge gate | credential names | rewrite — the auditor survives; its Shopify fixtures change name | the auditor keeps running | WS-C |
| `src/tests/unit/deployment-verdict.test.ts` | shopify-host shopify-name | Vitest | Merge gate | public config | rewrite with the verdict library | the subject is gone | WS-C |
| `src/tests/unit/escalation-decision.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | credential names | rewrite with the escalation library | the subject is gone | WS-C |
| `src/tests/unit/parser-fuzz.test.ts` | shopify-env shopify-name | Vitest | Merge gate | credential names | rewrite — the fuzzer survives; its secret-name corpus changes | the fuzzer keeps running | WS-C |
| `src/tests/unit/preflight-secrets.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | credential names | rewrite with the preflight | the subject is gone | WS-C |
| `src/tests/unit/premise-checks.test.ts` | shopify-env shopify-name | Vitest | Merge gate | none | rewrite with the premise detectors | the subject is gone | WS-C |
| `src/tests/unit/verify-premises.test.ts` | shopify-env shopify-name | Vitest | Merge gate | none | rewrite with the premise driver | the subject is gone | WS-C |
| `vitest.config.ts` | shopify-env shopify-host shopify-name | Vitest | Every unit run | public config | delete the mock storefront env stubs once no test reads them | `src/tests/unit/vitest-env-contract.test.ts` | WS-C |

### WS-D — Infrastructure

Environment variables, in the two places they are declared.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `.env.local.example` | shopify-env shopify-host shopify-name | Local developer environment | `pnpm dev` on a fresh clone | credential names | delete the nine Shopify rows; keep Upstash and Resend | `src/tests/unit/env-example-completeness.test.ts` | WS-D |
| `src/tests/unit/env-example-completeness.test.ts` | shopify-env shopify-name | Vitest | Merge gate | credential names | rewrite — the reconciler survives; its Shopify fixtures change name | the reconciler keeps running | WS-D |

### WS-E — DNS

Hostnames, and the one that still resolves into Shopify.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `docs/dns-domain-setup.md` | shopify-host shopify-name | DNS and domains | Any change to apex, `www` or the checkout hostname | none | rewrite — the checkout CNAME still points at `shops.myshopify.com` and is retired on a 30-day clock, not deleted on a whim | `scripts/probe-canonical-domain.mjs` | WS-E |

### WS-G — Analytics and privacy

What is measured, where it goes, and how long it stays.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `docs/analytics.md` | shopify-name | Analytics documentation | Design review; read before any event is added | none | rewrite — replace the conversion-funnel framing with relationship-quality signals, which are what this model actually has | `src/tests/unit/analytics.test.ts` | WS-G |

### WS-F — Third-party access

Everything whose deletion order is set by Shopify rather than by this repository.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `scripts/lib/webhook-signature.mjs` | shopify-env shopify-name | Webhook HMAC | Webhook verification script | credential names | delete after the Shopify subscriptions are deleted — never before | `src/tests/unit/webhook-signature-contract.test.ts` | WS-F |
| `scripts/verify-webhook-secret.mjs` | shopify-env shopify-name | Webhook secret verification | Manual, `pnpm verify:webhook` | credential names | delete with the webhook route, after the subscriptions | `src/tests/unit/webhook-signature-script.test.ts` | WS-F |
| `src/app/api/webhooks/shopify/route.ts` | shopify-env shopify-name | Application | Shopify webhook delivery, HMAC-signed | commercial data | delete **after** the subscriptions are deleted in Shopify Admin — reversing this leaves Shopify retrying a failing route for its full backoff schedule | `src/tests/unit/api-webhooks-shopify-route.test.ts` | WS-F |
| `src/lib/webhooks/retrySafety.ts` | shopify-name | Application | Imported by the webhook route | commercial data | delete with the webhook route | `src/tests/unit/webhook-body-bounds.test.ts` | WS-F |
| `src/tests/unit/api-webhooks-shopify-route.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | commercial data | delete with the webhook route | the subject is gone | WS-F |
| `src/tests/unit/webhook-body-bounds.test.ts` | shopify-env shopify-name | Vitest | Merge gate | commercial data | delete with the webhook route | the subject is gone | WS-F |
| `src/tests/unit/webhook-signature-contract.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | credential names | delete with the webhook route | the subject is gone | WS-F |
| `src/tests/unit/webhook-signature-script.test.ts` | shopify-env shopify-host shopify-name | Vitest | Merge gate | credential names | delete with the webhook route | the subject is gone | WS-F |

### WS-I — Documentation

Guidance a person or an agent acts on, which is why an obsolete one is not harmless.

| Path | Identifiers | Owning system | Trigger | Data | Action | Proven by | Workstream |
|---|---|---|---|---|---|---|---|
| `.claude/skills/project-conventions/SKILL.md` | shopify-env shopify-name | Agent guidance | Loaded at the start of every agent session | none | rewrite — **done**; the section that told an agent to register webhooks and add five credentials now describes the removal. What remains is the dated account of the spec-count change | `src/tests/unit/agent-doc-claims.test.ts` | WS-I |
| `CLAUDE.md` | shopify-name | Agent guidance | Loaded at the start of every agent session | none | rewrite — **done 2026-09-25**; what remains is the account of the three routes deliberately still standing, which closes with them (WS-F) | `src/tests/unit/agent-doc-claims.test.ts` | WS-I |
| `docs/failure-modes.md` | shopify-name | Failure registry | Design review | none | rewrite — **done**; the dead `/api/shopify` posture row is corrected, and what remains is a dated account of six failure modes deleted with the read path, named rather than silently dropped | `src/tests/unit/failure-mode-registry.test.ts` | WS-I |
| `docs/testing-strategy.md` | cart-mutation checkout-handoff inventory-check shopify-env shopify-host shopify-name | Test documentation | Every contributor and agent | none | rewrite — **done**; the commerce sections carry a dated banner at the top of the file and at the boundary of the historical block, and are kept because the lessons are about how verification fails rather than about a vendor | `src/tests/unit/doc-numeric-claims.test.ts` | WS-I |
| `e2e/COVERAGE.md` | shopify-name | E2E coverage map | Spec review | none | no rewrite needed — its references are a live coverage exception for `/api/webhooks/shopify` and a dated record of two wrong citations. Closes when WS-F deletes that route | `src/tests/unit/spec-anchor-contract.test.ts` | WS-I |
| `docs/commerce-elimination-masterplan.md` | shopify-env shopify-host shopify-name | Plan of record | Read before any workstream starts | none | delete when the last register row closes — a plan for work that is finished is a plan somebody will start | `src/tests/unit/commerce-contract.test.ts` | WS-I |
| `loop-constraints.md` | shopify-env shopify-name | Loop policy | Unattended loop runs | credential names | rewrite — **done**; the credential guidance no longer names a closing console and `@shopify/*` is gone from the escalation list. One dated sentence remains explaining why | `src/tests/unit/agent-doc-claims.test.ts` | WS-I |

<!-- /contract:register -->

## Reading the `Data` column

`none` means the artefact carries no data at all — it names a system. `public config` means a
store hostname or an API version: published by construction, and listed because a value
inlined into a client bundle at build time survives the removal of the variable that produced
it. `credential names` means the artefact names a secret without holding one, which is the
rule `docs/shopify-decommission-inventory.md` exists to keep. `commercial data` means the
artefact can receive order, product or customer payloads at runtime — three rows, all of them
the webhook path, and all of them in WS-F because their deletion order is set in Shopify
Admin rather than here.

**No row is marked `personal data`, and that is a measured claim rather than a comfortable
one.** `docs/headless-launch-inventory.md` records `ordersCount: 0` as of 2026-08-12 and the
store has never had a confirmed payment provider, so no order or customer record has ever
reached this application. The webhook route can receive `orders/*` topics — the subscription
exists — but has never been delivered one. That is a finding from this repository's own
records and it is not a legal opinion; WS-H puts it to a Vietnam-qualified adviser before the
Shopify plan is cancelled, because it is cheap to confirm and expensive to assume.

## The ordering constraint that outranks everything else here

Three WS-F rows carry a sequence that cannot be reversed:

```
freeze commerce
  → delete the Shopify webhook subscriptions in Shopify Admin
  → confirm no future delivery is expected
  → remove /api/webhooks/shopify and its HMAC utilities
  → remove SHOPIFY_WEBHOOK_SECRET
  → deploy
```

Removing the endpoint first leaves Shopify retrying against a failing route for its full
backoff schedule — noise a transition cannot afford, arriving exactly when the team is least
able to tell a real alarm from an expected one. `CLAUDE.md` records this as the reason those
routes are still standing, and the register does not override it.
