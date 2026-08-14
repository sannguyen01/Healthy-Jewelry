# Shopify policy drafts

**Paste these into Shopify Admin → Settings → Policies.**

## Why these exist

Shopify's hosted checkout links whichever policies the store has. This store has
**one** — Privacy — and it is Shopify's unedited template, still containing
`{{ shop_name }}` and `{{ email }}`. Those interpolate at render time, so the published
page gives the owner's personal Gmail as the data-controller contact.

> **Corrected 2026-08-14.** An earlier revision of this file said the rendered page names
> the store *"My Store 2"*. Checked against the live Admin API: `shop.name` is now
> **"Healthy Jewellery"**, so that is no longer true and the warning below about not
> pasting until the store is renamed no longer applies. `contactEmail` is still
> `thesean2007@gmail.com`, which `verify-production.mjs` flags as a store observation.

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

## The `.html` files are what you actually paste

Shopify's policy editor stores HTML. `scripts/build-policy-html.mjs` converts each `.md`
here into the `.html` beside it, and is the only thing that should generate them — pasting
markdown source into Shopify publishes the asterisks as literal text.

```
node scripts/build-policy-html.mjs docs/shopify-policies/refund-policy.md \
                                   docs/shopify-policies/refund-policy.html
```

It refuses to write a file whose output still contains `{{`, `{%`, `[ ]`, `**`, an HTML
comment, or the editorial preamble — the six things that must never reach a customer. That
guard earned itself immediately: the first version converted line by line, and because the
markdown is hard-wrapped at ~90 columns, every `**bold**` that straddled a newline survived
into the output as raw asterisks. Four clauses were affected, one per policy, including
*"we never see or store your full card number"* and *"if it corrodes, we replace it"*.

## Applying them by API

`shopPolicyUpdate` takes a `ShopPolicyType` rather than an id, so it creates and updates
alike — the three missing policies do not need to exist first. It requires the
**`write_legal_policies`** scope, which read-only Admin tokens do not carry; without it
every call returns `Access denied for shopPolicyUpdate field` and changes nothing.

## Files

| File | Shopify field | Source on the site |
|---|---|---|
| `refund-policy.md` | Refund policy | `/shipping` — returns and exchanges |
| `shipping-policy.md` | Shipping policy | `/shipping` — rates, timing, duties |
| `terms-of-service.md` | Terms of service | `/terms` |
| `privacy-policy.md` | Privacy policy | `/privacy`, plus the analytics consent gate |
