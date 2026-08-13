/**
 * The webhook probe contract, shared by both verification CLIs.
 *
 * ## Why this is a module and not a script
 *
 * `verify-production.mjs` used to import `buildProbeRequest` straight out of
 * `verify-webhook-secret.mjs` — one CLI reaching into another CLI's internals. Two things
 * were wrong with that, beyond taste:
 *
 *   - **Nothing tested the coupling.** A change to the signature would have broken the
 *     production script silently, discovered only the next time someone ran it.
 *   - **The direct-execution guard became load-bearing for a case it was never written
 *     for.** `verify-production.mjs` avoided running the other script's `main()` only
 *     because that guard happened to hold.
 *
 * Deleting the import and duplicating the signing would have been worse: two copies of an
 * HMAC is how a silent divergence starts, and a divergence there means every webhook fails
 * authentication with no diagnostic at all. So the logic is shared — from a module both
 * CLIs depend on, rather than from one CLI to the other.
 *
 * `src/tests/unit/webhook-signature-contract.test.ts` pins the contract and asserts neither
 * CLI imports the other.
 */

import { createHmac } from 'node:crypto'

/**
 * The store domain, from whichever variable is set.
 *
 * The two CLIs disagreed about this: one accepted `SHOPIFY_STORE_DOMAIN` or
 * `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN`, the other hard-required the first. The same probe
 * therefore succeeded from one script and failed from the other — the shared-contract
 * violation in miniature, already real rather than hypothetical.
 *
 * The app itself reads only `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` (it must be inlined at build
 * time); the workflows set `SHOPIFY_STORE_DOMAIN`. Both are legitimate, so both are
 * accepted, and the error names both rather than only the one that happens to be checked
 * first.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveStoreDomain(env = process.env) {
  const domain = env.SHOPIFY_STORE_DOMAIN || env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
  if (!domain) {
    throw new Error(
      'No store domain. Set SHOPIFY_STORE_DOMAIN (used by CI and the workflows) or\n' +
        '  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN (used by the app). Either is accepted.',
    )
  }
  return domain
}

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
        'Order webhooks signed with this secret will be accepted.\n' +
        '  NOT proven: that Shopify is sending any. This probe is a request we signed ' +
        'ourselves — it tests the route, not the subscription. A store with no webhook ' +
        'configured in Settings → Notifications passes this exactly the same way. See ' +
        'the SHOPIFY-WEBHOOK-DELIVERY premise.',
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
