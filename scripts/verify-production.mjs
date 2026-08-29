#!/usr/bin/env node
/**
 * Checks the things the merge gate structurally cannot.
 *
 * ## Why this exists
 *
 * `.github/workflows/ci.yml` runs the entire unit and E2E suite against
 * `mock.myshopify.com`. That is the right call — the gate must be hermetic and
 * fast — but it means no automated test has ever touched the real store. Every
 * commerce outage this project has had lived in exactly that blind spot:
 *
 *   - 22 products published to Online Store and 0 to the headless channel, so
 *     the Storefront token saw an empty catalogue and every page silently
 *     served the static fallback;
 *   - all 38 variants `availableForSale: false`, so a fully-working store
 *     would still have sold nothing;
 *   - prices rendered in USD by a store that charges VND.
 *
 * Not one of those is visible to a suite that never leaves localhost. All three
 * would have been caught by loading the live /shop page and looking at it.
 *
 * ## What it does not do
 *
 * It does not place an order, and it cannot tell you whether a payment provider
 * is active — the Admin API does not expose that. See `docs/go-live-runbook.md`.
 *
 * ## Usage
 *
 *   PRODUCTION_SITE_URL=https://healthyjewellery.com \
 *   SHOPIFY_STORE_DOMAIN=y0k9ve-q1.myshopify.com \
 *   SHOPIFY_STOREFRONT_ACCESS_TOKEN=... \
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=... \
 *   node scripts/verify-production.mjs
 *
 * Every check runs even when an earlier one fails, so one run reports the whole
 * picture rather than only the first problem.
 */

import { writeFileSync } from 'node:fs'
import { buildProbeRequest, resolveStoreDomain } from './lib/webhook-signature.mjs'
import {
  i18nPremise,
  collectionSetPremise,
  specMetafieldPremise,
  paymentsPremise,
  apiVersionPremise,
  webhookDeliveryPremise,
  formatPremises,
} from './lib/premise-checks.mjs'
import { SHOPIFY_API_VERSION, compareServedApiVersion } from './lib/api-version.mjs'
import { staleBundleVerdict, shopifyConfigVerdict } from './lib/deployment-verdict.mjs'
import { describeFetchError, hintForFetchError } from './lib/fetch-error.mjs'

/**
 * Cold-start budget for the Open Graph image, in milliseconds.
 *
 * The route dropped `runtime = 'edge'` so it could read Shopify, which was the right call —
 * the edge version rendered the wrong product — but the tradeoff was accepted with no
 * number attached. A cold start that exceeds a crawler's unfurl timeout means the share
 * card fails to render *at all*, which is worse than the wrong card the change fixed.
 *
 * 2500ms sits under the 3s low end of published unfurl timeouts (commonly cited as 3–5s),
 * leaving room for a slow Storefront response on top of a Vercel cold start. Measured
 * locally at 513ms cold and 54ms warm — but that is a floor, not an estimate, because the
 * local Shopify call fails fast against a placeholder domain. Production is the only place
 * this number means anything, which is why it is asserted here and not in a unit test.
 */
const OG_COLD_START_BUDGET_MS = 2500

/**
 * The floor for product photography coverage, as a count of photographed products.
 *
 * One, not all 22, and deliberately so: the claim being defended is that the storefront
 * shows the physical object at all, and the first photograph is what turns that from false
 * to true. A percentage target would be a merchandising opinion; this is the difference
 * between a catalogue that argues its case and one that draws icons of it.
 *
 * Justified in STATE.md item 9 (SHOPIFY-PRODUCT-PHOTOGRAPHY, kind: blocking) and
 * docs/adr/014-monochrome-was-not-decided.md, which defers the palette's colour question
 * until this stops being zero.
 */
const MIN_PHOTOGRAPHED_PRODUCTS = 1

/**
 * Imported, never re-declared. This literal used to be spelled out here *and* in
 * `src/config/shopify-public.ts`, and both said `2025-01` for months after Shopify
 * stopped serving it — two copies agreeing with each other is not the same as either
 * being right. See ADR 009 and `src/tests/unit/api-version-contract.test.ts`.
 */
const API_VERSION = SHOPIFY_API_VERSION

/** The publication the Storefront token reads from. Found by name, not by a
 *  hardcoded gid, so recreating the channel does not silently pass.
 *
 *  The name is the *channel's* name in Shopify Admin → Sales channels → Headless,
 *  which is `Healthy Jewellery` — not the store's name, and not the brand plus the
 *  word "Store". This read `Healthy Jewellery Store` until 2026-08-14, and because
 *  the Admin token was simultaneously missing `read_publications`, the lookup never
 *  got far enough to be wrong out loud. Granting the scope alone would have turned a
 *  scope error into `No publication named "Healthy Jewellery Store"` — a confident
 *  accusation about the merchant's catalogue, sourced from a typo here. */
const HEADLESS_PUBLICATION_NAME = 'Healthy Jewellery'

/**
 * Handles that exist **only** in `src/lib/data/hj-data.ts`.
 *
 * Seeing one of these on the live site is proof the page fell back to static
 * data — which is exactly what "Dome Ring · 112.00" was, a product that has
 * never existed in Shopify.
 */
export const FALLBACK_ONLY_HANDLES = [
  'dome-ring-titanium',
  'flat-band-niobium',
  'cone-studs-niobium',
]

/**
 * Handles that exist **only** in the live Shopify catalogue. Seeing these is
 * positive proof the Storefront fetch succeeded, which absence of the fallback
 * tells alone would not give you.
 */
export const SHOPIFY_ONLY_HANDLES = [
  'meridian-cuff',
  'tectonic-ring',
  'nova-pendant',
  'terra-bangle',
]

// ── tiny check harness ──────────────────────────────────────────────────────

const results = []
/** Measurements worth reporting whether or not they breach a budget. */
const timings = {}

/**
 * The collection handles `/shop/[collection]` will serve.
 *
 * Mirrors `hjCollections` in `src/lib/data/hj-data.ts`. Duplicated here only because this
 * script is dependency-free `.mjs` and cannot import TypeScript; `premise-checks.test.ts`
 * is not the guard for that, `collection-set drift` is — if these fall out of step with
 * Shopify the check fires either way, which is the property that matters.
 */
const KNOWN_COLLECTIONS = [
  { handle: 'rings' },
  { handle: 'necklaces' },
  { handle: 'earrings' },
  { handle: 'bracelets' },
  { handle: 'charms' },
]

/**
 * Three outcomes, not two.
 *
 * The first live run of this script reported **12 failures**, and several of them were not
 * failures — they were checks that never got to look. The Admin token lacked `read_products`,
 * so "Every product is published to the headless publication" threw an authorization error
 * and was printed under `Failed:` beside genuine breakage. A reader takes that at face value
 * and goes looking for unpublished products that are, in fact, published.
 *
 * So an unevaluable check gets its own mark. What it does **not** get is a pass: a control
 * that could not run is not a control that succeeded, so it still counts against the run and
 * still exits non-zero (ADR 006). The distinction is in the *name*, which is the part a
 * human acts on.
 */
async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
    console.log(`✓ ${name}\n  ${detail}\n`)
  } catch (err) {
    const unevaluable = err.unevaluable === true
    results.push({ name, ok: false, unevaluable, detail: err.message })
    console.log(`${unevaluable ? '⚠' : '✗'} ${name}\n  ${err.message}\n`)
  }
}

/**
 * A credential this check needs, or an **unevaluable** error.
 *
 * Not a plain `Error`. A missing credential means the check could not look; it says nothing
 * about whether the thing it examines is broken. Throwing a hard failure here prints
 * `✗ Every product is published to the headless publication` under `Failed:` and sends a
 * reader hunting for unpublished products that are, in fact, published — the exact
 * mislabelling `describeAccessDenial` was written to prevent one layer down, arriving
 * through the credential instead of through the API's response.
 *
 * This matters now that each live step gates on its own capability rather than on the
 * preflight's verdict: a run with a wrong Admin token executes the twelve checks that never
 * read it, and the five that do must report `⚠ could not evaluate` rather than five
 * fabricated production failures.
 *
 * An unevaluable check still counts against the run and still exits non-zero (ADR 006) —
 * a control that could not run is not a control that succeeded. Only the *name* changes,
 * which is the part a human acts on.
 */
export function required(varName) {
  const value = process.env[varName]
  if (!value) throw unevaluableError(`${varName} is not set, so this check could not run`)
  return value
}

/**
 * Turn a Shopify GraphQL error array into a scope-denial sentence, or `null` if the
 * failure was something else.
 *
 * Shopify answers an under-scoped Admin token with **HTTP 200** and an `ACCESS_DENIED`
 * entry in `errors` — the same shape as a genuine data problem. Raw, it reads as:
 *
 *     Admin API: [{"message":"Access denied for products field.","locations":[…],
 *     "extensions":{"code":"ACCESS_DENIED","documentation":"https://shopify.dev/…"}}]
 *
 * printed under the heading "Every product is published to the headless publication".
 * The check never reached the store, but the line says it did and failed.
 *
 * Pure, so the denial branch — which needs a deliberately under-scoped token to observe —
 * runs in CI against the real payloads captured from the live run.
 *
 * `errors` is whatever came back in the GraphQL envelope, so the type admits `undefined`
 * rather than pretending a caller has already checked. The `Array.isArray` guard below is
 * the reason that is safe, and the reason it is declared this way instead of asserted away
 * at the call site.
 *
 * @param {{ message?: string, path?: (string | number)[], extensions?: { code?: string, requiredAccess?: string } }[] | undefined | null} errors
 * @returns {string | null}
 */
export function describeAccessDenial(errors) {
  const denied = (Array.isArray(errors) ? errors : []).filter(
    (e) => e?.extensions?.code === 'ACCESS_DENIED',
  )
  if (denied.length === 0) return null

  const fields = [...new Set(denied.map((e) => e.path?.[0]).filter(Boolean))]
  // `requiredAccess` is populated for some fields and absent for others, so it is
  // reported when Shopify offers it and never invented when it does not.
  const scopes = [...new Set(denied.map((e) => e.extensions?.requiredAccess).filter(Boolean))]

  return (
    `could not be evaluated — the Admin token is not scoped for ` +
    `${fields.length > 0 ? fields.join(', ') : 'this query'}.\n` +
    (scopes.length > 0 ? `  Shopify says it needs: ${scopes.join('; ')}.\n` : '') +
    '  This is a missing permission on the token, NOT a finding about the store. Regrant\n' +
    '  the scopes in Shopify Admin → Apps → your custom app → Configuration, then reinstall\n' +
    '  the app — scope changes do not take effect until it is reinstalled.'
  )
}

/**
 * Turn a **rejected** credential into a sentence, or `null` if the failure was something else.
 *
 * `describeAccessDenial` above handles the token Shopify *accepted* and then refused a field
 * to: HTTP 200, an `errors` **array**, `extensions.code === 'ACCESS_DENIED'`. That is
 * authorization. It is not the only way a credential can stop a check from looking, and it
 * was the only one classified.
 *
 * A token of the wrong *kind* — a Storefront token sent to the Admin API — is rejected at the
 * door instead, and Shopify answers in a different shape entirely:
 *
 *     HTTP 401
 *     {"errors":"[API] Invalid API key or access token (unrecognized login or wrong password)"}
 *
 * `errors` is a **string**, so `Array.isArray` is false, so `describeAccessDenial` returns
 * `null`, so the call fell through to a plain `Error` and five checks printed under `Failed:`
 * as though they had examined the store. Run 33232085670 is that log — the acceptance run for
 * the very change that claimed these five would report `⚠ could not evaluate`. The
 * classification had a hole in exactly the shape of production's actual state, and nothing had
 * pointed it at that known answer ([ADR 024](docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 *
 * Status is the primary signal because it is the one Shopify is consistent about: 401 and 403
 * from *our* request to *their* API are always a statement about our credential and never a
 * finding about the store. The message match is the fallback for the surfaces that answer 200
 * with the same sentence.
 *
 * Pure, so both branches run in CI against the verbatim payload from that run.
 *
 * @param {'Admin' | 'Storefront'} surface
 * @param {number | undefined} status
 * @param {unknown} errors
 * @returns {string | null}
 */
export function describeCredentialRejection(surface, status, errors) {
  const messages = (
    typeof errors === 'string'
      ? [errors]
      : Array.isArray(errors)
        ? errors.map((e) => (typeof e === 'string' ? e : e?.message))
        : []
  ).filter((m) => typeof m === 'string' && m.trim().length > 0)

  const rejectedByStatus = status === 401 || status === 403
  const rejectedByMessage = messages.some((m) =>
    /invalid api key or access token|unrecognized login|access token is invalid/i.test(m),
  )
  if (!rejectedByStatus && !rejectedByMessage) return null

  const secret =
    surface === 'Admin' ? 'SHOPIFY_ADMIN_ACCESS_TOKEN' : 'SHOPIFY_STOREFRONT_ACCESS_TOKEN'

  // Deliberately does not name the surface: every caller already prefixes it, and
  // "Admin API could not be evaluated — the Admin API rejected the token" is what the
  // acceptance run printed. `describeAccessDenial` is worded to slot in the same way.
  return (
    `could not be evaluated — the API rejected this token` +
    `${typeof status === 'number' ? ` (HTTP ${status})` : ''}.\n` +
    (messages.length > 0 ? `  Shopify says: ${messages.join('; ')}\n` : '') +
    `  This is a credential problem, NOT a finding about the store. ${secret} does not hold\n` +
    `  a token this API recognises — most often a token for the *other* surface, which is a\n` +
    '  different credential rather than a differently-scoped one. Correct it in the Shopify\n' +
    '  admin; no code change resolves this, and no other check here depends on it.'
  )
}

/**
 * Parse a Shopify response body without letting a non-JSON error page throw.
 *
 * A rejected request does not always answer in JSON, and `res.json()` throwing here would
 * lose the status — the one field that says unambiguously whether the credential or the store
 * is at fault.
 *
 * @param {Response} res
 */
async function readGraphqlBody(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { errors: text.trim().slice(0, 300) }
  }
}

/**
 * An error a check could not evaluate, as opposed to one it evaluated and failed.
 * See the note on `check()`.
 */
function unevaluableError(message) {
  const err = new Error(message)
  err.unevaluable = true
  return err
}

async function adminGraphql(query, variables = {}) {
  const domain = resolveStoreDomain()
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': required('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await readGraphqlBody(res)
  // Rejected before under-scoped: a 401 never reaches the point where a scope could matter.
  const rejection = describeCredentialRejection('Admin', res.status, json.errors)
  if (rejection) throw unevaluableError(`Admin API ${rejection}`)
  if (json.errors) {
    const denial = describeAccessDenial(json.errors)
    if (denial) throw unevaluableError(`Admin API ${denial}`)
    throw new Error(`Admin API: ${JSON.stringify(json.errors)}`)
  }
  return json.data
}

async function storefrontGraphql(query, variables = {}) {
  const domain = resolveStoreDomain()
  const res = await fetch(`https://${domain}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': required('SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await readGraphqlBody(res)
  // Symmetric with the Admin surface on purpose. This one is not failing today, and a
  // classification that only covers the credential currently known to be wrong is the
  // asymmetry this repository keeps finding the hard way.
  const rejection = describeCredentialRejection('Storefront', res.status, json.errors)
  if (rejection) throw unevaluableError(`Storefront API ${rejection}`)
  if (json.errors) throw new Error(`Storefront API: ${JSON.stringify(json.errors)}`)
  return json.data
}

// ── checks ──────────────────────────────────────────────────────────────────

/**
 * Does `PRODUCTION_SITE_URL` actually serve the app, or does it hand back a redirect?
 *
 * Found the hard way. The apex domain answered **307 → https://healthy-jewellery.vercel.app/**,
 * and the consequences were spread across the report as twelve unrelated-looking failures:
 * `unknownUrlsAreNotIndexable` uses `redirect: 'manual'`, saw the 307, and blamed
 * `dynamicParams = false` — a correct observation attached to the wrong cause, which is worse
 * than no observation, because someone will go and change `dynamicParams`.
 *
 * The webhook consequence is the serious one and it is invisible to every other check here.
 * Shopify requires a webhook endpoint to answer 2xx. A 3xx is not a 2xx: the delivery is
 * recorded as failed and retried, and a subscription that keeps failing is removed
 * automatically. So while this holds, **no order webhook can ever be delivered to the
 * configured domain, no matter how correct the signing secret is** — and
 * `verify-webhook-secret.mjs` cannot see it either, because a 3xx is not one of the route's
 * documented statuses.
 *
 * Runs first so the report names the cause before it lists the symptoms.
 */
async function siteUrlIsServedDirectly() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const res = await fetch(siteUrl, {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
    redirect: 'manual',
  })

  const verdict = classifyOriginResponse(siteUrl, res.status, res.headers.get('location'))
  if (!verdict.ok) throw new Error(verdict.detail)
  return verdict.detail
}

/**
 * Pure half of the origin check, so the redirect branch is exercised in CI rather than
 * only ever in production — which is the branch that was wrong for the entire life of
 * this script.
 *
 * @param {string} siteUrl the configured PRODUCTION_SITE_URL
 * @param {number} status
 * @param {string | null} location the `Location` response header, if any
 * @returns {{ ok: boolean, detail: string }}
 */
export function classifyOriginResponse(siteUrl, status, location) {
  if (status < 300 || status >= 400) {
    return { ok: true, detail: `${siteUrl} answers ${status} directly — no redirect in front of it.` }
  }

  const target = location ?? '(no Location header)'
  let sameOrigin = false
  try {
    sameOrigin = new URL(target, siteUrl).origin === new URL(siteUrl).origin
  } catch {
    // An unparseable Location is its own problem; treat it as cross-origin, which is
    // the branch that reports more rather than less.
  }

  return {
    ok: false,
    detail:
      `${siteUrl} answers ${status} → ${target}, so it is NOT the origin serving the app.\n` +
      '  Two consequences, and the second one is silent:\n' +
      '  · Shopify requires a webhook endpoint to answer 2xx. A 3xx is a failed delivery,\n' +
      '    retried, and a subscription that keeps failing is removed — so no order webhook\n' +
      '    can reach this domain however correct SHOPIFY_WEBHOOK_SECRET is.\n' +
      '  · Every check below that inspects a status code sees this redirect instead of the\n' +
      '    app\'s own answer, and will report a plausible but wrong cause.\n' +
      (sameOrigin
        ? '  The target is the same origin, so this is likely a path or trailing-slash rule.\n'
        : '  The target is a DIFFERENT origin — typically a Vercel domain that was never\n' +
          '  attached to the project, leaving the apex on a redirect instead of an alias.\n') +
      '  Fix it in Vercel → Project → Settings → Domains, or point PRODUCTION_SITE_URL and\n' +
      '  the runbook at whichever host is genuinely serving the app.',
  }
}

/**
 * The outside-in check. Everything else here talks to Shopify directly; this
 * one asks what a customer's browser actually receives, which is the only place
 * the fallback bug was ever visible.
 */
/**
 * What is this run actually testing?
 *
 * Nothing else here asks, and for the life of this project that has been the missing
 * variable. A stale branch alias, a build that reused its cache and kept old inlined
 * values, and a storefront token Shopify rejects all produce the same visible site: the
 * static fallback catalogue, rendering perfectly, refusing checkout. Eleven red checks
 * describe the symptom eleven times and never separate the three.
 *
 * `/api/version` separates them in one request, and has since PR #19. The verdict logic
 * is imported from `lib/deployment-verdict.mjs` rather than rewritten — it is pure,
 * unit-tested against branches that can only occur on a broken deployment, and a second
 * implementation here would be the third copy of a predicate this repo has already paid
 * for duplicating twice (see `cacheTags.ts`, and the API-version literal in ADR 009).
 *
 * A 404 is itself a finding, and a decisive one: the endpoint has been on `main` since
 * 2026-08-12, so a deployment without it *is* the stale-deployment case, proven rather
 * than suspected.
 */
async function deploymentIdentifiesItself() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  let res
  try {
    res = await fetch(new URL('/api/version', siteUrl), {
      headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
    })
  } catch (err) {
    const description = describeFetchError(err)
    const hint = hintForFetchError(description)
    throw new Error(
      `Could not reach ${siteUrl} at all: ${description}` + (hint ? `\n  ${hint}` : ''),
    )
  }

  if (res.status === 404) {
    throw new Error(
      'This deployment has no /api/version, so it predates 2026-08-12 and is NOT serving\n' +
        '  current main. Every other failure in this run describes that old build, not the\n' +
        '  code you are reading. Redeploy the production branch before diagnosing anything\n' +
        '  else — and check whether this URL is a frozen branch alias rather than Production.',
    )
  }
  if (!res.ok) throw new Error(`GET /api/version returned ${res.status}`)

  const payload = await res.json()
  const stale = staleBundleVerdict(payload)
  const config = shopifyConfigVerdict(payload)
  const env = payload.runtime?.vercelEnv ?? payload.build?.vercelEnv ?? 'unknown'
  const commit = payload.build?.shortCommit || payload.build?.commit || 'unknown'
  const identity = `commit ${commit}, env ${env}, built ${payload.build?.builtAt ?? 'unknown'}`

  const failures = [stale, config].filter((v) => v.level === 'fail')
  if (failures.length > 0) {
    throw new Error(
      `${identity}\n` +
        failures.map((v) => `  ${v.title}\n    ${v.detail}\n    → ${v.action}`).join('\n'),
    )
  }

  return identity
}

async function liveSiteServesShopifyData() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const res = await fetch(new URL('/shop', siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })
  if (!res.ok) throw new Error(`GET /shop returned ${res.status}`)
  const html = await res.text()

  const leaked = FALLBACK_ONLY_HANDLES.filter((h) => html.includes(h))
  if (leaked.length > 0) {
    throw new Error(
      `The live /shop page is serving the STATIC FALLBACK catalogue, not Shopify.\n` +
        `  Found handles that exist only in src/lib/data/hj-data.ts: ${leaked.join(', ')}\n` +
        `\n` +
        `  This symptom does NOT identify its cause, and guessing here has cost real time.\n` +
        `  \`getProducts()\` falls back for three distinct reasons and renders the same page\n` +
        `  for all three (see reportFallback in src/lib/shopify/index.ts). In the order they\n` +
        `  are worth checking:\n` +
        `    1. not-configured — the deployment has no store domain or no storefront token.\n` +
        `       GET /api/version on this deployment answers this outright: shopify.configured.\n` +
        `    2. fetch-failed — the token is set but Shopify rejects it. A Storefront token is\n` +
        `       32 hex characters; an Admin token starts with "shpat_" and yields UNAUTHORIZED\n` +
        `       with an empty message. Check "A real cart yields a real checkout URL" below.\n` +
        `    3. empty-response — the token works but the catalogue it can see is empty.\n` +
        `       That is the publication case; "Every product is published to the headless\n` +
        `       publication" tests it directly and will say so.\n` +
        `  Read those two checks before touching the store's publication settings.`,
    )
  }

  const found = SHOPIFY_ONLY_HANDLES.filter((h) => html.includes(h))
  if (found.length === 0) {
    throw new Error(
      `No Shopify-only product handles found on /shop. Expected at least one of:\n` +
        `  ${SHOPIFY_ONLY_HANDLES.join(', ')}\n` +
        `  Absence of the fallback tells is not by itself proof the fetch succeeded.`,
    )
  }

  // The store charges VND. A page quoting dollars is quoting a price the
  // checkout will not honour.
  if (!html.includes('₫')) {
    throw new Error(
      'No ₫ found on /shop. The store charges VND; a page rendering any other ' +
        'currency is quoting a price Shopify will not charge.',
    )
  }

  return `Live catalogue confirmed (${found.length}/${SHOPIFY_ONLY_HANDLES.length} Shopify-only handles, VND rendered)`
}

/**
 * The publishing bug that caused the original outage, checked directly.
 *
 * Written as "every product, no exceptions" rather than a count, because the
 * way this regresses is a *new* product added and not published — which a
 * hardcoded 22 would happily pass once the total moved on.
 */
async function everyProductPublishedToHeadless() {
  const { publications } = await adminGraphql(
    `query { publications(first: 25) { edges { node { id name } } } }`,
  )
  const publication = publications.edges
    .map((e) => e.node)
    .find((n) => n.name === HEADLESS_PUBLICATION_NAME)

  if (!publication) {
    throw new Error(
      `No publication named "${HEADLESS_PUBLICATION_NAME}". The Storefront token reads ` +
        `from its own app publication; without it every query returns an empty catalogue.`,
    )
  }

  const data = await adminGraphql(
    `query($id: ID!) {
       products(first: 250) {
         edges { node { handle status publishedOnPublication(publicationId: $id) } }
       }
     }`,
    { id: publication.id },
  )

  const products = data.products.edges.map((e) => e.node)
  if (products.length === 0) throw new Error('The store has no products at all.')

  const unpublished = products.filter((p) => !p.publishedOnPublication).map((p) => p.handle)
  if (unpublished.length > 0) {
    throw new Error(
      `${unpublished.length} of ${products.length} products are NOT published to ` +
        `"${HEADLESS_PUBLICATION_NAME}" and are therefore invisible to the storefront:\n` +
        `  ${unpublished.join(', ')}`,
    )
  }

  const inactive = products.filter((p) => p.status !== 'ACTIVE').map((p) => p.handle)
  if (inactive.length > 0) {
    throw new Error(`Published but not ACTIVE: ${inactive.join(', ')}`)
  }

  return `${products.length}/${products.length} products published to "${HEADLESS_PUBLICATION_NAME}" and ACTIVE`
}

/**
 * The closest machine-checkable proxy for "commerce works": a real variant, a
 * real cart, a real checkout URL. This is the step that would have caught
 * `cartCreate` failing on the static catalogue's placeholder variant IDs.
 */
async function cartCreateReturnsCheckoutUrl() {
  const data = await storefrontGraphql(
    `query {
       products(first: 5) {
         edges {
           node {
             handle
             variants(first: 1) { edges { node { id availableForSale } } }
           }
         }
       }
     }`,
  )

  const nodes = data.products.edges.map((e) => e.node)
  if (nodes.length === 0) {
    throw new Error(
      'The Storefront API returned zero products. The token is valid but sees an empty ' +
        'catalogue — check publication scope.',
    )
  }

  const candidate = nodes
    .map((n) => ({ handle: n.handle, variant: n.variants.edges[0]?.node }))
    .find((c) => c.variant?.availableForSale)

  if (!candidate) {
    throw new Error(
      'No variant is availableForSale. A store in this state accepts nothing — every ' +
        'product renders Sold Out. Check inventory tracking and policy.',
    )
  }

  const cart = await storefrontGraphql(
    `mutation($lines: [CartLineInput!]!) {
       cartCreate(input: { lines: $lines }) {
         cart { id checkoutUrl cost { totalAmount { amount currencyCode } } }
         userErrors { field message }
       }
     }`,
    { lines: [{ merchandiseId: candidate.variant.id, quantity: 1 }] },
  )

  const { cart: created, userErrors } = cart.cartCreate
  if (userErrors?.length > 0) {
    throw new Error(`cartCreate returned userErrors: ${JSON.stringify(userErrors)}`)
  }
  if (!created?.checkoutUrl) {
    throw new Error('cartCreate returned no checkoutUrl — customers cannot reach checkout.')
  }

  const currency = created.cost?.totalAmount?.currencyCode
  if (currency && currency !== 'VND') {
    throw new Error(`Cart priced in ${currency}, but the store charges VND.`)
  }

  return `cartCreate → ${created.checkoutUrl} (${created.cost?.totalAmount?.amount} ${currency}, via ${candidate.handle})`
}

/**
 * The metadata layer, checked where the bug actually lived.
 *
 * `generateMetadata` and the OG image read the *static* catalogue while the page
 * body read Shopify. Because the two are nearly disjoint, 20 of the 22 live
 * products served `<title>Product Not Found</title>` from a page that rendered
 * perfectly — and nothing hermetic could see it, because without Shopify
 * credentials both sources return the same thing. Only a Shopify-only handle
 * against the real deployment can tell them apart.
 */
async function productMetadataNamesTheProduct() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const handle = SHOPIFY_ONLY_HANDLES[0]
  const res = await fetch(new URL(`/products/${handle}`, siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })
  if (!res.ok) throw new Error(`GET /products/${handle} returned ${res.status}`)
  const html = await res.text()

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''
  if (/product not found/i.test(title)) {
    throw new Error(
      `/products/${handle} renders, but its <title> is "${title}".\n` +
        `  generateMetadata is reading the static catalogue instead of Shopify —\n` +
        `  this handle exists only in Shopify, so the static lookup returns nothing.`,
    )
  }
  if (title.trim().length === 0) throw new Error(`/products/${handle} has an empty <title>`)

  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1] ?? ''
  if (!ogTitle || ogTitle.trim() === 'Product') {
    throw new Error(
      `og:title is "${ogTitle || '(missing)'}" — the share card is not naming the product.`,
    )
  }

  return `"${title.trim()}" (og:title "${ogTitle.trim()}")`
}

/**
 * The Satori failure was invisible from everywhere except a request: the route
 * compiled, type-checked, deployed, and threw only when a crawler asked.
 */
async function openGraphImageRenders() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const handle = SHOPIFY_ONLY_HANDLES[0]
  const res = await fetch(new URL(`/products/${handle}/opengraph-image`, siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })

  if (!res.ok) throw new Error(`OG image returned ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('image/png')) throw new Error(`OG image content-type is "${type}"`)

  const bytes = (await res.arrayBuffer()).byteLength
  // A Satori failure can still answer 200 with a near-empty body.
  if (bytes < 1000) throw new Error(`OG image is only ${bytes} bytes — likely a render failure`)

  return `${(bytes / 1024).toFixed(0)} KB PNG for ${handle}`
}

/**
 * Site search ran against the static catalogue from the browser, so it could
 * not find a single product actually for sale.
 */
async function searchFindsShopifyProducts() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const res = await fetch(new URL('/search?q=cuff', siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })
  if (!res.ok) throw new Error(`GET /search returned ${res.status}`)
  const html = await res.text()

  const found = SHOPIFY_ONLY_HANDLES.filter((h) => html.includes(h))
  if (found.length === 0) {
    throw new Error(
      'Search for "cuff" returned no Shopify-only product. Either /search is still\n' +
        '  reading the static catalogue, or the Shopify search query returned nothing.',
    )
  }

  return `found ${found.join(', ')}`
}

/**
 * Rate limiting is only durable when Upstash is configured *and answering*.
 * Without it, the in-memory fallback counts per Lambda instance, so the
 * effective limit is `limit × instances` on the unauthenticated endpoint that
 * creates carts.
 */
async function rateLimitingIsDistributed() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const res = await fetch(new URL('/api/health', siteUrl))
  const body = await res.json()

  if (!body.rateLimitDistributed) {
    throw new Error(
      'Rate limiting is NOT distributed — UPSTASH_REDIS_REST_URL / _TOKEN are unset in\n' +
        `  this environment. ${body.hint ?? ''}`,
    )
  }
  if (body.redis !== 'ok') {
    throw new Error(
      `Upstash is configured but reported "${body.redis}" — limits are failing open.\n` +
        `  ${body.hint ?? ''}`,
    )
  }

  return 'rate limits are shared across instances (Upstash answering)'
}

/**
 * Proves the whole revalidation chain, which nothing hermetic can.
 *
 * A unit test can only assert that `revalidateTag` was called with some string.
 * That is exactly the assertion that stayed green for months while
 * `revalidateTag('collections')` named a tag no fetch registered — the test and
 * the bug agreed with each other. `cache-tag-contract.test.ts` now catches that
 * class offline, but it still cannot prove the deployed function reaches the
 * deployed cache.
 *
 * So: send a genuinely signed webhook, then watch the page's cache state move.
 * `x-nextjs-cache` reports HIT for a page served from the full-route cache; a
 * successful revalidation drops that entry, so the next request must not be a
 * HIT.
 *
 * Deliberately does **not** mutate the store. An earlier proposal compared a
 * product's price before and after a real edit, which needs a price change to
 * exist and rewrites live catalogue data to run a test.
 *
 * **Fails closed.** If the header is absent the check reports that it could not
 * verify rather than passing — a cache assertion that silently degrades into a
 * no-op is worse than no assertion, because it reads as proof.
 */
async function webhookRevalidatesTheCachedPage() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const secret = required('SHOPIFY_WEBHOOK_SECRET')
  const shopDomain = resolveStoreDomain()
  const handle = SHOPIFY_ONLY_HANDLES[0]
  const pageUrl = new URL(`/products/${handle}`, siteUrl)

  const fetchPage = async () => {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`GET /products/${handle} returned ${res.status}`)
    return res.headers.get('x-nextjs-cache')
  }

  // Warm it, so the page is definitely in the route cache before we try to
  // knock it out. Two requests: the first may MISS while it generates.
  await fetchPage()
  const warmed = await fetchPage()

  if (warmed === null) {
    throw new Error(
      'No x-nextjs-cache header on the product page, so revalidation cannot be\n' +
        '  verified from outside. Reporting this as a failure rather than a pass:\n' +
        '  a cache check that silently stops checking reads as proof and is not.',
    )
  }
  if (warmed !== 'HIT') {
    throw new Error(
      `Expected the page to be cached (HIT) after warming, got "${warmed}". The route\n` +
        '  may be opting out of the full-route cache, which would make the\n' +
        '  revalidation contract meaningless.',
    )
  }

  // A real, correctly signed products/update for this handle.
  const { url, init } = buildProbeRequest({
    siteUrl,
    secret,
    shopDomain,
    body: Buffer.from(JSON.stringify({ id: 0, handle }), 'utf-8'),
  })
  const hook = await fetch(url, init)
  if (hook.status !== 200) {
    throw new Error(
      `The webhook was not accepted (HTTP ${hook.status}), so this check cannot say\n` +
        '  anything about revalidation. Run `pnpm verify:webhook` first.',
    )
  }

  const after = await fetchPage()
  if (after === 'HIT') {
    throw new Error(
      `The page is still served from cache (HIT) after a signed products/update for\n` +
        `  "${handle}". The webhook is authenticated but its revalidation is not\n` +
        '  reaching this page — check that the tag it revalidates is the tag the\n' +
        '  fetch registers (src/lib/shopify/cacheTags.ts).',
    )
  }

  return `cache went HIT → ${after} after a signed products/update for ${handle}`
}

/**
 * Soft-404 containment, checked on the live deployment.
 *
 * `/products/<unknown>` answers 200 while rendering not-found — Next returns 200 for
 * streamed responses, and this route cannot lock its params without 404ing newly added
 * products. `noindex` is what keeps those URLs out of the index, so it is the thing worth
 * verifying in production; the status code is known-wrong by design.
 */
async function unknownUrlsAreNotIndexable() {
  const siteUrl = required('PRODUCTION_SITE_URL')

  const productRes = await fetch(new URL('/products/__no-such-product__', siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })
  const html = await productRes.text()
  if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) {
    throw new Error(
      'An unknown product URL is missing `noindex`. It answers HTTP 200 while rendering\n' +
        '  not-found, so without that tag every mistyped or stale product URL is indexable\n' +
        '  as a real page titled "Product Not Found".',
    )
  }

  const collectionRes = await fetch(new URL('/shop/__no-such-collection__', siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
    redirect: 'manual',
  })
  if (collectionRes.status !== 404) {
    // Where it went is the whole diagnosis. A redirect here cannot come from this repo:
    // `dynamicParams = false` is set on the route, there is no middleware, vercel.json has
    // no rules, and the only next.config redirects are permanent (308) on /stones and
    // /crystals. So a 3xx means something in front of the app answered — and a redirect to
    // a Vercel SSO host (Deployment Protection), to a `www.` variant (a domain rule), and
    // to the app's own not-found are three different problems that a bare status code
    // renders identical. The first run to see this reported "307, expected 404" and left
    // a session guessing between all three.
    const location = collectionRes.headers.get('location')
    const redirected = collectionRes.status >= 300 && collectionRes.status < 400
    throw new Error(
      `An unknown collection returned ${collectionRes.status}, expected 404. Collections are\n` +
        '  a closed set, so `dynamicParams = false` should reject them before rendering.\n' +
        '  If the origin check above is also red, read that one first: this request uses\n' +
        '  `redirect: manual`, so a redirect in front of the app surfaces here as a 3xx and\n' +
        '  has nothing to do with `dynamicParams`.' +
        (redirected
          ? `\n  It redirected to: ${location ?? '(no Location header)'}\n` +
            '  Nothing in this repository can emit a redirect for /shop/*, so this came from in\n' +
            '  front of the app — Vercel Deployment Protection, a domain rule, or an alias that\n' +
            '  predates the commit adding `dynamicParams = false`. Run `pnpm diagnose:deployment`\n' +
            '  against this URL to find out which.'
          : ''),
    )
  }

  // The damaging inverse: a noindex that escaped onto a real product would deindex the
  // catalogue, and nothing else here would notice.
  const realRes = await fetch(new URL(`/products/${SHOPIFY_ONLY_HANDLES[0]}`, siteUrl), {
    headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
  })
  if (/<meta[^>]+name="robots"[^>]+noindex/i.test(await realRes.text())) {
    throw new Error(
      `A REAL product (${SHOPIFY_ONLY_HANDLES[0]}) is marked noindex. This deindexes the\n` +
        '  catalogue — far worse than the soft 404 the tag exists to contain.',
    )
  }

  return 'unknown product noindexed, unknown collection 404s, real product indexable'
}

/**
 * The manual revalidation endpoint is public and authenticated. Until 2026-08-12 nothing
 * called it, nothing tested it and no doc mentioned it, while its secret sat deployed —
 * an endpoint with no owner is exactly the shape that rots unnoticed.
 *
 * Checked without the secret on purpose: this asserts the door is locked, and needs no
 * credential to do so.
 */
async function revalidateEndpointRejectsAnonymous() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const res = await fetch(new URL('/api/revalidate', siteUrl), { method: 'POST' })

  if (res.status === 200) {
    throw new Error(
      'POST /api/revalidate returned 200 with NO secret. Anyone can purge the cache,\n' +
        '  which is a free way to force full regeneration of every page on demand.',
    )
  }
  if (res.status === 503) {
    throw new Error(
      'POST /api/revalidate returned 503 — SHOPIFY_REVALIDATION_SECRET is unset in this\n' +
        '  deployment, so manual cache purges are unavailable.',
    )
  }
  if (res.status !== 401) {
    throw new Error(`POST /api/revalidate returned ${res.status}, expected 401.`)
  }

  return 'rejects unauthenticated requests with 401'
}

/**
 * The Open Graph image renders within the budget a link crawler will wait.
 *
 * Timed on a **cache-busted** URL so this measures a real render rather than a CDN hit —
 * the whole question is what happens on a cold path, which is exactly what a crawler
 * unfurling a freshly-shared link encounters.
 */
async function openGraphRendersWithinBudget() {
  const siteUrl = required('PRODUCTION_SITE_URL')
  const handle = SHOPIFY_ONLY_HANDLES[0]
  const url = new URL(`/products/${handle}/opengraph-image`, siteUrl)
  url.searchParams.set('cachebust', String(Date.now()))

  const started = Date.now()
  const res = await fetch(url, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1' },
    cache: 'no-store',
  })
  const bytes = (await res.arrayBuffer()).byteLength
  const elapsed = Date.now() - started

  // Recorded on the result either way, so the trend is visible in the job summary before
  // it breaches rather than only at the moment it does.
  timings.ogColdMs = elapsed

  if (!res.ok) throw new Error(`OG image returned ${res.status} in ${elapsed}ms`)
  if (bytes < 1000) throw new Error(`OG image is only ${bytes} bytes — likely a render failure`)

  if (elapsed > OG_COLD_START_BUDGET_MS) {
    throw new Error(
      `OG image took ${elapsed}ms, over the ${OG_COLD_START_BUDGET_MS}ms budget.\n` +
        '  Link crawlers time out around 3-5s, and a timed-out unfurl renders NO card at\n' +
        '  all — worse than the wrong card that dropping the edge runtime fixed.\n' +
        '  See the budget note in src/app/products/[handle]/opengraph-image.tsx.',
    )
  }

  return `${elapsed}ms cold, ${(bytes / 1024).toFixed(0)}KB (budget ${OG_COLD_START_BUDGET_MS}ms)`
}

/**
 * Shopify is serving the API version this code targets.
 *
 * ## The check that would have caught seven months of drift
 *
 * A retired API version does not error. Shopify **falls forward** — the request is
 * answered by the oldest accessible stable version, HTTP 200, nothing in the body to
 * say so. This project pinned `2025-01` from launch and kept pinning it long after
 * Shopify stopped serving it; every check in this file passed throughout, because
 * every check asked about *data* and none asked which API produced it.
 *
 * The evidence was on every single response the whole time. `X-Shopify-API-Version`
 * names the version Shopify actually used. Nothing read it.
 *
 * Blocking, unlike the matching premise: a version still accessible but nearing
 * retirement is a decision worth revisiting (that is `apiVersionPremise`), while a
 * version already falling forward means the storefront is running against an API
 * nobody tested it against — which is breakage, whether or not it has surfaced yet.
 *
 * Both surfaces are checked. The Storefront API is what customers hit; the Admin API
 * is what this script's own conclusions rest on, and a fall-forward there would make
 * every other check in this file a report about a different API than it claims.
 */
async function shopifyServesThePinnedApiVersion() {
  const domain = resolveStoreDomain()

  /** @param {string} label @param {string} url @param {Record<string,string>} headers */
  async function servedVersion(label, url, headers) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      // The cheapest legal query on both APIs. The response body is irrelevant —
      // the header is the measurement, and it is present even on an error.
      body: JSON.stringify({ query: '{ shop { name } }' }),
    })

    // "Present even on an error" is true of an error the API *answered*, and false of a
    // request it refused. A 401 carries no `x-shopify-api-version`, so `compareServedApiVersion`
    // reads `null` and reports "the serving version is unknown, it cannot be assumed to be the
    // pinned one" — which is a sentence about Shopify, printed because of our own credential.
    // Run 33232085670 published exactly that. Rejection is its own outcome here too.
    if (res.status === 401 || res.status === 403) {
      return {
        label,
        rejected: true,
        matches: false,
        reason: `rejected the token (HTTP ${res.status}), so the served version could not be read`,
      }
    }

    return {
      label,
      rejected: false,
      ...compareServedApiVersion(res.headers.get('x-shopify-api-version')),
    }
  }

  const surfaces = [
    await servedVersion('Storefront', `https://${domain}/api/${API_VERSION}/graphql.json`, {
      'X-Shopify-Storefront-Access-Token': required('SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
    }),
    await servedVersion('Admin', `https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      'X-Shopify-Access-Token': required('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    }),
  ]

  // Drift on a surface that answered outranks a rejection on one that did not: it is a real
  // finding, and it is actionable now. A rejection alone leaves the question open, which is
  // what `unevaluable` means.
  const drifted = surfaces.filter((s) => !s.rejected && !s.matches)
  if (drifted.length > 0) {
    throw new Error(drifted.map((s) => `${s.label} API: ${s.reason}`).join('\n  '))
  }

  const rejected = surfaces.filter((s) => s.rejected)
  if (rejected.length > 0) {
    throw unevaluableError(
      rejected.map((s) => `${s.label} API ${s.reason}`).join('\n  ') +
        '\n  The surfaces that did answer were served the pinned version.',
    )
  }

  return `Both surfaces served ${API_VERSION}, as pinned`
}

/**
 * A product photographed in Shopify is actually shown on its page.
 *
 * ## The direction that will really fail
 *
 * The storefront had no image field at all until recently: `PRODUCT_FRAGMENT`
 * requested none, `HJProduct` had nowhere to put one, and every surface hardcoded
 * the illustration. A fully photographed store would have rendered zero photos.
 *
 * That is fixed, and the fix is invisible while the store has no media — which it
 * currently does not, on all 22 products. So the failure this guards is the one
 * that arrives *later*: somebody uploads a photo in Shopify Admin, the page keeps
 * drawing a line illustration, and nothing anywhere says so. "No photo yet" and
 * "photo present, pipeline broken" look identical from the outside, which is the
 * same indistinguishability that let the static fallback hide for months
 * (ADR 004).
 *
 * Passing while no product has media is correct, not a hole — there is genuinely
 * nothing to render. It says so explicitly rather than reporting a silent tick,
 * because a check whose reason for passing is invisible is one nobody can reason
 * about.
 */
async function photographedProductsShowTheirPhotograph() {
  const siteUrl = required('PRODUCTION_SITE_URL')

  const data = await adminGraphql(
    `query {
       products(first: 250) {
         edges { node { handle featuredMedia { preview { image { url } } } } }
       }
     }`,
  )

  const withPhoto = data.products.edges
    .map((e) => e.node)
    .filter((p) => p.featuredMedia?.preview?.image?.url)

  if (withPhoto.length === 0) {
    return (
      'No product in Shopify has media yet, so every page correctly renders the ' +
      'JewelrySVG illustration. This check starts asserting the moment a photo is uploaded.'
    )
  }

  // A sample, not all of them: each check is a full page load, and the pipeline is
  // one shared component — if it works for three products it works for all of them.
  // The failure this catches is systemic, never per-product.
  const sample = withPhoto.slice(0, 3)
  const missing = []

  for (const product of sample) {
    const res = await fetch(new URL(`/products/${product.handle}`, siteUrl), {
      headers: { 'User-Agent': 'healthy-jewellery-production-smoke' },
    })
    if (!res.ok) {
      missing.push(`${product.handle} (page returned ${res.status})`)
      continue
    }
    const html = await res.text()
    // next/image rewrites the src through /_next/image?url=<encoded>, so the CDN
    // host appears percent-encoded. Checking the decoded HTML covers both forms.
    if (!decodeURIComponent(html).includes('cdn.shopify.com')) {
      missing.push(product.handle)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.length} of ${sample.length} sampled products have a photo in Shopify ` +
        `but no cdn.shopify.com image on their page: ${missing.join(', ')}\n` +
        '  The page is falling back to the JewelrySVG illustration while real\n' +
        '  photography exists — silently, because a product with no photo looks the same.',
    )
  }

  return `${sample.length}/${sample.length} sampled photographed products render their image (${withPhoto.length} have media)`
}

/**
 * The catalogue shows photographs of the products, not illustrations of them.
 *
 * ## Why this is a check and not a premise
 *
 * `productPhotographyPremise` used to report this, and a premise never fails the run
 * (ADR 008). That was right while zero coverage was new information; it stopped being right
 * once the number had been sat at 0/22 for weeks with nothing acting on it. ADR 008 names
 * its own escalation path for exactly that: *"if premise-drift issues start accumulating
 * unread, the right response is to promote the specific premise to a failing check, not to
 * make all of them fail."* This is that promotion, so the premise is removed rather than
 * left to print a contradicting verdict beside it.
 *
 * ## Why it fails where `homepageStripsHaveEnoughProducts` only observes
 *
 * That one is also a catalogue-content threshold and is deliberately in the never-fails
 * tier, because a thin scroll strip is a merchandising choice and turning someone's
 * merchandising into a red build is how a signal becomes noise. This is a different kind of
 * fact. For a brand whose entire argument is implant-grade metal — weight, finish, how the
 * surface takes light — a schematic icon cannot make the case the storefront exists to
 * make. STATE.md already tracks it as `blocking`; this makes the tracking mean something.
 *
 * ## What it does not claim
 *
 * It cannot run until the Admin token in `production-smoke.yml`'s environment is fixed
 * (issue #24) — the workflow has died at preflight for 30 consecutive scheduled runs, so
 * `verify-production.mjs` has not executed in the observable window and the 0/22 on record
 * is hand-entered rather than measured. That is not a reason to write the check loosely: an
 * under-scoped token routes through `adminGraphql`, which throws an unevaluable error, so
 * this lands in "Could not be evaluated" and still exits non-zero. It cannot go quietly
 * green, per ADR 006.
 */
async function productPhotographyCoverage() {
  // `featuredImage`, matching what `collectPremises` counted — not the `featuredMedia`
  // that `photographedProductsShowTheirPhotograph` reads. Two numerators for the same
  // store would let this check and the one above it disagree about the same fact.
  const data = await adminGraphql(
    `query {
       products(first: 250) {
         edges { node { featuredImage { url } } }
       }
     }`,
  )

  const products = data.products.edges.map((e) => e.node)
  const photographed = products.filter((p) => p.featuredImage?.url).length

  const verdict = classifyPhotographyCoverage(photographed, products.length)
  if (!verdict.ok) throw new Error(verdict.detail)
  return verdict.detail
}

/**
 * Pure half of the coverage check, so both branches run in CI — the failing one is the
 * branch that has never been observed live, which is precisely the branch most likely to be
 * wrong the day it finally fires.
 *
 * @param {number} photographed products with a featuredImage
 * @param {number} total products in the store
 * @returns {{ ok: boolean, detail: string }}
 */
export function classifyPhotographyCoverage(photographed, total) {
  // An empty store is not zero coverage — it is nothing to cover, and reporting it as a
  // photography problem would send the reader to the wrong console. Same guard as
  // `everyProductPublishedToHeadless`.
  if (total === 0) {
    return {
      ok: false,
      detail:
        'The store has no products at all, so photography coverage says nothing. Fix the ' +
        'catalogue first — this check has no opinion until there is something to photograph.',
    }
  }

  if (photographed < MIN_PHOTOGRAPHED_PRODUCTS) {
    return {
      ok: false,
      detail:
        `${photographed}/${total} products have a photograph, below the floor of ` +
        `${MIN_PHOTOGRAPHED_PRODUCTS}, so every surface draws the JewelrySVG ` +
        'illustration instead.\n' +
        '  For an implant-grade-metal brand the physical object is the argument — weight,\n' +
        '  finish, how the surface takes light — and a line drawing cannot make it.\n' +
        '  Fix: upload a photo per product in Shopify Admin. There is no code step;\n' +
        '  <ProductImage> prefers the real photo the instant featuredImage is set.\n' +
        '  See STATE.md item 9 and docs/catalog-conventions.md.',
    }
  }

  return {
    ok: true,
    detail:
      `${photographed}/${total} products have a photograph` +
      (photographed < total
        ? ` — the other ${total - photographed} draw the illustration, which is correct until they are shot.`
        : ' — full coverage.'),
  }
}

/**
 * Every tag namespace the store uses is one the code reads.
 *
 * Tags are the only channel Shopify gives this project for "which metal is this"
 * and "which illustration", so the store's vocabulary and the code's have to
 * agree. They already disagreed once, expensively: `material:steel` matched
 * nothing, and all 22 products silently reported Grade 23 Titanium — on a brand
 * whose entire promise is knowing which metal touches your skin.
 *
 * That failure is invisible from the store's side. A merchant writes a tag,
 * Shopify accepts it, and nothing anywhere says the site does not read it. Five
 * products currently carry `collection:spectrum` — a tag that does nothing at
 * all, because collections come from real Shopify collection membership, not
 * from tags.
 *
 * Reported as an **opportunity**, not a failure: an unread tag is a
 * misunderstanding to resolve, not an outage. Failing on it would make a red
 * build out of someone tidying their Shopify Admin.
 */
/**
 * The policies Shopify's hosted checkout links, and this store must therefore have.
 *
 * Not an arbitrary list. The checkout footer renders whichever of these exist, and
 * this store ships to 29 countries — fourteen of them in the EU, where information
 * about the right of withdrawal has to be given before the order is placed. A
 * refund policy is not a nicety on that surface; it is the surface.
 */
export const REQUIRED_SHOP_POLICIES = [
  'PRIVACY_POLICY',
  'REFUND_POLICY',
  'TERMS_OF_SERVICE',
  'SHIPPING_POLICY',
]

/**
 * Unrendered Liquid left in a policy body.
 *
 * Shopify's policy templates ship with `{{ shop_name }}`, `{{ email }}`,
 * `{{ phone }}` and `{% if %}` blocks that the merchant is expected to replace or
 * let Shopify interpolate. Interpolation is the trap: `{{ shop_name }}` renders,
 * and on this store it renders as **"My Store 2"** — so a policy that exists,
 * looks complete, and passes any presence check will publish the placeholder store
 * name and the owner's personal Gmail to every customer who opens it.
 *
 * Presence alone would pass that. This is the half that catches it.
 */
const LIQUID = /\{\{[^}]*\}\}|\{%[^%]*%\}/

/**
 * Classify a store's policies. Pure, so it can be tested against the real
 * `shopPolicies` response rather than only ever observed saying "fine".
 *
 * @param {{ type: string, body?: string | null }[]} policies
 * @param {readonly string[]} [required]
 * @returns {{ ok: boolean, missing: string[], templated: string[], present: string[] }}
 */
export function classifyShopPolicies(policies, required = REQUIRED_SHOP_POLICIES) {
  const byType = new Map(
    policies.filter((p) => p && typeof p.type === 'string').map((p) => [p.type, p]),
  )

  const missing = required.filter((type) => {
    const policy = byType.get(type)
    // An empty body is an absent policy wearing a heading. Shopify will render the
    // link and the page, and the page will say nothing.
    return !policy || !(policy.body ?? '').trim()
  })

  const templated = required.filter((type) => {
    const policy = byType.get(type)
    return !!policy && LIQUID.test(policy.body ?? '')
  })

  return {
    ok: missing.length === 0 && templated.length === 0,
    missing,
    templated,
    present: [...byType.keys()],
  }
}

/** Tag namespaces `src/lib/shopify/tags.ts` parses. Anything else reaches no code path. */
export const READ_TAG_NAMESPACES = ['material', 'svg']

/** Bare tags `mapShopifyProduct` reads directly, for badges. */
export const READ_BARE_TAGS = ['bestseller', 'new', 'sale']

/**
 * Which tags in a catalogue reach no code. Pure, so it can be tested against tag
 * arrays captured from the real store rather than only observed saying "fine".
 *
 * @param {{ tags?: string[] }[]} products
 * @returns {Map<string, number>} unread tag → how many products carry it
 */
export function unreadTags(products) {
  const unread = new Map()
  for (const product of products) {
    for (const tag of product.tags ?? []) {
      const value = tag.toLowerCase().trim()
      if (!value) continue
      const namespace = value.includes(':') ? value.slice(0, value.indexOf(':')) : null

      if (namespace ? READ_TAG_NAMESPACES.includes(namespace) : READ_BARE_TAGS.includes(value)) {
        continue
      }
      unread.set(value, (unread.get(value) ?? 0) + 1)
    }
  }
  return unread
}

async function tagNamespacesAreAllRead() {
  const data = await adminGraphql(
    `query { products(first: 250) { edges { node { handle tags } } } }`,
  )

  const unread = unreadTags(data.products.edges.map((e) => e.node))
  if (unread.size === 0) return 'Every tag in the store maps to something the code reads.'

  const listed = [...unread.entries()].map(([tag, n]) => `${tag} (${n})`).join(', ')
  return (
    `${unread.size} tag(s) are read by nothing: ${listed}. ` +
    'Harmless, but a tag that looks meaningful and does nothing is how the ' +
    'material:steel mismatch survived. Either wire it up or remove it.'
  )
}

/**
 * The homepage strips have enough products to be strips.
 *
 * `GET_BESTSELLERS` and `GET_NEW_ARRIVALS` are `tag:bestseller` / `tag:new`
 * queries, so the size of each homepage row is a **merchandising** fact set in
 * Shopify Admin, not a code one. Exactly one product currently carries
 * `bestseller`, which makes "BESTSELLING" a horizontal-scroll strip containing a
 * single tile — not broken, just wrong-looking, and nothing on the site can
 * report it.
 *
 * Never a failure. A thin strip is a tagging decision, and turning someone's
 * merchandising into a red build is how a signal becomes noise.
 */
async function homepageStripsHaveEnoughProducts() {
  const MIN_TILES = 3

  const data = await adminGraphql(
    `query {
       bestsellers: products(first: 20, query: "tag:bestseller") { edges { node { handle } } }
       newArrivals: products(first: 20, query: "tag:new") { edges { node { handle } } }
     }`,
  )

  const strips = [
    { label: 'BESTSELLING', tag: 'bestseller', count: data.bestsellers.edges.length },
    { label: 'NEW ARRIVALS', tag: 'new', count: data.newArrivals.edges.length },
  ]

  const thin = strips.filter((s) => s.count < MIN_TILES)
  if (thin.length === 0) {
    return strips.map((s) => `${s.label}: ${s.count}`).join(', ')
  }

  return (
    thin
      .map(
        (s) =>
          `${s.label} has ${s.count} product(s) — a scroll strip with fewer than ${MIN_TILES} ` +
          `tiles reads as broken. Tag more products \`${s.tag}\` in Shopify Admin.`,
      )
      .join(' ') + ` (Full counts: ${strips.map((s) => `${s.label}=${s.count}`).join(', ')})`
  )
}

/**
 * The store presents itself as the brand, not as a Shopify placeholder.
 *
 * `shop.name` is the store's identity everywhere Shopify renders it for a
 * customer — most importantly the **hosted checkout**, which is the one page in
 * the purchase journey this codebase does not control. A customer who has spent
 * the whole session on *Healthy Jewellery* clicks Checkout and lands on a page
 * belonging to whatever this field says.
 *
 * It currently says **"My Store 2"**, the name Shopify assigns by default. That
 * is a one-field fix nothing in this repository could ever have noticed: the
 * storefront never reads `shop.name`, so no page renders it and no test could
 * see it. The gap is structural, which is exactly what this tier is for.
 *
 * Also checks the contact email, which is where a customer's reply to their order
 * confirmation goes.
 *
 * An observation rather than a failing check, deliberately: the smoke workflow
 * opens a GitHub issue when a check fails, and this would hold one open until a
 * human changed a setting. It is listed as a launch blocker in
 * docs/headless-launch-inventory.md, which is the right place for "you must do
 * this" as opposed to "the system is malfunctioning".
 */
async function storeIdentifiesItselfAsTheBrand() {
  const { shop } = await adminGraphql(`query { shop { name contactEmail } }`)

  // Shopify's default is "My Store", numbered when the account has several.
  const isPlaceholder = /^my store(\s+\d+)?$/i.test(shop.name.trim())
  const notes = []

  if (isPlaceholder) {
    notes.push(
      `shop.name is "${shop.name}" — Shopify's default placeholder, shown to customers ` +
        'at the hosted checkout. Set it in Settings → Store details.',
    )
  }

  // Not a rule about which provider is acceptable — plenty of real businesses run
  // on one. It is about a *personal* mailbox appearing on transactional mail from
  // a brand, which is the kind of detail that costs a first-time customer's trust.
  if (/@(gmail|yahoo|hotmail|outlook|icloud)\./i.test(shop.contactEmail ?? '')) {
    notes.push(
      `contactEmail is a personal mailbox (${shop.contactEmail}). Customers replying to ` +
        'their order confirmation reply to it; the site itself uses hello@ on the brand domain.',
    )
  }

  if (notes.length === 0) return `Store presents as "${shop.name}" <${shop.contactEmail}>.`
  return notes.join(' ')
}

/**
 * The policies Shopify's checkout links actually exist and actually say something.
 *
 * ## Why this is blocking rather than an observation
 *
 * The hosted checkout is the one page in the purchase journey this codebase does
 * not control, and it renders whichever of these policies exist. This store ships
 * to 29 countries, fourteen of them in the EU, where the customer has to be told
 * about the right of withdrawal *before* placing the order.
 *
 * Today the store has exactly one policy — Privacy — and it is Shopify's unedited
 * template. There is no refund policy, no terms of service, and no shipping
 * policy, while `/shipping` on the site states real terms (30 days, unworn,
 * prepaid label, refund in 5–7 business days). The site and the checkout disagree,
 * and the checkout is the one the customer reads.
 *
 * ## The placeholder half
 *
 * A policy can exist and still be wrong in a way presence cannot see. Shopify
 * interpolates `{{ shop_name }}` at render time, and on this store that renders
 * **"My Store 2"**; `{{ email }}` renders the owner's personal Gmail, as the
 * published data-controller contact. So "the policy exists" and "the policy is
 * publishable" are different questions, and only the second one matters.
 */
async function shopPoliciesAreCompleteAndEdited() {
  const { shop } = await adminGraphql(
    `query { shop { shopPolicies { type body } } }`,
  )

  const { ok, missing, templated, present } = classifyShopPolicies(shop.shopPolicies ?? [])
  if (ok) return `All ${REQUIRED_SHOP_POLICIES.length} required policies present and edited.`

  const problems = []
  if (missing.length > 0) {
    problems.push(
      `${missing.length} required policy/policies are MISSING or empty: ${missing.join(', ')}.\n` +
        '  Shopify links these from the hosted checkout. Drafts derived from the site\'s own\n' +
        '  pages are in docs/shopify-policies/ — paste them into Settings → Policies.',
    )
  }
  if (templated.length > 0) {
    problems.push(
      `${templated.length} policy/policies still contain unrendered Liquid: ${templated.join(', ')}.\n` +
        '  These are Shopify\'s stock templates. `{{ shop_name }}` will render as the store\n' +
        '  name — currently "My Store 2" — and `{{ email }}` as the store contact address.',
    )
  }

  throw new Error(`${problems.join('\n')}\n  Present: ${present.join(', ') || '(none)'}`)
}

// ── premises ────────────────────────────────────────────────────────────────

/**
 * Premises are not checks. A drifted premise means a *decision* is stale, not that the
 * storefront is broken — a Vietnamese locale appearing is an opportunity. They are
 * collected and reported separately, and never fail the run. See ADR 008.
 */
async function collectPremises() {
  const { shopLocales, collections, productsCount, ordersCount, orders, webhookSubscriptions } =
    await adminGraphql(
    `query {
       shopLocales { locale published }
       collections(first: 50) { edges { node { handle } } }
       productsCount { count }
       ordersCount { count }
       orders(first: 10) { edges { node { paymentGatewayNames } } }
       webhookSubscriptions(first: 25) { edges { node { topic } } }
     }`,
  )

  const withSpec = await adminGraphql(
    `query {
       products(first: 250) {
         edges {
           node {
             metafield(namespace: "custom", key: "spec") { value }
           }
         }
       }
     }`,
  )
  const specCount = withSpec.products.edges.filter((e) => e.node.metafield?.value?.trim()).length

  return [
    apiVersionPremise(),
    i18nPremise(shopLocales),
    collectionSetPremise(collections.edges.map((e) => e.node), KNOWN_COLLECTIONS),
    specMetafieldPremise(specCount, productsCount.count),
    paymentsPremise(
      ordersCount.count,
      orders.edges.flatMap((e) => e.node.paymentGatewayNames ?? []),
    ),
    // `webhookSubscriptions` returns only the *querying app's* own subscriptions,
    // so an empty list is not evidence of absence. The premise says so rather than
    // pretending the number means more than it does.
    webhookDeliveryPremise(ordersCount.count, webhookSubscriptions.edges.length),
  ]
}

/**
 * Hand the drifted premises to the workflow.
 *
 * Written to a file rather than parsed out of stdout: a notification step that scrapes log
 * text breaks the first time someone rewords a message, and this project has already been
 * bitten by two things agreeing only by coincidence.
 */
function writeDriftFile(drifted) {
  try {
    writeFileSync('premise-drift.json', JSON.stringify(drifted, null, 2))
  } catch {
    // Reporting is best-effort. A drift file that cannot be written must never change the
    // verdict of the checks above.
  }
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Production reality checks\n')

  // Before anything that fetches the site, because a redirect in front of the app makes
  // every status-code check below describe the redirect rather than the app. This one is
  // the cause; several of the others would otherwise be printed as independent symptoms —
  // including the identity check immediately below, which fetches /api/version.
  await check('PRODUCTION_SITE_URL is served directly, not via a redirect', siteUrlIsServedDirectly)

  // Then: establish *what* is being tested.
  //
  // Every check below describes a deployment, and none of them names it. The run on
  // 2026-08-13 reported eleven failures, and the session that read them spent its effort
  // deciding whether the deployment under test was even the merged code — a stale alias, a
  // cache-reused build and a genuinely broken storefront produce overlapping symptoms, and
  // nothing in the output separated them. `/api/version` answers it outright, and has
  // since PR #19; nothing asked it. See docs/adr/010.
  await check('The deployment identifies itself', deploymentIdentifiesItself)

  // Then the API version, because every Shopify check below reports on whatever API
  // Shopify decided to answer with. If that is not the pinned version, the rest of this
  // run describes a different API than the one the storefront was written against.
  await check('Shopify serves the pinned API version', shopifyServesThePinnedApiVersion)
  await check('Live site serves Shopify data, not the static fallback', liveSiteServesShopifyData)
  await check(
    'Every product is published to the headless publication',
    everyProductPublishedToHeadless,
  )
  await check('A real cart yields a real checkout URL', cartCreateReturnsCheckoutUrl)
  await check('Product metadata names the product, not "Not Found"', productMetadataNamesTheProduct)
  await check('The Open Graph image renders a real PNG', openGraphImageRenders)
  await check('Site search finds Shopify products', searchFindsShopifyProducts)
  await check('Checkout policies exist and are not stock templates', shopPoliciesAreCompleteAndEdited)
  await check(
    'A photographed product actually shows its photograph',
    photographedProductsShowTheirPhotograph,
  )
  await check('The catalogue has product photography at all', productPhotographyCoverage)
  await check('Rate limiting is distributed, not per-instance', rateLimitingIsDistributed)
  await check('A signed webhook actually revalidates the cached page', webhookRevalidatesTheCachedPage)
  await check('Unknown URLs cannot be indexed', unknownUrlsAreNotIndexable)
  await check('Manual revalidation endpoint is locked', revalidateEndpointRejectsAnonymous)
  await check('Open Graph image renders within the crawler budget', openGraphRendersWithinBudget)

  // Observations about the *store*, not the code. Neither of these can fail the run:
  // a tag nobody reads and a thin homepage strip are merchandising decisions made in
  // Shopify Admin, and turning someone tidying their catalogue into a red build is
  // exactly how the 24-minute E2E suite became noise nobody read. They are reported
  // because nothing else can see them — the site renders happily either way.
  const observations = []
  for (const [label, fn] of [
    ['Store identity', storeIdentifiesItselfAsTheBrand],
    ['Tag namespaces', tagNamespacesAreAllRead],
    ['Homepage strips', homepageStripsHaveEnoughProducts],
  ]) {
    try {
      observations.push(`${label}: ${await fn()}`)
    } catch (err) {
      observations.push(`${label}: could not be evaluated — ${err.message}`)
    }
  }
  if (observations.length > 0) {
    console.log('─'.repeat(70))
    console.log('Store observations (never failures)\n')
    for (const line of observations) console.log(`  · ${line}`)
    console.log('')
  }

  // Premises last, and separately. A drifted premise means a decision is stale, not that
  // the storefront is broken, so it is reported but never counted as a failure. See ADR 008.
  let premises = []
  try {
    premises = await collectPremises()
  } catch (err) {
    console.log(`· premises could not be evaluated: ${err.message}\n`)
  }

  if (premises.length > 0) {
    const { lines, summary, drifted } = formatPremises(premises)
    console.log('─'.repeat(70))
    console.log('Premises behind recorded decisions\n')
    for (const line of lines) console.log(`  ${line}`)
    console.log(`\n  ${summary}`)
    if (drifted.length > 0) {
      console.log('\n  Drift is not failure — these are decisions worth revisiting, and are')
      console.log('  reported to a separate premise-drift issue rather than turning this red.')
    }
    console.log('')
    writeDriftFile(drifted)
  }

  if (timings.ogColdMs !== undefined) {
    console.log(`Open Graph cold render: ${timings.ogColdMs}ms (budget ${OG_COLD_START_BUDGET_MS}ms)\n`)
  }

  const notPassed = results.filter((r) => !r.ok)
  const failed = notPassed.filter((r) => !r.unevaluable)
  const unevaluable = notPassed.filter((r) => r.unevaluable)

  console.log('─'.repeat(70))
  console.log(`${results.length - notPassed.length}/${results.length} checks passed`)

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.map((f) => f.name).join(', ')}`)
  }
  // Listed apart from the failures because the reader's next action is different: a
  // failure is a thing to fix in the store or the deployment, an unevaluable check is a
  // permission to grant before this run can say anything about it at all.
  if (unevaluable.length > 0) {
    console.log(`\nCould not be evaluated: ${unevaluable.map((f) => f.name).join(', ')}`)
  }

  // Both states exit non-zero. A check that could not run has not passed, and a run that
  // goes green while a third of it never executed is the failure mode this whole tier
  // exists to prevent. See docs/adr/006-controls-must-fail-loudly.md.
  if (notPassed.length > 0) process.exit(1)
}

// Only run when executed directly. Without this, importing the module to test
// the handle discriminators would fire live requests at the real store and then
// call process.exit in the middle of the test run.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
