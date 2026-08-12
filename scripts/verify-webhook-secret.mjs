#!/usr/bin/env node
/**
 * Proves whether SHOPIFY_WEBHOOK_SECRET is the *right* secret — without placing
 * a real order.
 *
 * ## Why this exists
 *
 * There are two different signing secrets, and picking the wrong one produces
 * an endless stream of silent 401s with no diagnostic signal anywhere:
 *
 *   - a webhook created **by an app** (Admin API `webhookSubscriptionCreate`)
 *     is signed with that app's **client secret**;
 *   - a webhook created in **Settings → Notifications** is signed with the
 *     **signing secret shown on that page**.
 *
 * Until now the only way to find out which one was configured was to place a
 * real order and read Vercel's function logs at the right moment. That test is
 * one-shot, costs money, and its signal is ephemeral. This script asks the same
 * question for free, repeatably, and answers it in one line.
 *
 * ## Why `products/update`
 *
 * It is a *handled* topic (so a correct secret returns 200, not 202) whose only
 * effect is cache revalidation. Probing with `orders/*` would write misleading
 * lines into the order log; probing with an unhandled topic would return 202
 * and conflate "secret is right" with "topic is ignored".
 *
 * ## Usage
 *
 *   SHOPIFY_WEBHOOK_SECRET=... node scripts/verify-webhook-secret.mjs https://healthyjewellery.com
 *
 * Exit code is 0 only when the secret is confirmed correct.
 */

/**
 * The signing and probe contract now lives in `scripts/lib/webhook-signature.mjs`, shared
 * with `verify-production.mjs`. Re-exported here so this CLI's own public surface is
 * unchanged and `webhook-signature-script.test.ts` keeps feeding *this script's* output
 * into the real route handler rather than being quietly rerouted one level down.
 */
export {
  WEBHOOK_PROBE_TOPIC,
  WEBHOOK_PATH,
  signWebhookBody,
  buildProbeBody,
  buildProbeRequest,
  interpretStatus,
  resolveStoreDomain,
} from './lib/webhook-signature.mjs'

import {
  WEBHOOK_PROBE_TOPIC,
  buildProbeRequest,
  interpretStatus,
  resolveStoreDomain,
} from './lib/webhook-signature.mjs'

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const siteUrl = process.argv[2] ?? process.env.PRODUCTION_SITE_URL
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  // Either variable; see resolveStoreDomain. Optional here — the route only rejects a
  // *mismatched* shop domain, so a preview deployment with none configured still works.
  let shopDomain
  try {
    shopDomain = resolveStoreDomain()
  } catch {
    shopDomain = undefined
  }

  if (!siteUrl) {
    console.error(
      'Usage: SHOPIFY_WEBHOOK_SECRET=... node scripts/verify-webhook-secret.mjs <site-url>\n' +
        '(or set PRODUCTION_SITE_URL)',
    )
    process.exit(2)
  }
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET is not set in this shell — nothing to verify.')
    process.exit(2)
  }

  const { url, init } = buildProbeRequest({ siteUrl, secret, shopDomain })
  console.log(`→ POST ${url}`)
  console.log(`  topic: ${WEBHOOK_PROBE_TOPIC}${shopDomain ? `, shop: ${shopDomain}` : ''}`)

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    console.error(`\n✗ Request failed before reaching the route: ${err.message}`)
    process.exit(1)
  }

  const { ok, verdict, detail } = interpretStatus(res.status)
  console.log(`\n${ok ? '✓' : '✗'} ${verdict} (HTTP ${res.status})\n${detail}`)

  // A correct secret is the only success. Everything else must fail the caller,
  // so this is usable as a CI step without anyone reading the output.
  process.exit(ok ? 0 : 1)
}

// Only run when executed directly, so importing this module in a test does not
// fire a live HTTP request or call process.exit.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
