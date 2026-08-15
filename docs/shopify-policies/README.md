# Shopify policy drafts

**Paste these into Shopify Admin → Settings → Policies.**

## Why these exist

Shopify's hosted checkout links whichever policies the store has. This store has
**one** — Privacy — and it is Shopify's unedited template, still containing
`{{ shop_name }}` and `{{ email }}`. Those interpolate at render time, so the published
page currently names the store **"My Store 2"** and gives the owner's personal Gmail as
the data-controller contact.

There is no refund policy, no terms of service, and no shipping policy. Meanwhile
`/shipping` on the site states real terms — 30-day returns, unworn, prepaid label,
refund in 5–7 business days — and the checkout says none of it. **The checkout is the
surface the customer reads**, and it is the one page in the purchase journey the
codebase does not control.

The store ships to 29 countries, fourteen of them in the EU, where information about
the right of withdrawal has to be given before the order is placed.

## What these are, and are not

Every clause below is **reconciled from what the site already publishes** — `/shipping`,
`/terms`, `/privacy`, `/legal` — so the two surfaces stop disagreeing. No new commitment
has been invented.

Two things are deliberately left as `[ ]` for you rather than guessed:

- **Business identity and address.** EU-facing terms require a trading name, legal form
  and a postal address. I do not have them.
- **A support address on the brand domain.** The drafts use `hello@healthyjewellery.com`,
  matching `CONTACT_EMAIL` in `src/config/site.ts`. Change it if that mailbox is not live.

**These are drafts, not legal advice.** Read them before pasting. A refund policy is a
contract term, and the person who signs it should be the person who read it.

## After pasting

`pnpm verify:production` includes a check that fails when any of the four required
policies is absent *or* still contains Liquid placeholders. It goes red today; it should
go green once all four are in place.

## Files

| File | Shopify field | Source on the site |
|---|---|---|
| `refund-policy.md` | Refund policy | `/shipping` — returns and exchanges |
| `shipping-policy.md` | Shipping policy | `/shipping` — rates, timing, duties |
| `terms-of-service.md` | Terms of service | `/terms` |
| `privacy-policy.md` | Privacy policy | `/privacy`, plus the analytics consent gate |
