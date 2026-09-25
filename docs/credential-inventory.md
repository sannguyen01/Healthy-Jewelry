# Credential inventory

Every credential this project uses or has ever used, where it lives, what it can reach, and
what to do about it.

**Why a document rather than a query.** GitHub has no "unused secret" view. Deleting a
workflow leaves its secrets in repository settings forever — no expiry, no reference to
what needed them, nothing marking them unused. Vercel and Shopify are the same. An orphan
is invisible by default, so it has to be written down somewhere or it will not be noticed.

Regenerate the GitHub half at any time:

```bash
pnpm audit:secrets
```

That reads **git history**, so it reports what workflows still reference — not what is
still configured. The two halves have to be compared by a human against
**Settings → Secrets and variables → Actions**. That is the whole point of the exercise.

Last reconciled by hand: **2026-09-21**.

**The git-history half is no longer hand-run.** `scripts/audit-workflow-secrets.mjs` runs on
every `verify` job as *Audit workflow credentials*, and its findings go to the run's job
summary — read them there rather than from this file, which records a point in time. The step
is `continue-on-error` on purpose: it exits 1 while orphans exist, and a blocking check on a
finding only a human with console access can clear would freeze every merge (the ADR 008
trade — report prominently, never block).

Two things that follow, and are easy to get wrong:

- **The count in this document is a claim, not a measurement.** It was written by hand and
  nothing reconciles it against the auditor's output. If the two disagree, the job summary is
  right.
- **The audit cannot run on a shallow clone.** It needs the commits where workflows were
  deleted, which is why `ci.yml` sets `fetch-depth: 0`. Run it in a sandbox that clones
  shallowly and it exits 2 with a refusal rather than reporting a false all-clear — the
  behaviour that matters most, since a security tool that under-reports is worse than one
  that is absent.

---

## Orphaned — revoke and delete

> Confirmed by `pnpm audit:secrets`. No workflow that exists anywhere references these.

### `VERCEL_TOKEN` — **highest priority**

| | |
|---|---|
| Where | GitHub repository secret (presumed — the API path is blocked to agents) |
| Used by | `.github/workflows/deploy-production.yml` |
| Added | `dbe8e38`, 2026-05-02 |
| Deleted with its workflow | `88ef686`, 2026-06-29 — *"remove redundant deploy workflow"* |
| Mentioned in any doc before this one | Never |

**This is a master key, not an ordinary credential.** The deleted workflow ran
`vercel pull --environment=production`, which downloads *every* production environment
variable. A valid Vercel token therefore reaches `SHOPIFY_STOREFRONT_ACCESS_TOKEN`,
`SHOPIFY_REVALIDATION_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, and the Upstash and Resend
credentials once those are set. It can also deploy to production.

**Action: revoke in Vercel → Account Settings → Tokens, then delete the repository secret.**
There is no functional cost. The workflow was removed as redundant because Vercel's Git
integration deploys on push by itself, which is still how this project deploys.

Severity, stated honestly rather than inflated:

- Fork pull requests **never** receive repository secrets, so a random forker could not
  read it.
- This repository has exactly **one collaborator** (`sannguyen01`, admin), so the
  "any write-access user could exfiltrate it" concern is theoretical here.

The risk is not a present attacker. It is a non-expiring, high-privilege credential that
nobody owns, nobody rotates, and no document mentioned for ~2.5 months. Those become
incidents through routes unrelated to the repository — a stale laptop, an old shell
history, a screenshot.

### `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

Same workflow, same fate. **Not credentials** — they are identifiers, and they are already
public: hardcoded in that workflow's git history and printed in every Vercel bot comment on
every PR. Delete them for tidiness, not for safety.

### `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN` — orphaned by WS-6

**These became orphans by design on 2026-09-20, and that is not the same as being handled.**

Both were arguments to `scripts/preflight-secrets.mjs` and entries in its `WHERE` map, read
by `production-smoke.yml` for live checks against a Shopify store this brand no longer runs.
WS-6 removed the last consumer of each — `verify-browse-only.mjs` replaced those checks and
needs no credential at all — so no workflow that exists anywhere references either name. The
auditor classified both as `orphan` on its first run after the merge, and
`src/tests/unit/audit-workflow-secrets.test.ts` now asserts that classification positively
rather than dropping the names, per [ADR 035](adr/035-a-control-outlives-its-subject.md).

| Secret | Reaches | Revocation is two-sided |
|---|---|---|
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Published catalogue, cart creation on the Storefront API | Delete the GitHub secret **and** the Vercel environment variable. The token itself dies with the custom app |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API at its granted scopes — the sensitive one | Same, **plus** revoke in Shopify Admin → Settings → Apps and sales channels → Develop apps. Deleting the GitHub secret does not invalidate the token |

**Deleting the repository secret is the smaller half.** A GitHub secret is a copy; the
credential lives in Shopify and keeps working for anyone holding another copy. The Admin
token is the one that matters — it reads the store's own data rather than the published
catalogue, and it is the credential a `VERCEL_TOKEN` holder would reach through
`vercel pull` (see the top of this file).

**Order matters, and it is not this section's to choose.** WS-7 deletes
`/api/webhooks/shopify`, `/api/revalidate` and `/api/version`, and the webhook subscriptions
must be removed in Shopify Admin *before* the endpoint goes, or Shopify retries against a
failing route for its full backoff schedule. Revoking the Admin token early does not break
that ordering — nothing in the surviving three routes reads it — but revoking
`SHOPIFY_WEBHOOK_SECRET` would, which is why it is not in this section.

---

## Live in GitHub — consumed by `production-smoke.yml`

Referenced by `.github/workflows/production-smoke.yml`, which has been on the default branch
since PR #17. The auditor reports these as `live`.

| Secret | Reaches | Notes |
|---|---|---|
| `PRODUCTION_SITE_URL` | Nothing | Not secret; a secret only so it lives with the rest. **Currently empty**, so `verify-browse-only.mjs` falls back to the apex in `src/config/site.ts` |
| `SHOPIFY_STORE_DOMAIN` | Nothing | Public — it appears in the client bundle. Retained for the preflight's environment-scope marker, not for a read |
| `SHOPIFY_WEBHOOK_SECRET` | Nothing directly | Lets a holder forge webhook deliveries, i.e. trigger cache revalidation. Survives until WS-7 removes `/api/webhooks/shopify` |

Put these on the **`production-readonly` environment**, not at repository scope. See the
caveat below — it is not the safeguard it looks like.

**All five were emptied on 2026-09-19** and have not been restored. The preflight reports
`not-configured` and exits 0, and since WS-6 that no longer means the run checked nothing:
`Browse-only catalogue` needs no credential and runs anyway. What does not run is the
webhook probe.

### The environment is not a control until you configure it

A job naming an environment that does not exist does **not** fail. GitHub creates the
environment automatically, **with no protection rules and no secrets**.

And a job with an `environment:` key still receives **repository** secrets. So if these
are set at repo scope, the workflow goes green with no isolation whatsoever, and nothing
anywhere reports it.

`scripts/preflight-secrets.mjs` mitigates this by asserting a `SMOKE_SECRETS_SOURCE` marker
that is only ever set **on the environment**. That is a convention, not an enforcement —
GitHub gives a job no way to ask where a secret came from. See
`docs/adr/006-controls-must-fail-loudly.md`.

---

## Live outside GitHub

These never appear in a workflow, so `pnpm audit:secrets` cannot see them. Listed here so
this file is the one place an orphan is visible.

| Credential | Where | Reaches | Status |
|---|---|---|---|
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Vercel env | Catalogue + cart | **No longer read.** WS-4b deleted `src/lib/shopify/client.ts`; `shopifyConfig.storefrontAccessToken` survives with no caller. Delete with the GitHub secret |
| `SHOPIFY_REVALIDATION_SECRET` | Vercel env | On-demand revalidation endpoint | In use by `/api/revalidate`, which WS-7 removes |
| `SHOPIFY_WEBHOOK_SECRET` | Vercel env | Webhook signature verification | In use by `/api/webhooks/shopify`. **Revoke last** — see `SHOPIFY-WEBHOOK-SECRET` in `STATE.md` and the WS-7 ordering above |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify custom app | Admin API | **Orphaned.** Unset in normal operation, and nothing reads it since WS-6. Revoke the app, not just the copies |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Vercel env | Rate-limit store | **Unset** — `/api/health` reports 503 while so |
| `RESEND_API_KEY` | Vercel env | Contact-form email | **Unset** |
| `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` | Vercel env | Customer Account OAuth client identity | Not secret; inert while the other two are unset |
| `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET` | Vercel env | **OAuth client secret** for the Customer Account API | Feature built, never switched on |
| `SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET` | Vercel env | Keys the **AES-256-GCM** session cookie. Rotating it signs everyone out, which is the only bulk revocation available | Feature built, never switched on |
| Shopify Storefront token (automation copy) | To be added to the GitHub environment | Same as above | Copy the Vercel value; do not mint a second |

**The three `SHOPIFY_CUSTOMER_ACCOUNT_*` rows were missing from this file until 2026-09-19.**
They are read by `src/lib/shopify/customer/config.ts` and documented in `.env.local.example`, and
one of them is an OAuth client secret — so for as long as customer accounts have existed, the
document whose stated purpose is *"the one place an orphan is visible"* could not see them. Found
by `src/tests/unit/decommission-inventory.test.ts` on its first run, which is the argument for
that test: this file is hand-maintained, its own header says the count in it is a claim rather
than a measurement, and nothing compared it to anything until now.

**Do not mint a second Storefront token for CI.** A second credential is a second thing to
rotate and a second thing to forget — which is the failure this document exists to prevent.
(`storefrontAccessTokenCreate` is refused by the MCP safety policy in any case.)

---

## When you delete a workflow

Check whether it was the last user of any secret, and delete the secret in the same change.
`pnpm audit:secrets` answers the first half; `src/tests/unit/audit-workflow-secrets.test.ts`
keeps it honest, including that it must not report credentials that appear only inside
comments — the first grep-based pass over this repo reported a secret named `X` that came
from a comment documenting an anti-pattern.
