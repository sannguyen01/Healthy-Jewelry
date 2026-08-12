// Healthy Jewelry — what a served page can say about itself
//
// ## The question this exists to answer
//
// "Is the page I am looking at built from the commit I think it is, in the
// environment I think it is, with the environment variables I think it has?"
//
// Every one of those has been unanswerable for the life of this project, and
// each has cost a session. The recurring three:
//
//   1. **A cached build reused stale `NEXT_PUBLIC_*` values.** Those variables
//      are inlined into the JavaScript at build time, so setting one in Vercel
//      and redeploying changes nothing if the build cache is reused. Warned
//      about in `env-check.ts`, the runbook and STATE.md — and not detectable
//      from outside, because a stale bundle and a fresh one are byte-identical
//      in every visible respect.
//   2. **Per-environment variables.** Vercel scopes them, so Production can be
//      configured while a Preview alias serving the same commit is not.
//   3. **An orphaned preview alias.** A branch alias keeps serving whatever last
//      built on that branch, forever, including after the branch is deleted. It
//      renders, the cart works, and it is testing a snapshot of an app that no
//      longer exists.
//
// All three are the same missing capability: the page cannot identify itself.
//
// ## How the stale-cache case is actually detected
//
// This module is reachable from the client graph, so `process.env.NEXT_PUBLIC_*`
// here is **inlined at build time by the same mechanism, into the same chunks**,
// as everywhere else in the app. A fingerprint computed here is therefore stale
// in exactly the cases the page is stale.
//
// `/api/version` computes the same fingerprint a second time, at request time,
// from the live environment (see `readRuntimeEnv` there, and why it has to dodge
// Next's inliner to do it). **The two disagreeing is the detector**: same commit,
// two different fingerprints, means the served bundle carries values the running
// environment has since changed. Nothing else in a deployment reveals that.
//
// No secret is exposed. Every input is public by construction — `NEXT_PUBLIC_*`
// values are shipped to browsers in plain text, and the commit SHA is in a public
// repository. The fingerprint is a short comparable token, chosen so the endpoint
// returns one stable string instead of a bag of values to eyeball; it is not a
// confidentiality measure and should not be described as one.

/**
 * The two inlined values whose staleness actually breaks the storefront.
 *
 * `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` empty means the cart never syncs and
 * checkout produces no URL. `NEXT_PUBLIC_SITE_URL` wrong means canonical URLs,
 * Open Graph images and structured data all point somewhere else.
 *
 * Written as full literals, never `process.env[name]` in a loop: Next's inliner
 * is a **textual** substitution on `process.env.NEXT_PUBLIC_FOO`, so a computed
 * key is silently *not* inlined and would read `undefined` in the browser —
 * producing a fingerprint that looks fine and measures nothing.
 */
const INLINED_PUBLIC_CONFIG: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ?? '',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? '',
}

/**
 * FNV-1a, 32-bit, as eight hex characters.
 *
 * Deliberately not a cryptographic hash: this runs in the browser bundle, where
 * `node:crypto` is unavailable and `crypto.subtle` is async — and nothing here
 * needs to resist an attacker, because the inputs are already public. What it
 * needs to be is *deterministic, dependency-free, and short enough to compare by
 * eye in a terminal*, which is exactly what FNV-1a is for.
 */
export function fingerprint(values: Readonly<Record<string, string>>): string {
  // Sorted, so two builds with the same values can never differ by key order.
  const canonical = Object.keys(values)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join('\n')

  let hash = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i)
    // The FNV prime, via shifts: `hash * 16777619` overflows a float64's exact
    // integer range and quietly loses precision.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Where a deployment came from, as far as it can tell from inside itself. */
export interface BuildInfo {
  /** Full commit SHA, or `null` when built outside Vercel (local, CI). */
  commit: string | null
  /** First 7 characters of {@link commit}, for humans. */
  shortCommit: string | null
  /** `production` | `preview` | `development`, or `null` off Vercel. */
  vercelEnv: string | null
  /** The generated deployment host, which is *not* the alias you typed. */
  vercelUrl: string | null
  /** Branch this deployment was built from, when Vercel exposes it. */
  branch: string | null
  /** ISO instant the build ran. Set in `next.config.ts`. */
  builtAt: string | null
  /** Fingerprint of the `NEXT_PUBLIC_*` values inlined into this bundle. */
  configFingerprint: string
  /** Whether the store domain survived into the bundle at all. */
  storeDomainInlined: boolean
}

/**
 * Read once, at module scope, so every consumer reports the same thing.
 *
 * `HJ_BUILD_TIME` is minted in `next.config.ts` and exposed through Next's `env`
 * option. Reading `new Date()` here instead would record *render* time — which
 * for a dynamic route is the moment of the request, and answers a completely
 * different question than "when was this built".
 */
export const BUILD_INFO: BuildInfo = {
  commit: process.env.NEXT_PUBLIC_HJ_COMMIT || null,
  shortCommit: process.env.NEXT_PUBLIC_HJ_COMMIT?.slice(0, 7) || null,
  vercelEnv: process.env.NEXT_PUBLIC_HJ_VERCEL_ENV || null,
  vercelUrl: process.env.NEXT_PUBLIC_HJ_VERCEL_URL || null,
  branch: process.env.NEXT_PUBLIC_HJ_BRANCH || null,
  builtAt: process.env.NEXT_PUBLIC_HJ_BUILD_TIME || null,
  configFingerprint: fingerprint(INLINED_PUBLIC_CONFIG),
  storeDomainInlined: INLINED_PUBLIC_CONFIG.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN.length > 0,
}

/**
 * The single-line form stamped into every page's `<head>`.
 *
 * A `<meta>` tag rather than only an endpoint, because "view source" works from
 * any browser on any device with no tooling — including the phone that runbook
 * step 5 requires, where running a script is not an option. Compact and
 * delimited so it can be read at a glance or split by a script.
 */
export function buildStamp(info: BuildInfo = BUILD_INFO): string {
  return [
    `commit=${info.shortCommit ?? 'unknown'}`,
    `env=${info.vercelEnv ?? 'local'}`,
    `built=${info.builtAt ?? 'unknown'}`,
    `config=${info.configFingerprint}`,
  ].join(' ')
}
