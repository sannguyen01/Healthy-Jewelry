# DNS & Domain Setup — healthyjewellery.com

## The one fact that resolves every DNS confusion on this project

**The canonical domain is `healthyjewellery.com` (double-L, British spelling).**
`healthyjewelry.com` (single-L) is a *different domain owned by someone
else* — it is parked for resale on Afternic/GoDaddy and carries a null MX
record, so it can never send or receive mail. See `STATE.md` →
`DOMAIN-MISMATCH` for how the single-L spelling got hardcoded into ~20 files
and how it was fixed at the source (`src/config/site.ts`).

## Why DNS work "wasn't proceeding" — the real cause

Two separate, unrelated problems were stacked and looked like one:

1. **Domain confusion** (above) — anyone working from the wrong spelling was
   never going to reconcile it with the live site.
2. **Authority confusion** — the domain's nameservers were switched from Mat
   Bao to Vercel (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`) at some point.
   Once that switch happens, **Mat Bao's own DNS record editor stops
   mattering** — it's not wrong, it's *not consulted*. Every record edited
   there is invisible to the public internet. Confirmed via authoritative
   query:

   ```
   nslookup -type=NS healthyjewellery.com 8.8.8.8
   →  nameserver = ns1.vercel-dns.com
   →  nameserver = ns2.vercel-dns.com
   ```

   All real DNS management for this domain now happens in **Vercel's
   dashboard** (Project → Settings → Domains → the domain's own DNS records
   panel), not in Mat Bao.

## Current live state (verified 2026-08-03)

| Record | Value | Status |
|---|---|---|
| `healthyjewellery.com` A | `216.198.79.65`, `64.29.17.65` | Live, serves the real Next.js site (HTTP 200, `Server: Vercel`) |
| `www.healthyjewellery.com` A | `216.198.79.65`, `64.29.17.1` | Live, serves the real Next.js site (HTTP 200) |
| `account.healthyjewellery.com` A | resolves to a Vercel anycast IP | **Broken — HTTP 404.** No project in this Vercel account claims this hostname. Not referenced anywhere in the app code (grepped `src/` — zero hits), so this is very likely a leftover from Shopify's "new customer accounts" domain suggestion, not something the app depends on. Low priority; see below if you want it fixed or removed. |
| `healthyjewellery.com` CAA | none set | Correct — leave unset. Vercel needs to issue/renew TLS for this domain itself; a CAA record restricting issuance to `ssl.com` (Shopify's suggestion, see below) would block Vercel's own certificate renewal. |

The apex and `www` both work today despite the duplicate/stale-looking A
records, because Vercel's edge network accepts traffic on a range of its own
anycast IPs — this is not something to "clean up" by guessing at a single
correct IP by hand.

## Decision already made: Vercel stays the root, Shopify stays headless

This project keeps its bespoke Next.js frontend at the root domain. Shopify
is used **only** as a headless commerce backend via the Storefront API
(`NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` = `<store>.myshopify.com`, unrelated to
the custom domain). This means:

### Do NOT complete Shopify's "Connect existing domain" flow

If Shopify Admin → Settings → Domains shows `healthyjewellery.com` pending
connection with instructions like:

- Remove `A @ → <old IP>`
- Add `CAA @ → ssl.com`
- Update `A @ → 23.227.38.65` (Shopify's own IP)

**do not follow these.** Completing them would point the root domain at
Shopify's hosted storefront instead of this Next.js app. Go to **Shopify
Admin → Settings → Domains** and remove/cancel the pending
`healthyjewellery.com` connection request instead. Headless Storefront API
usage does not require (and is actively harmed by) a domain connection.

## What to actually do, in order

1. **Shopify Admin → Settings → Domains** — cancel the pending
   `healthyjewellery.com` connection request, if still open.
2. **Vercel → Project → Settings → Domains** — confirm both
   `healthyjewellery.com` and `www.healthyjewellery.com` are listed as
   Production domains on this project (they resolve correctly today, so this
   is almost certainly already true — just confirm, don't reconfigure blind).
3. **Vercel → the domain's DNS records panel** (not Mat Bao) — this is where
   any future record changes belong. If you want to clean up the
   duplicate/legacy-looking A records, do it here by checking what Vercel's
   own domain configuration page currently recommends for this project —
   values can shift as Vercel migrates infrastructure, so copy the value
   Vercel shows *at the time you look*, not the ones tabulated above.
4. **`account.healthyjewellery.com`** — optional cleanup, not urgent (nothing
   in the app links to it). Either:
   - Point it at Shopify's IP (`23.227.38.65`) in Vercel's DNS panel, if you
     want Shopify's classic hosted customer-accounts pages to work at that
     subdomain, or
   - Delete the stray record and ignore it.
5. **Mat Bao** — no action needed on the DNS/zone-editor tab; it's inert for
   this domain. If you want to reduce future confusion, you can leave it as
   is (harmless) or clear it out, but do not expect edits there to take
   effect.
6. **`NEXT_PUBLIC_SITE_URL` in Vercel** (Project → Settings → Environment
   Variables) — per `STATE.md` → `VERCEL-ENV`, this is one of 8 unset env
   vars. It is **not currently broken**, because the code's own fallback in
   `src/config/site.ts` now matches (`https://healthyjewellery.com`). If you
   do set it explicitly, it must be exactly `https://healthyjewellery.com` —
   the code will throw a build-time error if it's ever set to the wrong
   (single-L) domain, by design.
7. **Email** — see below. Neither domain currently has a working inbox.

## Email is not set up yet — separate from DNS, but related

Every `hello@` / `support@` / `privacy@` / `legal@` / `contact@` address on
the site now correctly points at `healthyjewellery.com`, but **no mailbox
exists there yet** — there is no MX record on `healthyjewellery.com` at all
today. Contrast with the old single-L domain, which explicitly rejects all
mail (null MX). Practically: right now, *no* contact email on the site can
receive mail. Two separate things are needed, both requiring a decision this
document can't make for you:

1. **Inbound mail (receiving)** — pick a provider (Google Workspace, Zoho
   Mail, Mat Bao's own email hosting, or a lightweight forwarder like
   ImprovMX) and add its MX records for `healthyjewellery.com` in Vercel's
   DNS panel.
2. **Outbound mail (sending)** — the contact form already sends via Resend
   (`src/app/api/contact/route.ts`, `SENDER_EMAIL` =
   `contact@healthyjewellery.com`). Resend needs its own domain
   verification (SPF/DKIM TXT records) added to the same DNS panel before it
   can send as `@healthyjewellery.com` without landing in spam or being
   rejected outright. Check Resend's dashboard for the exact records it
   wants once you've picked it as the sender domain.

## Verifying any DNS change

```powershell
Resolve-DnsName -Name healthyjewellery.com -Type A
Resolve-DnsName -Name www.healthyjewellery.com -Type A
Resolve-DnsName -Name healthyjewellery.com -Type MX
nslookup -type=NS healthyjewellery.com 8.8.8.8
curl.exe -sS -D - -o NUL --max-time 10 "https://healthyjewellery.com/"
```

Or re-run `scripts/audit-domain-consistency.sh` to confirm no code anywhere
still references the wrong domain.
