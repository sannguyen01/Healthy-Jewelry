/**
 * Detectors for the premises this project's decisions rest on.
 *
 * ## Why this exists
 *
 * Every other guardrail here asserts **"the code still does X."** None asserted **"the
 * premise behind X still holds."** That gap is invisible while the premises hold, which is
 * exactly how it survived six rounds of audit: a decision made on good evidence quietly
 * becomes a decision made on stale evidence, and nothing goes red.
 *
 * Five instances were found at once — the English-only decision, the payments blocker, the
 * Open Graph runtime tradeoff, the empty spec metafield, and a collection-set assumption
 * introduced by the very change that fixed the soft-404. See ADR 008.
 *
 * ## Pure on purpose
 *
 * Every evaluator takes already-fetched data and returns a verdict. The caller does the
 * network. That makes the **drifted** branch testable, and the drifted branch is the one
 * that never runs locally — so it is the one most likely to be wrong the day it finally
 * fires. This project has paid for that before: the completed-order branch of the cart
 * could not be exercised in development, and was the half that broke.
 *
 * ## Drift is not failure
 *
 * A `vi` locale appearing is an *opportunity*, not an outage. These report separately from
 * the pass/fail checks and never turn the run red. Failing on opportunity is how the
 * 24-minute E2E suite became noise nobody read.
 */

/** Shopify creates this automatically; it is not one of ours and never will be. */
const SHOPIFY_BUILTIN_COLLECTIONS = new Set(['frontpage'])

/**
 * @typedef {object} Premise
 * @property {string} id          Stable identifier, matching the decision it guards.
 * @property {string} decision    Where the decision is written down.
 * @property {boolean} holds      True when reality still matches the assumption.
 * @property {string} detail      One line, actionable, naming what changed.
 * @property {'blocking' | 'opportunity'} kind
 *   `blocking` — drift means something is broken right now.
 *   `opportunity` — drift means a deferred decision is now worth revisiting.
 */

/**
 * ADR 005 chose an English-only storefront because the store has no Vietnamese content to
 * surface. The ADR names its own prerequisite — publish a `vi` locale and translate the
 * products *first* — and nothing was watching for it to be met.
 *
 * @param {{ locale: string, published?: boolean }[]} shopLocales
 * @returns {Premise}
 */
export function i18nPremise(shopLocales) {
  const nonEnglish = shopLocales.filter((l) => !l.locale.startsWith('en'))

  return {
    id: 'ADR-005-english-only',
    decision: 'docs/adr/005-english-only-storefront.md',
    kind: 'opportunity',
    holds: nonEnglish.length === 0,
    detail:
      nonEnglish.length === 0
        ? 'Store is still English-only; the decision stands on current evidence.'
        : `Store now has ${nonEnglish.map((l) => l.locale).join(', ')}. ADR 005's stated ` +
          'prerequisite is met — translated content exists to surface, so the ' +
          'English-only decision is due for revisit.',
  }
}

/**
 * `/shop/[collection]` sets `dynamicParams = false`, so **only** the handles in
 * `hjCollections` are served — anything else is a hard 404 before rendering.
 *
 * That is correct only while Shopify's collections are a subset of ours. Add a sixth
 * collection in Shopify Admin and it 404s: worse than the soft-404 that setting was
 * introduced to fix, and silent. The risk was written in a code comment and given no
 * detector, which is the omission this whole module exists to correct.
 *
 * @param {{ handle: string }[]} shopifyCollections
 * @param {{ handle: string }[]} knownCollections
 * @returns {Premise}
 */
export function collectionSetPremise(shopifyCollections, knownCollections) {
  const known = new Set(knownCollections.map((c) => c.handle))
  const missing = shopifyCollections
    .map((c) => c.handle)
    .filter((handle) => !SHOPIFY_BUILTIN_COLLECTIONS.has(handle) && !known.has(handle))

  return {
    id: 'COLLECTION-SET-DRIFT',
    decision: "src/app/shop/[collection]/page.tsx — dynamicParams = false",
    // Blocking, not opportunity: these URLs are 404ing for customers right now.
    kind: 'blocking',
    holds: missing.length === 0,
    detail:
      missing.length === 0
        ? `All ${shopifyCollections.length} Shopify collections are known to hjCollections.`
        : `${missing.length} Shopify collection(s) are NOT in hjCollections and therefore ` +
          `HARD-404 on the site: ${missing.join(', ')}. Add them to src/lib/data/hj-data.ts ` +
          'and deploy, or remove them in Shopify.',
  }
}

/**
 * `custom.spec` is deliberately unpopulated — specs are physical measurements and inventing
 * them would put fabricated claims on a store. The detail page hides the line when empty,
 * so nothing surfaces the moment real measurements arrive.
 *
 * @param {number} productsWithSpec
 * @param {number} totalProducts
 * @returns {Premise}
 */
export function specMetafieldPremise(productsWithSpec, totalProducts) {
  return {
    id: 'SHOPIFY-SPEC-METAFIELD',
    decision: 'STATE.md — SHOPIFY-SPEC-METAFIELD',
    kind: 'opportunity',
    holds: productsWithSpec === 0,
    detail:
      productsWithSpec === 0
        ? 'No product has custom.spec set; the detail-page line stays hidden as intended.'
        : `${productsWithSpec}/${totalProducts} products now have custom.spec set. The spec ` +
          'line is rendering — the item can close.',
  }
}

/**
 * The payments blocker, and the one premise that **expires by itself**.
 *
 * Admin GraphQL exposes no field for "which providers are enabled" — `PaymentSettings`
 * carries only `supportedDigitalWallets` — so this cannot be verified while the store has
 * no orders. But `Order.paymentGatewayNames` *is* readable, so the moment a single order
 * exists the premise "not machine-verifiable" stops being true and the check upgrades
 * itself from a reminder into a real assertion.
 *
 * Human once, then automatic. That is the honest alternative to a deadline nobody agreed
 * to.
 *
 * @param {number} ordersCount
 * @param {string[]} paymentGatewayNames Gateways seen on recent orders; empty until one exists.
 * @returns {Premise}
 */
export function paymentsPremise(ordersCount, paymentGatewayNames) {
  if (ordersCount === 0) {
    return {
      id: 'SHOPIFY-PAYMENTS',
      decision: 'docs/go-live-runbook.md step 1',
      kind: 'blocking',
      // Holds in the sense that the premise is still accurate: it genuinely cannot be
      // checked yet. The blocker itself is tracked in STATE.md, not manufactured here.
      holds: true,
      detail:
        'No orders yet, so provider state remains unverifiable by API — PaymentSettings ' +
        'exposes only supportedDigitalWallets. This check upgrades itself automatically ' +
        'once the first order exists.',
    }
  }

  const gateways = paymentGatewayNames.filter(Boolean)
  return {
    id: 'SHOPIFY-PAYMENTS',
    decision: 'docs/go-live-runbook.md step 1',
    kind: 'blocking',
    holds: gateways.length > 0,
    detail:
      gateways.length > 0
        ? `Verifiable now: ${ordersCount} order(s) processed via ${[...new Set(gateways)].join(', ')}. ` +
          'The human-only premise has expired — this is asserted automatically from here.'
        : `${ordersCount} order(s) exist but none names a payment gateway. Either they were ` +
          'created without payment, or the provider was removed after they were placed.',
  }
}

/**
 * Format for the console and the job summary.
 *
 * @param {Premise[]} premises
 */
export function formatPremises(premises) {
  const drifted = premises.filter((p) => !p.holds)
  const lines = premises.map((p) => `${p.holds ? '·' : '!'} ${p.id} — ${p.detail}`)

  return {
    drifted,
    lines,
    summary:
      drifted.length === 0
        ? `All ${premises.length} premises hold.`
        : `${drifted.length} of ${premises.length} premises have drifted: ` +
          drifted.map((p) => p.id).join(', '),
  }
}
