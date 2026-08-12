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

Last reconciled by hand: **2026-08-10**.

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

---

## Pending — needed, but inert until PR #17 merges

Referenced by `.github/workflows/production-smoke.yml`, which is not yet on the default
branch. **Scheduled and `workflow_dispatch` triggers only fire from the default branch**, so
this workflow cannot run at all until then — not on a schedule, and not manually.

| Secret | Reaches | Notes |
|---|---|---|
| `PRODUCTION_SITE_URL` | Nothing | Not secret; a secret only so it lives with the rest |
| `SHOPIFY_STORE_DOMAIN` | Nothing | Public — it appears in the client bundle |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Published catalogue, cart creation | **Public-safe by construction** — the same class already shipped to browsers |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API at its granted scopes | The only sensitive one. Used for a single publication-count query — grant read scopes only |
| `SHOPIFY_WEBHOOK_SECRET` | Nothing directly | Lets a holder forge webhook deliveries, i.e. trigger cache revalidation |

Put these on the **`production-readonly` environment**, not at repository scope. See the
caveat below — it is not the safeguard it looks like.

### The environment is not a control until you configure it

A job naming an environment that does not exist does **not** fail. GitHub creates the
environment automatically, **with no protection rules and no secrets**.

And a job with an `environment:` key still receives **repository** secrets. So if these five
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
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Vercel env | Catalogue + cart | In use |
| `SHOPIFY_REVALIDATION_SECRET` | Vercel env | On-demand revalidation endpoint | In use |
| `SHOPIFY_WEBHOOK_SECRET` | Vercel env | Webhook signature verification | See `SHOPIFY-WEBHOOK-SECRET` in `STATE.md` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify custom app | Admin API | Optional; unset in normal operation |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Vercel env | Rate-limit store | **Unset** — `/api/health` reports 503 while so |
| `RESEND_API_KEY` | Vercel env | Contact-form email | **Unset** |
| Shopify Storefront token (automation copy) | To be added to the GitHub environment | Same as above | Copy the Vercel value; do not mint a second |

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
