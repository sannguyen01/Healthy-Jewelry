/**
 * The Shopify API version this project targets, and when it stops being served.
 *
 * ## Why this is a file and not a string
 *
 * The version literal lived in two places — `src/config/shopify-public.ts` and
 * `scripts/verify-production.mjs` — with nothing joining them. That is the same
 * two-sides-of-a-contract shape as the cache tags (`src/lib/shopify/cacheTags.ts`),
 * and it failed the same way: both said `2025-01` long after `2025-01` stopped
 * existing, and agreeing with each other is not the same as being right.
 *
 * `src/tests/unit/api-version-contract.test.ts` asserts this constant and the
 * TypeScript one are the same string, in both directions.
 *
 * ## Why a retired version does not error
 *
 * Shopify **falls forward**. A request naming an inaccessible version is served
 * by the *oldest accessible stable version* instead, with a 200 and no warning
 * anywhere in the body. The only signal is the `X-Shopify-API-Version` response
 * header, which names the version Shopify actually used — and nothing in this
 * project read it.
 *
 * So a version can retire, every request can start being answered by a
 * different API with different behaviour, and the storefront keeps returning
 * 200s. That is exactly the failure shape STATE.md keeps recording: a fallback
 * indistinguishable from the real thing.
 *
 * Schedule: https://shopify.dev/docs/api/usage/versioning
 * Releases quarterly; each stable version is accessible for ~12 months.
 */

/**
 * The version every Storefront, Admin, and webhook call must name.
 *
 * `2026-07` — released 2026-07-01, accessible until 2027-07-16 15:00 UTC.
 *
 * Was `2025-01`, which retired around 2026-01 and left this project running on
 * silent fall-forward for roughly seven months. See ADR 009.
 */
export const SHOPIFY_API_VERSION = '2026-07'

/**
 * When Shopify stops serving {@link SHOPIFY_API_VERSION}, from its own published
 * schedule. After this instant every request falls forward to whatever the
 * oldest accessible stable version is *then* — an unannounced, undeployed,
 * untested version bump to a live storefront.
 */
export const API_VERSION_ACCESSIBLE_UNTIL = '2027-07-16T15:00:00Z'

/**
 * How long before retirement the migration becomes worth surfacing.
 *
 * Ninety days is one full Shopify release cycle: long enough that the next
 * stable version already exists and can be migrated to deliberately, short
 * enough that the warning is not permanent background noise. A warning that is
 * always on is a warning nobody reads — the 24-minute E2E suite taught this
 * project that once already.
 */
export const MIGRATION_LEAD_DAYS = 90

const MS_PER_DAY = 86_400_000

/**
 * Where the pinned version stands against its own retirement date.
 *
 * Pure, so the *expired* and *expiring* branches are testable. Those are the
 * branches that never run locally, and this project has been bitten before by
 * exactly that: the completed-order branch of the cart could not be exercised
 * in development, and was the half that broke.
 *
 * @param {Date} [now]
 * @returns {{ version: string, accessibleUntil: string, daysRemaining: number,
 *             state: 'ok' | 'expiring' | 'expired' }}
 */
export function apiVersionStatus(now = new Date()) {
  const deadline = new Date(API_VERSION_ACCESSIBLE_UNTIL)
  // Ceil, not floor: with 12 hours left you have "1 day", not "0 days". Rounding
  // a live deadline down reads as already-missed.
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_DAY)

  const state =
    daysRemaining <= 0 ? 'expired' : daysRemaining <= MIGRATION_LEAD_DAYS ? 'expiring' : 'ok'

  return {
    version: SHOPIFY_API_VERSION,
    accessibleUntil: API_VERSION_ACCESSIBLE_UNTIL,
    daysRemaining,
    state,
  }
}

/**
 * Compare the version Shopify says it served against the one we asked for.
 *
 * `served` comes from the `X-Shopify-API-Version` response header. A header that
 * is absent is reported as `unknown` rather than as agreement — "we could not
 * tell" and "it matched" are different answers, and collapsing them is how a
 * check goes green while proving nothing.
 *
 * @param {string | null | undefined} served
 * @param {string} [pinned]
 * @returns {{ matches: boolean, served: string | null, pinned: string, reason: string }}
 */
export function compareServedApiVersion(served, pinned = SHOPIFY_API_VERSION) {
  const value = served?.trim() || null

  if (value === null) {
    return {
      matches: false,
      served: null,
      pinned,
      reason:
        'Shopify returned no X-Shopify-API-Version header, so the version actually ' +
        'serving these requests is unknown. It cannot be assumed to be the pinned one.',
    }
  }

  if (value === pinned) {
    return { matches: true, served: value, pinned, reason: `Shopify served ${value}, as pinned.` }
  }

  return {
    matches: false,
    served: value,
    pinned,
    reason:
      `Shopify served API version ${value}, not the pinned ${pinned}. This is a ` +
      'fall-forward: the pinned version is no longer accessible, so every request is ' +
      `being answered by a different API than the one this code was written and tested ` +
      `against. Update SHOPIFY_API_VERSION in scripts/lib/api-version.mjs and ` +
      'src/config/shopify-public.ts, then audit the queries against that version.',
  }
}
