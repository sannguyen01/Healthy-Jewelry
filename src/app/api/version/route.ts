import { NextResponse } from 'next/server'
import { BUILD_INFO, fingerprint } from '@/config/build-info'
import { shopifyConfig } from '@/config/shopify'
import { PINNED_API_VERSION } from '@/lib/shopify/api-version'

/**
 * What this deployment is, so nobody has to guess again.
 *
 * ## Why an endpoint and not just a meta tag
 *
 * The `<meta name="hj-build">` stamp in `layout.tsx` answers "which commit and
 * environment" from any browser with no tooling. This answers the harder
 * question the stamp structurally cannot: **whether the values baked into the
 * bundle still match the values the environment actually holds.**
 *
 * `NEXT_PUBLIC_*` variables are inlined into JavaScript at build time. Change one
 * in Vercel and redeploy, and if the build cache is reused the served bundle
 * keeps the old value — no error, no warning, byte-identical behaviour to a
 * correct deployment. `docs/go-live-runbook.md` and several STATE.md entries all
 * warn about this trap, and none of them made it *observable*.
 *
 * So it is measured twice:
 *
 *   - `build.configFingerprint` comes from `@/config/build-info`, a module in the
 *     client graph, so its `process.env.NEXT_PUBLIC_*` reads were inlined at build
 *     time into the same chunks as the rest of the app.
 *   - `runtime.configFingerprint` is computed here, on this request, from the
 *     live environment.
 *
 * Equal means the bundle matches its environment. **Different means the build
 * cache served stale inlined values**, and the fix is a redeploy with "Use
 * existing Build Cache" unchecked. That comparison is the entire point of this
 * route.
 *
 * ## What it deliberately does not return
 *
 * No secret values, no tokens, no URLs beyond the deployment's own host — only
 * booleans, a commit SHA, and two short fingerprints. Same rule as `/api/health`:
 * say whether the mechanism is right, never how it is wired. The fingerprint
 * inputs are public by construction (`NEXT_PUBLIC_*` is shipped to browsers in
 * plain text), so this is not protecting a secret — it is keeping the endpoint's
 * surface to exactly what the question needs.
 */

// Never prerendered. A build-time answer would describe the build machine and
// then be cached as fact — which for a route whose whole job is distinguishing
// build time from runtime would be self-defeating.
export const dynamic = 'force-dynamic'

/**
 * Read an environment variable **at runtime**, defeating Next's build-time inliner.
 *
 * Next substitutes `process.env.NEXT_PUBLIC_FOO` textually during the build, in
 * server code as well as client code. Writing the name literally here would bake
 * in the build-time value and make `runtime.configFingerprint` a second copy of
 * `build.configFingerprint` — always equal, never able to detect anything.
 *
 * Indexing with a variable is not a stylistic choice and must not be "tidied up":
 * it is the only thing making the two measurements independent. The whole route
 * silently stops working if this becomes a literal lookup.
 */
function readRuntimeEnv(name: string): string {
  const env = process.env as Record<string, string | undefined>
  return env[name] ?? ''
}

const FINGERPRINTED_KEYS = ['NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'NEXT_PUBLIC_SITE_URL'] as const

export async function GET(): Promise<NextResponse> {
  const runtimeValues = Object.fromEntries(
    FINGERPRINTED_KEYS.map((key) => [key, readRuntimeEnv(key)])
  )
  const runtimeFingerprint = fingerprint(runtimeValues)
  const bundleIsStale = runtimeFingerprint !== BUILD_INFO.configFingerprint

  // The gate every product fetcher is behind. Reported as a boolean because
  // "is checkout possible at all on this deployment" is the first thing anyone
  // debugging a fallback catalogue needs, and it is currently only knowable by
  // inference from what the page rendered.
  const shopifyConfigured = !!(shopifyConfig.storeDomain && shopifyConfig.storefrontAccessToken)

  return NextResponse.json(
    {
      build: BUILD_INFO,
      runtime: {
        vercelEnv: readRuntimeEnv('VERCEL_ENV') || null,
        configFingerprint: runtimeFingerprint,
        storeDomainSet: runtimeValues.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN.length > 0,
      },
      shopify: {
        configured: shopifyConfigured,
        pinnedApiVersion: PINNED_API_VERSION,
      },
      // Pre-computed rather than left for the caller to derive, so a human
      // reading raw JSON reaches the same verdict as the script does.
      bundleIsStale,
      hint: bundleIsStale
        ? 'The NEXT_PUBLIC_* values inlined into this bundle differ from the ones this ' +
          'environment now holds. A build reused the cache and kept the old values. ' +
          'Redeploy with "Use existing Build Cache" UNCHECKED.'
        : undefined,
    },
    {
      // Always 200. Unlike /api/health this route reports rather than judges —
      // a stale bundle is a fact about the deployment, and a monitor pointed at
      // this URL should not page anyone for it before a human has read it.
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
