# Runbook — WS-E DNS: apex, `www`, the checkout hostname, CAA and TLS

**Owner:** the repository owner (`sannguyen01`). **Workstream:** WS-E. **Status:** not yet run.
**Delete this runbook when WS-E completes.**

WS-E is done when `probe-canonical-domain.mjs` closes its own `domain-unbound` issue and the
checkout hostname serves a 410 from Vercel. Neither is a person saying it looks right.

## Step 1 — apex and `www`, in this order

Measured 2026-09-20: the apex answers 307 and hands every path to `www`, while
`src/config/site.ts` names the apex as the canonical origin. **Vercel → Project → Settings →
Domains**, in this order — reversing it produces a redirect loop:

1. On `healthyjewellery.com`, remove the redirect so it serves the Production deployment.
2. On `www.healthyjewellery.com`, set a redirect to `healthyjewellery.com`, **permanent (308)**.

This is a project setting, not a DNS record, and not a `next.config.ts` redirect: the request
must be answered before it reaches the application, or the platform and the code become two
sources of truth for one behaviour.

```sh
curl -sI https://healthyjewellery.com/ | sed -n '1p;/^location/Ip;/^server/Ip'
curl -sI https://www.healthyjewellery.com/ | sed -n '1p;/^location/Ip'
node scripts/probe-canonical-domain.mjs
```

Expected after: the apex answers 200 with `server: Vercel`; `www` answers 308 to the apex; the
probe reports `bound`.

## Step 2 — the checkout hostname, on a 30-day clock

`checkout.healthyjewellery.com` CNAMEs to `shops.myshopify.com`. Old order emails, bookmarks,
QR codes and stale sessions still point at it, so it is retired on a clock rather than deleted:

```sh
dig +short CNAME checkout.healthyjewellery.com     # today: shops.myshopify.com.
node scripts/verify-premises.mjs                   # CHECKOUT-HOST-CNAME holds while it does
```

1. **Confirm nothing links to it.** The repository (`git grep -n "checkout\.healthyjewellery"`),
   transactional email templates, social profiles, printed QR codes, ambassador cards and
   analytics campaign links. Record each place checked.
2. **Start the clock** on the day that confirmation is recorded. Wait **30 days**.
3. **Attach the hostname to the Vercel project** and let it serve the same 410 `/checkouts/*`
   serves. Attaching beats deleting the record: an honest "gone" beats a dead name. Never
   redirect it to the homepage — a customer who followed a checkout link and lands on a
   homepage has been told nothing.
4. Only then change the DNS record. The `CHECKOUT-HOST-CNAME` premise will report drift on the
   next production-smoke run; that is the expected signal, and the premise is retired in the
   same pull request that records this step.

If the premise reports drift **before** step 3, somebody changed DNS outside this plan — stop
and find out who, and whether step 1 ever happened.

## Step 3 — CAA, after the CNAME has moved

A restrictive CAA record breaks Vercel's certificate renewal silently, at expiry, weeks later.
Check before and after:

```sh
dig +short CAA healthyjewellery.com
dig +short CAA www.healthyjewellery.com
dig +short CAA checkout.healthyjewellery.com
```

Expected: no CAA at the apex (Vercel issues and renews its own certificates). Remove any
store-era CAA (for example one restricting issuance to `ssl.com`) **only after** the checkout
CNAME has moved, never before.

## Step 4 — TLS on every name

```sh
for h in healthyjewellery.com www.healthyjewellery.com checkout.healthyjewellery.com; do
  echo "== $h"
  openssl s_client -connect "$h:443" -servername "$h" </dev/null 2>/dev/null \
    | openssl x509 -noout -issuer -enddate -ext subjectAltName
done
```

Each name must present a certificate that covers it, from Vercel's issuer once attached, with
an end date comfortably in the future.

## Step 5 — the probes that close it

```sh
node scripts/probe-canonical-domain.mjs      # bound → closes domain-unbound
node scripts/probe-live-surface.mjs          # apex, www and deployment agree
curl -s -o /dev/null -w '%{http_code}\n' https://checkout.healthyjewellery.com/checkouts/x   # 410
```

## Evidence

Filled in only when observed, in words, with a date. An empty cell is the honest state.

| Step | Observed (in words) | Date | By |
|---|---|---|---|
| Apex redirect cleared; apex serves Production | | | |
| `www` → apex, 308 | | | |
| `probe-canonical-domain.mjs` reports `bound` | | | |
| Places checked for checkout links (listed) | | | |
| 30-day clock started | | | |
| 30-day clock ended; hostname attached to Vercel | | | |
| Checkout hostname answers 410 | | | |
| CAA checked before and after | | | |
| TLS valid on all three names (issuer, expiry) | | | |
