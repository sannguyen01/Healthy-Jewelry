/**
 * What a deployment actually is, decided from evidence it reported about itself.
 *
 * ## Why this is a separate, pure module
 *
 * Every verdict here fires on a deployment that is *wrong in a specific way* —
 * stale bundle, frozen alias, unconfigured preview. None of those states exists
 * on a healthy deployment, so none of them can be observed by running the script
 * against a working site. They are, by construction, branches that never run
 * when you are looking.
 *
 * This project has already shipped that exact bug: the completed-order branch of
 * the cart could not be exercised in development and was the half that broke
 * (ADR 002). So the decisions are pure functions over already-fetched evidence,
 * the network lives in `scripts/diagnose-deployment.mjs`, and every branch below
 * is exercised in CI by `src/tests/unit/deployment-verdict.test.ts`.
 *
 * ## The three questions
 *
 * Three failures have recurred across this project's entire history, each
 * costing a session, each invisible from outside a deployment:
 *
 *   1. A redeploy reused the build cache, so `NEXT_PUBLIC_*` values inlined into
 *      the JavaScript are the *old* ones. Setting the variable did nothing.
 *   2. The URL being tested is a Preview deployment, and Vercel scopes
 *      environment variables per environment, so Production being configured
 *      says nothing about it.
 *   3. The URL is a branch-preview alias frozen at whatever last built on a
 *      branch that has since merged and closed. It renders, the cart works, and
 *      it is a snapshot of an app that no longer exists.
 *
 * Each returns a verdict naming the *next action*, not just the diagnosis. A
 * diagnostic that stops at "something is wrong" leaves the reader exactly where
 * they started.
 */

/**
 * @typedef {object} Verdict
 * @property {string} id
 * @property {'ok' | 'warn' | 'fail'} level
 *   `fail` — this deployment is not what you think it is; the run exits non-zero.
 *   `warn` — worth knowing, does not by itself invalidate what you are looking at.
 * @property {string} title
 * @property {string} detail
 * @property {string} [action] What to do about it. Omitted only when `ok`.
 */

/**
 * The `/api/version` payload, as far as this module cares.
 *
 * @typedef {object} VersionPayload
 * @property {{ commit: string | null, shortCommit: string | null, vercelEnv: string | null,
 *              vercelUrl: string | null, branch: string | null, builtAt: string | null,
 *              configFingerprint: string, storeDomainInlined: boolean }} build
 * @property {{ vercelEnv: string | null, configFingerprint: string, storeDomainSet: boolean }} runtime
 * @property {{ configured: boolean, pinnedApiVersion: string }} shopify
 * @property {boolean} bundleIsStale
 */

/**
 * Segment 3 — a cached build reused stale `NEXT_PUBLIC_*` values.
 *
 * The bundle's inlined fingerprint against the same fingerprint recomputed from
 * the live environment on the same request. Nothing else in a deployment
 * distinguishes these two states: the HTML, the behaviour, and the commit are
 * all identical either way.
 *
 * @param {VersionPayload} payload
 * @returns {Verdict}
 */
export function staleBundleVerdict(payload) {
  const { build, runtime } = payload

  if (build.configFingerprint === runtime.configFingerprint) {
    return {
      id: 'stale-bundle',
      level: 'ok',
      title: 'Inlined config matches the environment',
      detail: `Bundle and runtime both fingerprint to ${build.configFingerprint}.`,
    }
  }

  return {
    id: 'stale-bundle',
    level: 'fail',
    title: 'This build carries stale inlined NEXT_PUBLIC_* values',
    detail:
      `The bundle was built with config fingerprinting to ${build.configFingerprint}, but ` +
      `this environment now holds ${runtime.configFingerprint}. NEXT_PUBLIC_* values are ` +
      'inlined at build time, so a redeploy that reused the build cache kept the old ones. ' +
      'The page will behave exactly as it did before the variables were changed.',
    action:
      'Redeploy with "Use existing Build Cache" UNCHECKED (Vercel → Deployments → ⋯ → ' +
      'Redeploy). Setting the variable again and redeploying normally will not fix this.',
  }
}

/**
 * Segment 4 — which Vercel environment is actually answering.
 *
 * Vercel scopes environment variables per environment, so "it works in
 * Production" is not evidence about a Preview URL. Reported for every URL, not
 * only the surprising ones: the failure here is *assuming* which environment you
 * are on, and an answer only given when something looks wrong does not correct
 * an assumption.
 *
 * @param {VersionPayload} payload
 * @param {{ expectProduction?: boolean }} [options]
 * @returns {Verdict}
 */
export function environmentVerdict(payload, options = {}) {
  const env = payload.runtime.vercelEnv ?? payload.build.vercelEnv

  if (env === null) {
    return {
      id: 'environment',
      level: 'warn',
      title: 'Not a Vercel deployment',
      detail:
        'No VERCEL_ENV. This is a local server or another host, so nothing below says ' +
        'anything about the Vercel deployment.',
      action: 'Point this at the real deployment URL if that is what you meant to test.',
    }
  }

  if (env === 'production') {
    return {
      id: 'environment',
      level: 'ok',
      title: 'Production deployment',
      detail: 'VERCEL_ENV=production — these are the Production environment variables.',
    }
  }

  return {
    id: 'environment',
    // Not a failure by itself unless Production was the point: testing a preview
    // deliberately is normal, and crying wolf over it is how a check gets ignored.
    level: options.expectProduction ? 'fail' : 'warn',
    title: `${env} deployment, not Production`,
    detail:
      `VERCEL_ENV=${env}. Vercel scopes environment variables per environment, so this ` +
      'deployment can be missing variables that Production has — and vice versa. ' +
      'Anything you conclude here applies to this environment only.',
    action:
      'Verify against the production domain, or set the same variables for ' +
      `${env} in Vercel → Settings → Environment Variables.`,
  }
}

/**
 * Segment 5 — an orphaned preview alias that will never update again.
 *
 * A dead end that looks alive: the page renders, the cart works, and checkout
 * fails with entirely correct error copy — for a commit that predates the fix
 * you are trying to verify.
 *
 * Two independent signals, and **both are required**. A commit mismatch alone is
 * routine (a deploy in flight, a branch under test); a build older than the
 * merge alone is routine (nothing has been pushed since). Together they mean
 * this URL is serving something the default branch has moved past and will not
 * be rebuilt.
 *
 * @param {VersionPayload} payload
 * @param {{ headCommit: string | null, headCommittedAt: string | null }} local
 *   The default branch's tip, as known locally. `null` when it could not be read
 *   — in which case this reports that it could not decide, rather than deciding.
 * @returns {Verdict}
 */
export function freshnessVerdict(payload, local) {
  const served = payload.build.commit
  const { headCommit, headCommittedAt } = local

  if (!served) {
    return {
      id: 'freshness',
      level: 'warn',
      title: 'Deployment does not report a commit',
      detail:
        'No commit SHA in the build stamp. Either this predates the build stamp, or it ' +
        'was not built by Vercel.',
      action: 'Trigger a fresh deployment so the stamp is present.',
    }
  }

  if (!headCommit) {
    return {
      id: 'freshness',
      level: 'warn',
      title: `Serving ${served.slice(0, 7)}; cannot compare`,
      detail: 'The local default branch could not be read, so freshness is undecidable here.',
      action: 'Run `git fetch origin` and try again.',
    }
  }

  if (served === headCommit) {
    return {
      id: 'freshness',
      level: 'ok',
      title: `Serving the tip of the default branch (${served.slice(0, 7)})`,
      detail: `Built ${payload.build.builtAt ?? 'at an unknown time'}.`,
    }
  }

  const builtAt = payload.build.builtAt ? Date.parse(payload.build.builtAt) : NaN
  const headAt = headCommittedAt ? Date.parse(headCommittedAt) : NaN
  const predatesHead = Number.isFinite(builtAt) && Number.isFinite(headAt) && builtAt < headAt

  if (predatesHead) {
    return {
      id: 'freshness',
      level: 'fail',
      title: 'Frozen alias — this URL will never serve your changes',
      detail:
        `Serving ${served.slice(0, 7)}, built ${payload.build.builtAt}, while the default ` +
        `branch is at ${headCommit.slice(0, 7)} committed ${headCommittedAt}. This build ` +
        'predates the branch tip and has not been replaced, which is what a branch-preview ' +
        'alias looks like after its branch merged and closed: it renders, it works, and it ' +
        'is a snapshot of an app that no longer exists.',
      action:
        'Test against the production domain or the canonical project alias — never a ' +
        'hashed preview alias — when checking whether a merge has gone live.',
    }
  }

  return {
    id: 'freshness',
    level: 'warn',
    title: `Serving ${served.slice(0, 7)}, not the default branch tip`,
    detail:
      `The default branch is at ${headCommit.slice(0, 7)}. This build is newer than, or ` +
      'concurrent with, that commit — consistent with a deploy in flight or a branch ' +
      'preview under test, rather than a frozen alias.',
    action: 'Re-check in a minute if a deployment is still building.',
  }
}

/**
 * Whether this deployment can talk to Shopify at all.
 *
 * The direct answer to "why is the page showing Dome Ring". Both halves are
 * reported separately because they fail for different reasons and are fixed in
 * different places: the public domain is inlined at build time, while the token
 * is read at runtime.
 *
 * @param {VersionPayload} payload
 * @returns {Verdict}
 */
export function shopifyConfigVerdict(payload) {
  if (payload.shopify.configured && payload.build.storeDomainInlined) {
    return {
      id: 'shopify-config',
      level: 'ok',
      title: 'Shopify is configured on this deployment',
      detail:
        `Store domain inlined into the bundle, Storefront token present at runtime, ` +
        `API version ${payload.shopify.pinnedApiVersion}.`,
    }
  }

  const missing = []
  if (!payload.build.storeDomainInlined) missing.push('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN (bundle)')
  if (!payload.runtime.storeDomainSet) missing.push('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN (runtime)')
  if (!payload.shopify.configured) missing.push('SHOPIFY_STOREFRONT_ACCESS_TOKEN')

  return {
    id: 'shopify-config',
    level: 'fail',
    title: 'Shopify is NOT configured on this deployment',
    detail:
      `Missing: ${[...new Set(missing)].join(', ')}. Every fetcher falls back to the static ` +
      'catalogue in src/lib/data/hj-data.ts, whose variant IDs are placeholders Shopify ' +
      'rejects — so the site renders perfectly and checkout cannot start.',
    action:
      'Set the missing variables in Vercel for THIS environment, then redeploy with the ' +
      'build cache disabled (NEXT_PUBLIC_* is inlined at build time).',
  }
}

/**
 * Is the served page reading Shopify, or the bundled fallback catalogue?
 *
 * The one check here that looks at what a customer actually receives. Uses the
 * same discriminator as `verify-production.mjs`: the two catalogues are nearly
 * disjoint, so a handle from one is proof of the other's absence.
 *
 * Absence of a fallback handle is deliberately not treated as success on its own
 * — an empty page has no fallback handles either. Positive proof is required.
 *
 * @param {string} html
 * @param {{ fallbackOnly: readonly string[], shopifyOnly: readonly string[] }} handles
 * @returns {Verdict}
 */
export function catalogueSourceVerdict(html, handles) {
  const leaked = handles.fallbackOnly.filter((h) => html.includes(h))
  const found = handles.shopifyOnly.filter((h) => html.includes(h))

  if (leaked.length > 0) {
    return {
      id: 'catalogue-source',
      level: 'fail',
      title: 'The page is serving the static fallback catalogue',
      detail:
        `Found handles that exist only in src/lib/data/hj-data.ts: ${leaked.join(', ')}. ` +
        'These products have never existed in Shopify, so nothing on this page can be bought.',
      action:
        'Check the Shopify verdict above. If configuration is fine, confirm every product ' +
        'is published to the headless publication (`pnpm verify:production`).',
    }
  }

  if (found.length === 0) {
    return {
      id: 'catalogue-source',
      level: 'fail',
      title: 'No Shopify products found on the page',
      detail:
        'Neither fallback-only nor Shopify-only handles appeared. The absence of fallback ' +
        'handles is not proof of a successful fetch — an empty catalogue looks identical.',
      action: 'Load /shop by hand and see what it is actually rendering.',
    }
  }

  return {
    id: 'catalogue-source',
    level: 'ok',
    title: 'The page is serving live Shopify data',
    detail: `Found ${found.length} Shopify-only handle(s): ${found.join(', ')}.`,
  }
}

/**
 * Reduce every verdict to one exit code.
 *
 * @param {Verdict[]} verdicts
 * @returns {{ exitCode: 0 | 1, failures: Verdict[], warnings: Verdict[], summary: string }}
 */
export function summarise(verdicts) {
  const failures = verdicts.filter((v) => v.level === 'fail')
  const warnings = verdicts.filter((v) => v.level === 'warn')

  const summary =
    failures.length > 0
      ? `${failures.length} problem(s): ${failures.map((v) => v.id).join(', ')}`
      : warnings.length > 0
        ? `No problems; ${warnings.length} thing(s) worth knowing.`
        : 'This deployment is what you think it is.'

  return { exitCode: failures.length > 0 ? 1 : 0, failures, warnings, summary }
}
