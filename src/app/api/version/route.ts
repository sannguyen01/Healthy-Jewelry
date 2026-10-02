import { NextResponse } from 'next/server'
import { BUILD_INFO, FINGERPRINTED_KEYS, fingerprint } from '@/config/build-info'

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
 * correct deployment. Several STATE.md entries warn about this trap, and none of
 * them made it *observable*.
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
 * ## What it no longer reports, and why that is a removal rather than a gap
 *
 * It carried a `shopify` block — whether a store domain and a Storefront token
 * were both set, and the pinned vendor API version — plus `build.storeDomainInlined`
 * and `runtime.storeDomainSet`. Each answered "can this deployment sell anything",
 * which was the first question anyone debugging a fallback catalogue needed. The
 * answer is now "no, by construction" on every deployment
 * (`COMMERCE-ELIMINATION-CONTRACT.md` §2), and a field whose value cannot vary is
 * not a measurement. Every script that reads this payload —
 * `scripts/lib/canonical-domain.mjs` is the one that outlives the decommission —
 * reads `build.commit`, the two `vercelEnv`s and the two fingerprints, all of
 * which remain.
 *
 * ## What it deliberately does not return
 *
 * No secret values, no tokens, no URLs beyond the deployment's own host — only a
 * commit SHA, environment names and two short fingerprints. Same rule as
 * `/api/health`: say whether the mechanism is right, never how it is wired. The
 * fingerprint inputs are public by construction (`NEXT_PUBLIC_*` is shipped to
 * browsers in plain text), so this is not protecting a secret — it is keeping the
 * endpoint's surface to exactly what the question needs.
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

export async function GET(): Promise<NextResponse> {
  // The key set comes from `build-info.ts`, not a second list typed here. Two copies of
  // "which keys are fingerprinted" is how one side gains a key the other lacks — and
  // then every deployment reports stale, or none can.
  const runtimeValues = Object.fromEntries(
    FINGERPRINTED_KEYS.map((key) => [key, readRuntimeEnv(key)])
  )
  const runtimeFingerprint = fingerprint(runtimeValues)
  const bundleIsStale = runtimeFingerprint !== BUILD_INFO.configFingerprint

  return NextResponse.json(
    {
      build: BUILD_INFO,
      runtime: {
        vercelEnv: readRuntimeEnv('VERCEL_ENV') || null,
        configFingerprint: runtimeFingerprint,
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
