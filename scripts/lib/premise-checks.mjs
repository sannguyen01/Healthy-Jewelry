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

import { SHOPIFY_API_VERSION, apiVersionStatus } from './api-version.mjs'

/**
 * Shopify creates this automatically; it is not one of ours and never will be.
 *
 * **This exemption is itself an assumption, and it was wrong once.** Exempting `frontpage`
 * is correct for the question `collectionSetPremise` asks — *has the collection set
 * drifted* — because a built-in collection appearing is not drift. It is not correct as a
 * general statement that `frontpage` is harmless: `mapShopifyProduct` used to read a
 * product's first collection unvalidated, so a product sitting in `frontpage` was mapped
 * *into* it and rendered a breadcrumb linking to a hard 404. The one detector that ever
 * looked at `frontpage` had concluded it did not matter.
 *
 * `parseCollection` in `src/lib/shopify/tags.ts` now skips built-ins on the way in, so the
 * exemption here and the parser there agree by construction rather than by luck.
 */
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
 * `productPhotographyPremise` lived here until 2026-08-25 and was promoted to a failing
 * check — `productPhotographyCoverage` in `scripts/verify-production.mjs`.
 *
 * ADR 008 names that path itself: *"if premise-drift issues start accumulating unread, the
 * right response is to promote the specific premise to a failing check, not to make all of
 * them fail."* Zero coverage had been the reported state for weeks with nothing acting on
 * it, which is the condition that clause describes.
 *
 * It is removed rather than kept alongside, because its polarity was the inverse of the
 * check's: `holds: photoCount === 0` treated zero as the premise *holding*, so the two
 * would have printed `✗ coverage is zero` and `✓ premise holds` about the same number in
 * the same run output.
 */


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
 * The pinned Shopify API version is still accessible.
 *
 * The one premise in this module with a **published expiry date**, which makes it the
 * clearest case for the whole idea. Shopify's schedule states exactly when
 * {@link SHOPIFY_API_VERSION} stops being served, and on that date every request silently
 * falls forward to a different API. Nothing breaks visibly; the version just quietly stops
 * being the one in the code.
 *
 * That already happened once here, undetected for roughly seven months. See ADR 009.
 *
 * `opportunity`, not `blocking`, and deliberately so: while the version is still accessible
 * nothing is wrong, and there is a scheduled window in which to migrate calmly. The moment
 * it stops being accessible is not this premise's job — `served version === pinned version`
 * is a hard check in `verify-production.mjs`, because by then it is breakage rather than
 * a decision worth revisiting.
 *
 * @param {Date} [now]
 * @returns {Premise}
 */
export function apiVersionPremise(now = new Date()) {
  const { version, accessibleUntil, daysRemaining, state } = apiVersionStatus(now)
  const deadline = accessibleUntil.slice(0, 10)

  const detail = {
    ok: `Shopify API ${version} is accessible until ${deadline} (${daysRemaining} days). No action.`,
    expiring:
      `Shopify API ${version} stops being served on ${deadline} — ${daysRemaining} days away. ` +
      'After that every request falls forward to the oldest accessible version, silently. ' +
      'Migrate deliberately now: bump SHOPIFY_API_VERSION in scripts/lib/api-version.mjs and ' +
      'apiVersion in src/config/shopify-public.ts, then audit the queries.',
    expired:
      `Shopify API ${version} stopped being served on ${deadline}, ${Math.abs(daysRemaining)} ` +
      'days ago. Every request is now being answered by a different API version than the one ' +
      'this code targets. This is the exact condition ADR 009 exists to prevent recurring.',
  }[state]

  return {
    id: 'SHOPIFY-API-VERSION',
    decision: 'docs/adr/009-api-version-must-be-asserted-not-declared.md',
    kind: 'opportunity',
    holds: state === 'ok',
    detail,
  }
}

/**
 * Shopify is actually *sending* webhooks — which nothing here can currently prove.
 *
 * ## The false confidence this replaces
 *
 * `verify-webhook-secret.mjs` reports "SECRET CORRECT" and the runbook reads as
 * though that means webhooks work. It does not. That check POSTs a request this
 * project signed itself and confirms the **route accepts it**. It says nothing
 * about whether Shopify has a webhook subscription pointing at the site at all.
 *
 * And the obvious way to check — `webhookSubscriptions` on the Admin API — cannot
 * help: it returns only the subscriptions owned by the *querying app*. Webhooks
 * created in Settings → Notifications are invisible to it by design, so an empty
 * list is indistinguishable from a correctly configured store. Confirmed against
 * the live store: `[]`, with no way to tell which case it is.
 *
 * So the Shopify → Vercel direction can be entirely green while Shopify sends
 * nothing. That is not a check that needs fixing; it is a **gap that needs
 * naming**, which is what ADR 008 is for.
 *
 * ## Why it expires by itself
 *
 * Like `paymentsPremise`. The premise is "delivery is unverifiable", and it stops
 * being true the moment a real order exists: an order means Shopify had something
 * to deliver, so the question becomes answerable by looking at whether anything
 * arrived. Human once, then automatic.
 *
 * @param {number} ordersCount
 * @param {number} appOwnedWebhooks Subscriptions visible to the querying app.
 * @returns {Premise}
 */
export function webhookDeliveryPremise(ordersCount, appOwnedWebhooks) {
  if (ordersCount === 0) {
    return {
      id: 'SHOPIFY-WEBHOOK-DELIVERY',
      decision: 'docs/go-live-runbook.md step 4',
      kind: 'blocking',
      // Holds in the sense the premise is accurate: delivery genuinely cannot be
      // verified yet. The blocker itself lives in the launch inventory.
      holds: true,
      detail:
        'No orders yet, so webhook DELIVERY is unproven. `verify:webhook` confirms the ' +
        'route accepts a correctly-signed request — it does not confirm Shopify sends ' +
        'one. Admin-UI webhooks are invisible to webhookSubscriptions (it returns only ' +
        'the querying app\'s own), so an empty list proves nothing either way. This ' +
        'upgrades itself into a real assertion once the first order exists.',
    }
  }

  if (appOwnedWebhooks > 0) {
    return {
      id: 'SHOPIFY-WEBHOOK-DELIVERY',
      decision: 'docs/go-live-runbook.md step 4',
      kind: 'blocking',
      holds: true,
      detail:
        `${appOwnedWebhooks} app-owned webhook subscription(s) are visible and ${ordersCount} ` +
        'order(s) exist, so delivery is now directly checkable rather than inferred.',
    }
  }

  return {
    id: 'SHOPIFY-WEBHOOK-DELIVERY',
    decision: 'docs/go-live-runbook.md step 4',
    kind: 'blocking',
    holds: false,
    detail:
      `${ordersCount} order(s) exist, so the "unverifiable" premise has expired — there ` +
      'was something to deliver. No app-owned subscription is visible, which means the ' +
      'webhooks are either configured in Settings → Notifications (fine, but still ' +
      'invisible here) or not configured at all. Check Shopify Admin → Settings → ' +
      'Notifications → Webhooks, and confirm a recent delivery succeeded.',
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
