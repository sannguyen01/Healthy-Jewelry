# Shopify decommission — credential ledger

The record of what is being revoked, in what order, and what proved it.

## The rule this document exists to keep

**A credential name, never a credential value.** Not a prefix, not a masked form, not "the one
ending in 4f". This file is version-controlled in a **public repository**, and a value written
here is a value published — instantly, permanently, and to a mirror network nobody can recall it
from. `loop-constraints.md` already forbids an agent from reading, setting, proposing or guessing
one; this is the same rule pointed at a document.

If you find yourself wanting to write a value down to tell two credentials apart, the answer is
the **owner** column and the system's own console, not a fragment here.

## How this relates to `docs/credential-inventory.md`

That file answers *what exists and what it reaches*. This one answers *what happens to it and how
we know*. They share the credential **name** as a key and nothing else — deliberately, because two
documents restating the same fact drift, and the reader trusts whichever they found first
([ADR 018](adr/018-a-claim-about-a-control-is-not-a-control.md)).

`src/tests/unit/decommission-inventory.test.ts` reconciles the two **in both directions**: every
Shopify or Vercel credential named in the inventory must appear in the ledger below, and every row
below must name a credential the inventory knows about. A credential revoked but missing from this
ledger, or invented here and real nowhere, fails the merge gate rather than being noticed later.

## Order of operations, and why it is not negotiable

**Export first. Revoke second. Cancel last.**

1. **Export** the 22 products' public fields into `src/content/catalog/`. The Storefront token is
   the only thing that can read them, so revoking before exporting makes the catalogue
   unrecoverable without re-minting a credential we are trying to destroy.
2. **Revoke** in the originating system — Shopify Admin, the Vercel dashboard, GitHub settings.
   Deleting the application code does **not** delete token access. A token whose only consumer is
   gone is not retired; it is unowned, which is worse.
3. **Cancel the Shopify plan** only after a Vietnam-qualified accountant has signed off on
   retention. See the note at the foot of this file: the evidence says there is nothing to retain,
   and "the evidence says" is not the same as "an accountant said".

Within step 2, revoke by **blast radius, highest first** — not by convenience. `VERCEL_TOKEN` goes
before any Shopify token, because it can read all of them.

## The ledger

`Revoked` and `Evidence` stay empty until the action has actually happened. **An empty cell is the
honest state**; filling one in advance is the exact failure ADR 018 names, in a file whose whole
job is to be believed.

| # | Credential | System | Environment | Purpose | Owner | Revoked | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | `VERCEL_TOKEN` | Vercel | GitHub repo secret | **Master key.** Its deleted workflow ran `vercel pull --environment=production`, which reads *every* production variable — so it reaches all four Shopify credentials plus Upstash and Resend, and can deploy to production. Orphaned since 2026-06-29 | `sannguyen01` | | |
| 2 | `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify custom app | Shopify + GitHub env | Admin API at its granted scopes. The only Shopify credential that is not public-safe by construction | `sannguyen01` | | |
| 3 | `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET` | Shopify headless channel | Vercel env | OAuth client secret for customer accounts — a feature built and never switched on | `sannguyen01` | | |
| 4 | `SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET` | this app | Vercel env | Keys the AES-256-GCM session cookie. Rotating it signs everyone out, which is the only bulk revocation available | `sannguyen01` | | |
| 5 | `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID` | Shopify headless channel | Vercel env | OAuth client id. Not secret, but it dies with the feature | `sannguyen01` | | |
| 6 | `SHOPIFY_WEBHOOK_SECRET` | Shopify Admin → Notifications | Vercel env + GitHub env | HMAC verification for webhook deliveries. A holder can forge a delivery, i.e. trigger cache revalidation | `sannguyen01` | | |
| 7 | `SHOPIFY_REVALIDATION_SECRET` | this app | Vercel env | Guards the manual `/api/revalidate` purge endpoint | `sannguyen01` | | |
| 8 | `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Shopify headless channel | Vercel env + GitHub env | Published catalogue reads and cart creation. Public-safe by construction — the same class already ships to browsers — which is why it is **last**: it is the least dangerous and the one the export needs | `sannguyen01` | | |
| 9 | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel | GitHub repo secrets | **Not credentials.** Identifiers, already public in git history and in every Vercel bot comment. Delete for tidiness | `sannguyen01` | | |
| 10 | `SHOPIFY_STORE_DOMAIN`, `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN`, `PRODUCTION_SITE_URL` | — | Vercel env + GitHub env | **Not credentials.** Public hostnames, stored as secrets only so they sat with the rest. Remove with the code that reads them | `sannguyen01` | | |

### Webhook subscriptions and app registrations

Not credentials, and they outlive the code that served them in exactly the same way.

| Item | System | Purpose | Removed | Evidence |
|---|---|---|---|---|
| `products/*`, `collections/*`, `orders/*` webhook subscriptions | Shopify Admin → Notifications | Delivered to `/api/webhooks/shopify` for cache revalidation | | |
| Headless sales channel | Shopify Admin | Issued the Storefront and Customer Account credentials | | |
| Customer accounts configuration | Shopify Admin | OAuth callback allowlist | | |
| Payment methods | Shopify Admin | Never confirmed active; no order has ever been placed | | |
| `production-readonly` GitHub environment | GitHub → Settings → Environments | Held the five smoke secrets | | |

## What counts as evidence

Prefer a **check that reports it** over a person's recollection. In descending order:

1. **A probe verdict.** After the Storefront token is revoked, a live catalogue read returns 401 —
   that is a machine-readable fact with a timestamp. Where the decommission has already removed
   the probe, say so rather than inventing one.
2. **The auditor's output.** `pnpm audit:secrets` reads git history and reports credentials no
   workflow references; its findings appear in every `verify` run's job summary.
3. **A dated console observation**, naming who looked and when. This is the weakest form and is
   the only one available for most rows, because GitHub and Shopify offer no API an agent may use
   to confirm a deletion. Recording it as weak is the point — an unlabelled claim reads as strong.

**A link to a screenshot is not evidence** for this file's purposes: it is not greppable, it rots,
and it cannot be re-checked by the next person. Write what was observed, in words, with a date.

## Retention — a finding, not advice

`docs/headless-launch-inventory.md` records `ordersCount: 0` as of 2026-08-08, and the store has
never had a confirmed payment provider. On that evidence there are **no transaction records, no
customer records and no payment data** to retain, and the Vietnamese tax and consumer-law exposure
the decommission brief anticipated is empty.

That is a finding from this repository's own records. It is **not** a legal or accounting opinion,
and it should be put to a Vietnam-qualified adviser precisely because it is cheap to confirm and
expensive to assume. Until they answer, the Shopify plan stays — revoking credentials is
reversible in the sense that the data survives; cancelling the plan is not.

## Status

**Nothing in this ledger has been revoked yet.** The export that must precede step 1 is blocked:
the Shopify connector is signed out, so the 22-product delta cannot be pulled. That is a human
action, and it gates everything below it.
