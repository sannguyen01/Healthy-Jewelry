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

const API_VERSION = '2025-01'

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
  const domain = required('SHOPIFY_STORE_DOMAIN')
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
  const domain = required('SHOPIFY_STORE_DOMAIN')
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

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Production reality checks\n')

  await check('Live site serves Shopify data, not the static fallback', liveSiteServesShopifyData)
  await check(
    'Every product is published to the headless publication',
    everyProductPublishedToHeadless,
  )
  await check('A real cart yields a real checkout URL', cartCreateReturnsCheckoutUrl)

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
