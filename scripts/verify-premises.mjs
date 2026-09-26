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
 * WS-6 removed that script. Taking the premises with it would have been the exact failure
 * [ADR 035](../docs/adr/035-a-control-outlives-its-subject.md) names: the reporting step
 * reads `premise-drift.json` and **returns early when the file is absent**, so with nothing
 * writing the file that early return would have become permanent and silent — a channel
 * that looks healthy because it never speaks.
 *
 * ## Six premises retired, one founded
 *
 * | premise | input it needed | retired by | why it is gone |
 * |---|---|---|---|
 * | `SHOPIFY-I18N` | the store's locales | WS-6 | an Admin API read of a store nothing queries |
 * | `SHOPIFY-COLLECTION-SET` | the store's collection list | WS-6 | there is no second collection set; `collection-handle-contract.test.ts` compares the ones that remain, in the fast gate |
 * | `SHOPIFY-SPEC-METAFIELD` | products carrying `custom.spec` | WS-6 | `specification` is required by the catalogue schema, so a record without one fails the build |
 * | `SHOPIFY-PAYMENTS` | order count and payment gateways | WS-6 | nothing on this site takes a payment |
 * | `SHOPIFY-WEBHOOK-DELIVERY` | order count and app-owned subscriptions | WS-6 | needs the Admin API, and the connector reads `needs_reconnect` |
 * | `SHOPIFY-API-VERSION` | a clock and a pinned version | WS-C | `scripts/lib/api-version.mjs` was deleted with the vendor it pinned |
 *
 * Retiring the sixth would have left this script collecting **nothing**, which is worse than
 * collecting something stale: `premise-drift.json` would be `[]` on every run, the reporting
 * step would read that as "all premises hold again", and a detector with no premises would
 * report perfect health forever. So a premise was founded in the same change —
 * `CHECKOUT-HOST-CNAME`, the one fact WS-E's 30-day retirement clock rests on and that
 * nothing in this repository controls. See `scripts/lib/premise-checks.mjs`.
 *
 * ## What this deliberately does not do
 *
 * It does not fail. A drifted premise means a recorded decision has gone stale, not that
 * the site is broken, and turning a scheduled run red for it is how a channel becomes noise
 * nobody reads ([ADR 011](../docs/adr/011-repeated-identical-failures-must-escalate.md)).
 * It always exits 0; the workflow decides what reaches a human.
 *
 * Dependency-free, like every script here: `node:dns` and nothing else.
 */

import { promises as dns } from 'node:dns'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { apexHostFromSiteConfig } from './lib/canonical-domain.mjs'
import { checkoutHostPremise, driftFileContent, formatPremises } from './lib/premise-checks.mjs'

const SITE_CONFIG = path.resolve(import.meta.dirname, '../src/config/site.ts')

/**
 * One DNS question, never throwing.
 *
 * The premise decision has to be able to tell "the resolver said NXDOMAIN" from "the
 * resolver could not answer", so a rejection is returned as data carrying its code rather
 * than propagated.
 *
 * @param {() => Promise<string[]>} ask
 * @returns {Promise<{ ok: true, records: string[] } | { ok: false, code: string }>}
 */
export async function answer(ask) {
  try {
    const records = await ask()
    return { ok: true, records: Array.isArray(records) ? records.map(String) : [] }
  } catch (error) {
    return { ok: false, code: String(error?.code ?? error?.message ?? 'UNKNOWN') }
  }
}

/**
 * Every premise this deployment can still evaluate.
 *
 * Exported so `verify-premises.test.ts` can assert the list rather than trusting it: a
 * premise silently dropping out of here is the same defect as one never added. The resolver
 * is injected so the test never touches the network.
 *
 * @param {object} input
 * @param {string | null} input.apex
 * @param {{ resolveCname: (h: string) => Promise<string[]>, resolveNs: (h: string) => Promise<string[]> }} [input.resolver]
 */
export async function collectPremises({ apex, resolver = dns }) {
  if (!apex) {
    // No apex means no hostname to ask about. Reported as an unevaluable premise rather
    // than omitted, because an omitted premise and a holding one look identical in the list.
    return [
      checkoutHostPremise({
        host: 'checkout.<unknown apex>',
        cname: { ok: false, code: 'NO-APEX' },
        control: { ok: false, code: 'NO-APEX: src/config/site.ts named no SITE_URL fallback' },
      }),
    ]
  }

  const host = `checkout.${apex}`
  const [control, cname] = [
    await answer(() => resolver.resolveNs(apex)),
    await answer(() => resolver.resolveCname(host)),
  ]
  return [checkoutHostPremise({ host, cname, control })]
}

/**
 * Premises this script used to evaluate, named so their removal is a record rather than an
 * absence. Each carries the workstream that retired it; the table at the top says why.
 */
export const RETIRED_PREMISES = [
  { id: 'SHOPIFY-I18N', retiredBy: 'WS-6' },
  { id: 'SHOPIFY-COLLECTION-SET', retiredBy: 'WS-6' },
  { id: 'SHOPIFY-SPEC-METAFIELD', retiredBy: 'WS-6' },
  { id: 'SHOPIFY-PAYMENTS', retiredBy: 'WS-6' },
  { id: 'SHOPIFY-WEBHOOK-DELIVERY', retiredBy: 'WS-6' },
  { id: 'SHOPIFY-API-VERSION', retiredBy: 'WS-C' },
]

async function main() {
  let apex = null
  try {
    apex = apexHostFromSiteConfig(readFileSync(SITE_CONFIG, 'utf8'))
  } catch {
    // Left null: collectPremises reports that as unevaluable rather than guessing a host.
  }

  const premises = await collectPremises({ apex })
  const { lines, summary } = formatPremises(premises)

  for (const line of lines) console.log(line)
  console.log('')
  console.log(summary)
  console.log('')
  console.log(
    `${RETIRED_PREMISES.length} premise(s) were retired because their inputs no longer ` +
      `exist: ${RETIRED_PREMISES.map((p) => `${p.id} (${p.retiredBy})`).join(', ')}. See the ` +
      `table at the top of scripts/verify-premises.mjs.`
  )

  // Written whenever the answer is a real one — including an empty array, which the
  // reporting step reads as "all premises hold again" and closes an open issue on. NOT
  // written when a premise could not be asked and nothing drifted: a missing file makes the
  // reporter return early, which is the only honest thing to do with an unanswered question.
  // The decision is `driftFileContent`, where a test can reach it.
  const content = driftFileContent(premises)
  if (content !== null) writeFileSync('premise-drift.json', JSON.stringify(content, null, 2))
  return 0
}

// `pathToFileURL(realpathSync(...))` rather than a hand-built `file://` string: Node resolves
// the main module through symlinks and percent-encodes the URL, so the string comparison
// silently never matched under a symlinked checkout or a path with a space in it — and a
// guard that never matches runs nothing, reporting nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main())
}
