# Runbook — WS-D Vercel environment variables

**Owner:** the repository owner (`sannguyen01`). **Workstream:** WS-D. **Status:** not yet run.
**Delete this runbook when WS-D completes.**

WS-D is done when `vercel env ls` shows no commerce variable in any environment **and** a fresh,
cache-free production build contains no vendor hostname. The second half is the one a passing
deployment disguises: `NEXT_PUBLIC_*` values are inlined into client bundles at build time, so
removing the variable proves nothing about the artefact already built from it.

## Step 1 — inventory, names only

```sh
vercel link                        # once, to the production project
vercel env ls production
vercel env ls preview
vercel env ls development
```

`vercel env ls` prints names, targets and ages; it does not print values, and nothing in this
runbook needs one. **Never run `vercel env pull`** for this work — it writes every value to a
local file, and a value on disk is a value one careless commit from being published. Record
names, which environments hold each, and who can change them (Vercel → Settings → Members),
in the table below.

## Step 2 — what goes, and what stays

Remove, in every environment that lists them — inventory first rather than trusting this list:

```
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN   SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_ACCESS_TOKEN    SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_REVALIDATION_SECRET        SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID
SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET
SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET
```

**`SHOPIFY_WEBHOOK_SECRET` is last and is not in that list.** It goes only after WS-F has
deleted the webhook subscriptions in Shopify and the route has been removed — the register's
ordering constraint. Removing it first leaves Shopify retrying signed deliveries at a route
that can no longer verify them.

**Keep** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `RESEND_API_KEY` (and
`RATE_LIMIT_KEY_SECRET` where it is set). `/api/contact` still consumes a paid service and
still needs distributed abuse protection; the rate limiter's reason changed, not its need.

```sh
vercel env rm <NAME> production
vercel env rm <NAME> preview
vercel env rm <NAME> development
```

Removing a Vercel variable does not revoke the credential it held. Revocation happens in the
originating console, in the order `docs/shopify-decommission-inventory.md` sets (blast radius,
highest first; the storefront token last).

## Step 3 — a cache-free rebuild, then scan what shipped

1. **Vercel → Deployments → the current production deployment → Redeploy**, with **"Use
   existing Build Cache" unchecked**. A cached build reuses the old inlined values, and
   `/api/version` will say so (`bundleIsStale: true`).
2. Confirm the build identity and staleness:

   ```sh
   curl -s https://healthyjewellery.com/api/version
   ```

3. Scan what the deployment serves, not what the repository holds:

   ```sh
   node scripts/probe-live-surface.mjs --out live-surface.json
   node scripts/verify-browse-only.mjs
   ```

   Both must report no vendor host. The live-surface JSON records a sha256 per page, so the
   before and after are comparable.
4. Locally, from a clean checkout of the deployed commit, a cache-free build scanned with the
   repository's build-artefact scan (`rm -rf .next && pnpm build`, then the artefact scan the
   `verify` job runs) must find no vendor hostname in `.next/static`.

## Evidence

Filled in only when observed. Names, never values. An empty cell is the honest state.

| Step | Observed (in words) | Environments | Date | By |
|---|---|---|---|---|
| `vercel env ls` inventory recorded | | production · preview · development | | |
| Eight commerce variables removed | | | | |
| `SHOPIFY_WEBHOOK_SECRET` removed (after WS-F) | | | | |
| Upstash and Resend variables confirmed kept | | | | |
| Cache-free production redeploy (deployment id) | | production | | |
| `/api/version` `bundleIsStale: false` | | production | | |
| Live-surface and browse-only scans clean | | production | | |
| Local cache-free build artefact scan clean | | — | | |
