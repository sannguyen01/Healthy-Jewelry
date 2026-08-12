# 005 — The storefront stays English-only

## Context

The store is Vietnam-based and charges VND (`1.450.000₫`), while the storefront UI is
entirely English. That looks like an obvious gap, and it has been raised as one.

Checked against the live store on 2026-08-08:

| Query | Result |
|---|---|
| `shopLocales` | **`en` only** — primary, published |
| `shopLocales(published: false)` | `en` only. No unpublished locale exists |
| `markets` | A "Vietnam" market exists and is enabled, but `webPresence: null` |

The commonly-suggested cheap path — read existing Vietnamese translations through
`translatableResources` and surface them with near-zero UI code — **has nothing to read**.
No `vi` locale exists, so no translated product content exists to fetch.

That changes the shape of the work. It is not "surface translations the store already has";
it is "create translations, then surface them". The creating half is content work on 22
products, not engineering.

## Decision

**The storefront stays English-only.** No i18n routing, no dictionary layer, no locale
negotiation.

Currency formatting is a separate concern and is already handled correctly: `formatPrice`
picks the locale from the currency (`vi-VN` for VND), so the site writes `1.450.000₫` the
way Shopify's own checkout does rather than `₫1,450,000`. That is not partial i18n; it is
quoting the price in the format the customer will be charged in, which is required
regardless of UI language.

## Consequences

- No unreviewed Vietnamese copy ships on a real storefront. Machine-translated commerce
  copy is worse than English for trust, and product descriptions are content that must not
  be fabricated — the same rule that keeps the `custom.spec` metafield deliberately empty
  rather than filled with invented measurements.
- The prerequisite is recorded, so revisiting this starts from facts: publish a `vi` locale
  in Shopify Admin and translate the 22 products **first**. Only once that content exists
  does the engineering question become worth asking, and at that point
  `translatableResources` genuinely is the cheap path.
- If it is ever revisited, the highest-leverage subset is the static chrome — nav, footer,
  and above all **checkout error copy**, which is the text a confused customer reads at the
  moment of highest abandonment risk.

## Re-check trigger

Added 2026-08-12. This ADR recorded its prerequisite and left nobody watching for it to be
met — the decision would have stayed "correct on 2026-08-08 evidence" indefinitely while
the evidence changed underneath it.

**`ADR-005-english-only` in `scripts/lib/premise-checks.mjs`** queries `shopLocales` on
every production-smoke run and reports drift the moment a non-`en` locale appears. A
regional English locale (`en-GB`) is not translated content and does not count.

Drift here is an **opportunity, not a failure**: it does not turn the run red, it opens a
`premise-drift` issue saying this decision is now due for revisit, because the content half
finally exists to surface. See [ADR 008](008-decisions-need-premise-detectors.md).

Referenced by: `STATE.md`, `src/lib/utils/formatPrice.ts`,
`scripts/lib/premise-checks.mjs`.
