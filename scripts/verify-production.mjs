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
  formatPremises,
} from './lib/premise-checks.mjs'
import { SHOPIFY_API_VERSION, compareServedApiVersion } from './lib/api-version.mjs'

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
 * Imported, never re-declared. This literal used to be spelled out here *and* in
 * `src/config/shopify-public.ts`, and both said `2025-01` for months after Shopify
 * stopped serving it — two copies agreeing with each other is not the same as either
 * being right. See ADR 009 and `src/tests/unit/api-version-contract.test.ts`.
 */
const API_VERSION = SHOPIFY_API_VERSION

/** The publication the Storefront token reads from. Found by name, not by a
 *  hardcoded gid, so recreating the channel does not silently pass. */
const HEADLESS_PUBLICATION_NAME = 'Healthy Jewellery Store'

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

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
    console.log(`✓ ${name}\n  ${detail}\n`)
  } catch (err) {
    results.push({ name, ok: false, detail: err.message })
    console.log(`✗ ${name}\n  ${err.message}\n`)
  }
}

function required(varName) {
  const value = process.env[varName]
  if (!value) throw new Error(`${varName} is not set`)
  return value
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
  const json = await res.json()
  if (json.errors) throw new Error(`Admin API: ${JSON.stringify(json.errors)}`)
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
  const json = await res.json()
  if (json.errors) throw new Error(`Storefront API: ${JSON.stringify(json.errors)}`)
  return json.data
}

// ── checks ──────────────────────────────────────────────────────────────────

/**
 * The outside-in check. Everything else here talks to Shopify directly; this
 * one asks what a customer's browser actually receives, which is the only place
 * the fallback bug was ever visible.
 */
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
        `  Most likely cause: products are not published to the "${HEADLESS_PUBLICATION_NAME}"\n` +
        `  publication, so the Storefront token sees an empty catalogue.`,
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
    throw new Error(
      `An unknown collection returned ${collectionRes.status}, expected 404. Collections are\n` +
        '  a closed set, so `dynamicParams = false` should reject them before rendering.',
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
    return { label, ...compareServedApiVersion(res.headers.get('x-shopify-api-version')) }
  }

  const surfaces = [
    await servedVersion('Storefront', `https://${domain}/api/${API_VERSION}/graphql.json`, {
      'X-Shopify-Storefront-Access-Token': required('SHOPIFY_STOREFRONT_ACCESS_TOKEN'),
    }),
    await servedVersion('Admin', `https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      'X-Shopify-Access-Token': required('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    }),
  ]

  const drifted = surfaces.filter((s) => !s.matches)
  if (drifted.length > 0) {
    throw new Error(drifted.map((s) => `${s.label} API: ${s.reason}`).join('\n  '))
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

// ── premises ────────────────────────────────────────────────────────────────

/**
 * Premises are not checks. A drifted premise means a *decision* is stale, not that the
 * storefront is broken — a Vietnamese locale appearing is an opportunity. They are
 * collected and reported separately, and never fail the run. See ADR 008.
 */
async function collectPremises() {
  const { shopLocales, collections, productsCount, ordersCount, orders } = await adminGraphql(
    `query {
       shopLocales { locale published }
       collections(first: 50) { edges { node { handle } } }
       productsCount { count }
       ordersCount { count }
       orders(first: 10) { edges { node { paymentGatewayNames } } }
     }`,
  )

  const withSpec = await adminGraphql(
    `query {
       products(first: 250) {
         edges { node { metafield(namespace: "custom", key: "spec") { value } } }
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

  // First, because every check below reports on whatever API Shopify decided to answer
  // with. If that is not the pinned version, the rest of this run describes a different
  // API than the one the storefront was written against.
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
  await check(
    'A photographed product actually shows its photograph',
    photographedProductsShowTheirPhotograph,
  )
  await check('Rate limiting is distributed, not per-instance', rateLimitingIsDistributed)
  await check('A signed webhook actually revalidates the cached page', webhookRevalidatesTheCachedPage)
  await check('Unknown URLs cannot be indexed', unknownUrlsAreNotIndexable)
  await check('Manual revalidation endpoint is locked', revalidateEndpointRejectsAnonymous)
  await check('Open Graph image renders within the crawler budget', openGraphRendersWithinBudget)

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

  const failed = results.filter((r) => !r.ok)
  console.log('─'.repeat(70))
  console.log(`${results.length - failed.length}/${results.length} checks passed`)

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.map((f) => f.name).join(', ')}`)
    process.exit(1)
  }
}

// Only run when executed directly. Without this, importing the module to test
// the handle discriminators would fire live requests at the real store and then
// call process.exit in the middle of the test run.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
