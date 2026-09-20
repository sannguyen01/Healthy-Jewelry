#!/usr/bin/env node
/**
 * Evaluates the premises that can still be evaluated, and writes the drift file the
 * workflow reports from.
 *
 * ## Why this file exists at all
 *
 * Premise evaluation used to happen at the bottom of `scripts/verify-production.mjs`:
 * `collectPremises()` gathered six of them, `formatPremises()` printed them, and the
 * drifted ones were written to `premise-drift.json` for `production-smoke.yml`'s
 * **Report premise drift** step to open or close an issue from.
 *
 * WS-6 removed that script. Its central discriminator — *is the live site serving Shopify
 * or the bundled fallback?* — inverted when the bundled catalogue became the source
 * ([ADR 034](../docs/adr/034-the-catalogue-is-the-source.md)), so it would have reported
 * the correct state as a defect.
 *
 * Taking the premises with it would have been the exact failure
 * [ADR 035](../docs/adr/035-a-control-outlives-its-subject.md) names: the reporting step
 * reads `premise-drift.json` and **returns early when the file is absent**, on the sound
 * reasoning that "premises could not be evaluated" should not invent a drift issue. With
 * nothing writing the file, that early return would have become permanent and silent —
 * a channel that looks healthy because it never speaks.
 *
 * ## Five premises lost their subject, and one did not
 *
 * | premise | input it needed | why it is gone |
 * |---|---|---|
 * | `i18nPremise` | `shop.shopLocales` | an Admin API read of a store nothing queries |
 * | `collectionSetPremise` | Shopify's collection list | there is no second collection set; `collection-handle-contract.test.ts` compares the four that remain, in the fast gate |
 * | `specMetafieldPremise` | products carrying `custom.spec` | `specification` is `z.string().min(1)` in the catalogue schema — a record without one fails the build |
 * | `paymentsPremise` | order count and payment gateways | nothing on this site takes a payment |
 * | `webhookDeliveryPremise` | order count and app-owned subscriptions | needs the Admin API, and the connector reads `needs_reconnect` |
 *
 * `apiVersionPremise` survives, and it is the one this module runs. It is **pure** — it
 * takes a clock and reads `SHOPIFY_API_VERSION` out of `scripts/lib/api-version.mjs` — so
 * it needs no credential, which is the same property that lets the browse-only check run
 * on a tier whose secrets were emptied.
 *
 * It still matters, which is the test for keeping it. `/api/webhooks/shopify` and
 * `/api/version` both still name that version, and they survive until WS-7 deletes the
 * Shopify webhook subscriptions from Admin. Shopify's calendar does not wait for that:
 * when the pinned version stops being served, every remaining request falls forward
 * silently. This project already lost roughly seven months to exactly that (ADR 009).
 *
 * ## What this deliberately does not do
 *
 * It does not fail. A drifted premise means a recorded decision has gone stale, not that
 * the site is broken, and turning a scheduled run red for an opportunity is how a channel
 * becomes noise nobody reads ([ADR 011](../docs/adr/011-repeated-identical-failures-must-escalate.md)).
 * It always exits 0 and always writes the file; the workflow decides what reaches a human.
 *
 * Dependency-free, like every script here.
 */

import { writeFileSync } from 'node:fs'
import { apiVersionPremise, formatPremises } from './lib/premise-checks.mjs'

/**
 * Every premise this deployment can still evaluate.
 *
 * Exported so `premise-checks.test.ts` can assert the list rather than trusting it: a
 * premise silently dropping out of here is the same defect as one never added.
 */
export function collectPremises(now = new Date()) {
  return [apiVersionPremise(now)]
}

/** The ids of the premises retired in WS-6, named so their removal is a record. */
export const RETIRED_PREMISE_IDS = [
  'SHOPIFY-I18N',
  'SHOPIFY-COLLECTION-SET',
  'SHOPIFY-SPEC-METAFIELD',
  'SHOPIFY-PAYMENTS',
  'SHOPIFY-WEBHOOK-DELIVERY',
]

function main() {
  const premises = collectPremises()
  const { lines, summary, drifted } = formatPremises(premises)

  for (const line of lines) console.log(line)
  console.log('')
  console.log(summary)

  if (RETIRED_PREMISE_IDS.length > 0) {
    console.log('')
    console.log(
      `${RETIRED_PREMISE_IDS.length} premise(s) were retired in WS-6 because their inputs ` +
        `no longer exist: ${RETIRED_PREMISE_IDS.join(', ')}. See the table at the top of ` +
        `scripts/verify-premises.mjs.`
    )
  }

  // Always written, including when empty: the reporting step closes an open drift issue
  // on an empty array and returns early on a *missing* file. Those are different answers
  // and only one of them is "all premises hold again".
  writeFileSync('premise-drift.json', JSON.stringify(drifted, null, 2))
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
