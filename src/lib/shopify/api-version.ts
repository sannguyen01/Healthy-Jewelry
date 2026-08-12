/**
 * Notices when Shopify serves a different API version than the one we asked for.
 *
 * ## The failure this exists to make visible
 *
 * Shopify does not reject a request naming a retired API version. It **falls
 * forward**: the request is answered by the oldest *accessible* stable version,
 * with a 200 and nothing in the body to say so. The only evidence is the
 * `X-Shopify-API-Version` response header, present on every response, which
 * names the version Shopify actually used.
 *
 * This project pinned `2025-01` and kept pinning it for roughly seven months
 * after Shopify stopped serving it. Every product fetch, every cart mutation and
 * every webhook in that window was answered by an API nobody had tested against,
 * and no test, log line, or check anywhere could have noticed — the header was
 * read by nothing.
 *
 * So it is read now, and it is loud. `console.error` rather than `warn`, for the
 * same reason `reportFallback` in `./index.ts` uses it: in Vercel's function logs
 * that is the difference between a line nobody filters for and one that appears
 * in the error view.
 *
 * ## Why it does not throw
 *
 * A fall-forward is usually *survivable* — Shopify's compatibility window is
 * nine months of overlap, so the served version is typically a near neighbour
 * that answers the same queries. Throwing would take a working storefront down
 * over a configuration lag, which is the same trade `env-check.ts` already
 * resolved in favour of warning. The blocking assertion belongs in
 * `scripts/verify-production.mjs`, where it can fail a check without failing a
 * customer's page.
 */

import { shopifyPublicConfig } from '@/config/shopify-public'

/** The version this deployment asks Shopify for. */
export const PINNED_API_VERSION = shopifyPublicConfig.apiVersion

/** Shopify's own header, naming the version it actually used. */
export const API_VERSION_HEADER = 'x-shopify-api-version'

export interface ApiVersionDrift {
  /** What Shopify said it served; `null` when the header was absent. */
  served: string | null
  /** What we asked for. */
  pinned: string
}

/**
 * Every drift already logged, so a fall-forward reports once rather than once
 * per request.
 *
 * A storefront page fans out to several Shopify calls, and a serverless instance
 * handles many pages. Without this, a single retired version would emit an error
 * line on every fetch for the life of the instance — which trains everyone to
 * filter out the one message that matters. Keyed by `served|pinned` so a *second,
 * different* drift is still reported.
 */
const reported = new Set<string>()

/** Test seam. Nothing in the app calls this. */
export function resetApiVersionDriftLog(): void {
  reported.clear()
}

/**
 * Read the served version off a Shopify response and report a mismatch.
 *
 * Returns the drift when there is one and `null` when the versions agree, so a
 * caller that wants to act on it can, and the common case stays a single
 * falsy check.
 *
 * An absent header counts as drift. "We could not tell" and "it matched" are
 * different answers, and a check that collapses them goes green while proving
 * nothing — the exact property that made `environment: production-readonly`
 * worthless (ADR 006).
 */
export function reportApiVersionDrift(
  headers: Headers | undefined,
  caller: string
): ApiVersionDrift | null {
  const pinned = PINNED_API_VERSION

  // A real `Response` always carries headers, so this can only be a stub. It is
  // guarded anyway, and silently: this function sits directly on the path of
  // every product fetch and every cart mutation, and a *diagnostic* that can
  // throw is strictly worse than no diagnostic — it would turn "Shopify changed
  // version" into "the storefront is down". Nothing to report is not a finding.
  if (!headers || typeof headers.get !== 'function') return null

  const served = headers.get(API_VERSION_HEADER)?.trim() || null

  if (served === pinned) return null

  const key = `${served ?? '(absent)'}|${pinned}`
  if (reported.has(key)) return { served, pinned }
  reported.add(key)

  console.error('[shopify] API VERSION MISMATCH — Shopify is not serving the pinned version', {
    caller,
    pinned,
    served,
    consequence:
      served === null
        ? 'No X-Shopify-API-Version header on the response, so the serving version is unknown.'
        : `Requests are being answered by ${served}. Shopify falls forward silently when a ` +
          `pinned version is retired, so ${pinned} is no longer accessible.`,
    action:
      'Update SHOPIFY_API_VERSION in scripts/lib/api-version.mjs and apiVersion in ' +
      'src/config/shopify-public.ts, audit the queries against the new version, and deploy.',
  })

  return { served, pinned }
}
