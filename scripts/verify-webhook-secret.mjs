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

import { createHmac } from 'node:crypto'

/**
 * The topic this probe sends. Handled by the route, side-effect-free with
 * respect to orders and money.
 */
export const WEBHOOK_PROBE_TOPIC = 'products/update'

export const WEBHOOK_PATH = '/api/webhooks/shopify'

/**
 * Sign a raw webhook body exactly the way Shopify does, and therefore exactly
 * the way `src/app/api/webhooks/shopify/route.ts` recomputes it.
 *
 * Takes bytes rather than a string on purpose: Shopify signs the exact bytes it
 * sent, and the route reads them via `req.arrayBuffer()` without ever parsing
 * first. Anything that re-serialises JSON in between can change the bytes and
 * break a signature that was actually correct.
 *
 * @param {Uint8Array | Buffer} rawBody
 * @param {string} secret
 * @returns {string} base64 HMAC-SHA256, the value of `x-shopify-hmac-sha256`
 */
export function signWebhookBody(rawBody, secret) {
  return createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('base64')
}

/**
 * A minimal, realistically-shaped `products/update` payload.
 *
 * `handle` is included because the route reads it to scope revalidation to a
 * single product (`revalidateTag('product:<handle>')`). The handle below is
 * deliberately not a real product: revalidating a tag nothing is registered
 * under is a no-op, so the probe cannot disturb a live product's cache.
 *
 * @returns {Buffer} the exact bytes to sign and send
 */
export function buildProbeBody() {
  return Buffer.from(
    JSON.stringify({
      id: 0,
      handle: '__webhook-secret-probe__',
      title: 'Webhook secret probe (not a real product)',
    }),
    'utf-8',
  )
}

/**
 * Build the probe request. Returns the pieces rather than sending, so tests can
 * feed the identical bytes and headers straight into the real route handler.
 *
 * @param {{ siteUrl: string, secret: string, shopDomain?: string, topic?: string, body?: Buffer }} opts
 */
export function buildProbeRequest({
  siteUrl,
  secret,
  shopDomain,
  topic = WEBHOOK_PROBE_TOPIC,
  body = buildProbeBody(),
}) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    'x-shopify-hmac-sha256': signWebhookBody(body, secret),
    'x-shopify-topic': topic,
  }
  // Only sent when known. The route rejects a *mismatched* shop domain but
  // ignores an absent one, so omitting it keeps the probe usable against a
  // preview deployment that has no store configured.
  if (shopDomain) {
    headers['x-shopify-shop-domain'] = shopDomain
  }

  return {
    url: new URL(WEBHOOK_PATH, siteUrl).toString(),
    init: { method: 'POST', headers, body },
  }
}

/**
 * Translate the route's status code into an operator-actionable verdict.
 *
 * The mapping is the route's own contract, not a guess:
 *   200 → handled topic, signature accepted
 *   202 → signature accepted, topic deliberately not handled
 *   401 → signature rejected (wrong secret, or wrong shop domain)
 *   503 → SHOPIFY_WEBHOOK_SECRET is unset in the deployed environment
 *
 * @param {number} status
 * @returns {{ ok: boolean, verdict: string, detail: string }}
 */
export function interpretStatus(status) {
  if (status === 200) {
    return {
      ok: true,
      verdict: 'SECRET CORRECT',
      detail:
        'The deployment recomputed the same signature and handled the topic. ' +
        'Order webhooks signed with this secret will be accepted.',
    }
  }
  if (status === 202) {
    return {
      ok: true,
      verdict: 'SECRET CORRECT (topic unhandled)',
      detail:
        'The signature was accepted but this topic is not in the handled ' +
        'allowlist. The secret is right; the probe topic was not.',
    }
  }
  if (status === 401) {
    return {
      ok: false,
      verdict: 'WRONG SECRET',
      detail:
        'The deployment computed a different signature. SHOPIFY_WEBHOOK_SECRET is almost ' +
        'certainly the wrong one of the two:\n' +
        '  · webhooks created in Shopify Admin (Settings → Notifications) are signed with\n' +
        '    the signing secret shown on that page;\n' +
        '  · webhooks created by an app are signed with the app client secret.\n' +
        'They are not interchangeable. (A mismatched x-shopify-shop-domain also 401s.)',
    }
  }
  if (status === 503) {
    return {
      ok: false,
      verdict: 'SECRET NOT SET',
      detail:
        'The deployment has no SHOPIFY_WEBHOOK_SECRET at all. Set it in the Vercel ' +
        'environment for this deployment, then redeploy — env vars are read at runtime, ' +
        'but the deployment must exist to read them.',
    }
  }
  return {
    ok: false,
    verdict: `UNEXPECTED STATUS ${status}`,
    detail:
      'The webhook route did not answer with one of its documented statuses. ' +
      'This usually means the request never reached the route — check the URL, ' +
      'and that the deployment is live.',
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const siteUrl = process.argv[2] ?? process.env.PRODUCTION_SITE_URL
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN ?? process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN

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
