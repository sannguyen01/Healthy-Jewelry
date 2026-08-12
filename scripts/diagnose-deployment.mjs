#!/usr/bin/env node
/**
 * Answers "is this deployment what I think it is" for any URL, in one command.
 *
 * ## Why this exists
 *
 * Three failures have recurred across this project's entire history, cost a
 * session each, and are all invisible from outside a deployment:
 *
 *   1. **A cached build reused stale `NEXT_PUBLIC_*` values.** Those are inlined
 *      into JavaScript at build time; setting one in Vercel and redeploying does
 *      nothing if the build cache is reused. The stale bundle and the correct one
 *      behave identically.
 *   2. **Per-environment variables.** Vercel scopes them, so a Preview alias can
 *      be unconfigured while Production is fine — and the alias renders happily.
 *   3. **An orphaned preview alias.** It keeps serving whatever last built on a
 *      branch, forever, including after that branch merged and was deleted.
 *
 * Every previous diagnosis of these went: read the code, reason about what
 * *should* be deployed, and guess. This asks the deployment instead. It is the
 * consumer of the build stamp added in `src/config/build-info.ts` and the
 * comparison exposed by `/api/version`.
 *
 * ## Usage
 *
 *   pnpm diagnose:deployment https://healthyjewellery.com
 *   pnpm diagnose:deployment https://healthy-jewellery.vercel.app --expect-production
 *
 * Exits non-zero when the deployment is not what you think it is, so it can gate
 * a step in a script. All decisions live in `scripts/lib/deployment-verdict.mjs`
 * and are unit-tested; this file is only I/O and formatting.
 *
 * Dependency-free, like every script here: Node 22's global fetch, and git via
 * child_process. No install step, so it cannot be broken by a dependency change
 * the merge gate has not seen.
 */

import { execFileSync } from 'node:child_process'
import {
  staleBundleVerdict,
  environmentVerdict,
  freshnessVerdict,
  shopifyConfigVerdict,
  catalogueSourceVerdict,
  summarise,
} from './lib/deployment-verdict.mjs'
import { FALLBACK_ONLY_HANDLES, SHOPIFY_ONLY_HANDLES } from './verify-production.mjs'

const USER_AGENT = 'healthy-jewellery-deployment-diagnostic'
const TIMEOUT_MS = 20_000

/** ANSI, but only when someone is watching. Piped output stays greppable. */
const colour = process.stdout.isTTY
  ? { ok: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' }
  : { ok: '', warn: '', fail: '', dim: '', off: '' }

const MARK = { ok: '✓', warn: '·', fail: '✗' }

function usage(message) {
  console.error(`${message}\n`)
  console.error('Usage: pnpm diagnose:deployment <url> [--expect-production]\n')
  console.error('  <url>                 The deployment to interrogate.')
  console.error('  --expect-production   Treat a non-Production environment as a failure.')
  process.exit(2)
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`)
  return res.json()
}

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`)
  return res.text()
}

/**
 * The default branch's tip, for the frozen-alias comparison.
 *
 * `origin/main` rather than the local `main`, which is routinely stale in a
 * fresh clone or a worktree — and a stale local ref would manufacture exactly
 * the "frozen alias" verdict this is meant to detect. Returns nulls rather than
 * throwing when git cannot answer; `freshnessVerdict` then reports that it could
 * not decide, which is honest, instead of deciding on bad data.
 */
function readDefaultBranchTip() {
  try {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
    const head = git('rev-parse', 'origin/main')
    const committedAt = git('show', '-s', '--format=%cI', head)
    return { headCommit: head, headCommittedAt: committedAt }
  } catch {
    return { headCommit: null, headCommittedAt: null }
  }
}

/**
 * Is the store domain physically present in the JavaScript the browser downloads?
 *
 * Independent of `/api/version`'s fingerprint comparison, and deliberately so.
 * The fingerprint proves the *bundle and the environment disagree*; this proves
 * whether the value survived into the bundle **at all**. A deployment built with
 * the variable entirely absent has a self-consistent fingerprint — bundle and
 * runtime can agree that it is empty — so the fingerprint check alone would pass
 * it. Two measurements, two different lies caught.
 */
async function storeDomainIsInBundle(baseUrl, domain) {
  if (!domain) return { checked: false, found: false, scripts: 0 }

  const html = await getText(baseUrl)
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
  const chunkUrls = srcs
    .filter((src) => src.includes('/_next/'))
    .map((src) => new URL(src, baseUrl).href)

  for (const url of chunkUrls) {
    try {
      if ((await getText(url)).includes(domain)) {
        return { checked: true, found: true, scripts: chunkUrls.length }
      }
    } catch {
      // One unreachable chunk must not be reported as "the domain is missing".
      // Absence of proof, and all that.
    }
  }
  return { checked: true, found: false, scripts: chunkUrls.length }
}

function print(verdict) {
  const c = colour[verdict.level]
  console.log(`${c}${MARK[verdict.level]} ${verdict.title}${colour.off}`)
  console.log(`  ${colour.dim}${verdict.detail}${colour.off}`)
  if (verdict.action) console.log(`  → ${verdict.action}`)
  console.log('')
}

async function main() {
  const args = process.argv.slice(2)
  const expectProduction = args.includes('--expect-production')
  const target = args.find((a) => !a.startsWith('--'))

  if (!target) usage('No URL given.')

  let baseUrl
  try {
    baseUrl = new URL(target).origin
  } catch {
    usage(`Not a URL: ${target}`)
  }

  console.log(`Interrogating ${baseUrl}\n`)

  let payload
  try {
    payload = await getJson(new URL('/api/version', baseUrl))
  } catch (err) {
    console.error(`${colour.fail}✗ /api/version did not answer${colour.off}`)
    console.error(`  ${err.message}\n`)
    console.error('  Either this deployment predates the build stamp — in which case it is')
    console.error('  definitively NOT serving current code — or the URL is wrong.\n')
    console.error('  → Deploy the current default branch, then re-run.')
    process.exit(1)
  }

  const verdicts = [
    environmentVerdict(payload, { expectProduction }),
    freshnessVerdict(payload, readDefaultBranchTip()),
    staleBundleVerdict(payload),
    shopifyConfigVerdict(payload),
  ]

  // Two page-level probes. Failures here are reported, never fatal to the run:
  // one unreachable page must not cost you the four verdicts already computed.
  try {
    const shopHtml = await getText(new URL('/shop', baseUrl))
    verdicts.push(
      catalogueSourceVerdict(shopHtml, {
        fallbackOnly: FALLBACK_ONLY_HANDLES,
        shopifyOnly: SHOPIFY_ONLY_HANDLES,
      })
    )
  } catch (err) {
    verdicts.push({
      id: 'catalogue-source',
      level: 'warn',
      title: 'Could not read /shop',
      detail: err.message,
      action: 'Load it by hand.',
    })
  }

  try {
    const bundle = await storeDomainIsInBundle(baseUrl, process.env.SHOPIFY_STORE_DOMAIN)
    if (!bundle.checked) {
      verdicts.push({
        id: 'bundle-inlining',
        level: 'warn',
        title: 'Skipped the bundle scan',
        detail: 'SHOPIFY_STORE_DOMAIN is not set locally, so there is nothing to search for.',
        action: 'SHOPIFY_STORE_DOMAIN=y0k9ve-q1.myshopify.com pnpm diagnose:deployment <url>',
      })
    } else if (bundle.found) {
      verdicts.push({
        id: 'bundle-inlining',
        level: 'ok',
        title: 'The store domain is inlined in the served JavaScript',
        detail: `Found in one of ${bundle.scripts} chunk(s) the browser downloads.`,
      })
    } else {
      verdicts.push({
        id: 'bundle-inlining',
        level: 'fail',
        title: 'The store domain is NOT in the served JavaScript',
        detail:
          `Searched ${bundle.scripts} chunk(s) and found no occurrence of the store domain. ` +
          'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN was absent when this bundle was built, so the ' +
          'cart cannot sync and Checkout can never produce a checkoutUrl — regardless of ' +
          'what the variable is set to now.',
        action:
          'Set it in Vercel for this environment and redeploy with the build cache ' +
          'DISABLED. A plain redeploy will reuse this same bundle.',
      })
    }
  } catch (err) {
    verdicts.push({
      id: 'bundle-inlining',
      level: 'warn',
      title: 'Bundle scan failed',
      detail: err.message,
    })
  }

  for (const verdict of verdicts) print(verdict)

  const { exitCode, summary } = summarise(verdicts)
  console.log('─'.repeat(70))
  console.log(summary)

  if (exitCode !== 0) {
    console.log('')
    console.log('Whatever you were testing on this URL, test it somewhere else first.')
  }

  process.exit(exitCode)
}

// Guarded so importing this module for tests does not fire live requests at a
// deployment and then call process.exit mid-run — the same guard
// verify-production.mjs needs, for the same reason.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
