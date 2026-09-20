#!/usr/bin/env node
/**
 * The browse-only production smoke.
 *
 * Replaces `verify-production.mjs`'s subject, not its shape. That script asks whether a
 * headless Shopify storefront is healthy; after the decommission there is no store, so its
 * questions have no subject. This one asks whether the deployed site serves the catalogue
 * this repository holds — and nothing else.
 *
 * ## Usage
 *
 *   PRODUCTION_SITE_URL=https://… node scripts/verify-browse-only.mjs [--json]
 *
 * Exits 1 on findings, 0 when clean **or unevaluable**. Deliberately: a runner that could
 * not reach the site has learned nothing, and a scheduled check that goes red for its own
 * network is muted within a week (ADR 011, ADR 010).
 *
 * ## Where the handles come from
 *
 * The filenames in `src/content/catalog/products/`. Not a directory of parsed records:
 * this is dependency-free `.mjs` and cannot import the TypeScript reader, and re-parsing
 * the JSON here would be a second validator drifting from the first.
 *
 * The filename is safe to use as a handle because `catalog-content.test.ts` asserts, in the
 * merge gate, that every file is named after the handle inside it. That join is the whole
 * licence for this shortcut — if it is ever removed, this script starts checking URLs that
 * do not correspond to records. It is noted in `docs/controls.json` under
 * `browse-only-smoke` as a known limit rather than left implicit.
 */

import fs from 'node:fs'
import path from 'node:path'
import { assessBrowseOnly } from './lib/browse-only.mjs'
import { apexHostFromSiteConfig } from './lib/canonical-domain.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PRODUCT_DIR = path.join(ROOT, 'src/content/catalog/products')
const COLLECTION_DIR = path.join(ROOT, 'src/content/catalog/collections')

/** A handle no catalogue will ever hold, used to prove that unknown handles 404. */
const UNKNOWN_HANDLE = 'this-product-does-not-exist-hj-probe'

/**
 * Where the sitemap lives, read out of `public/robots.txt` rather than guessed.
 *
 * The first version of this script probed `/sitemap.xml` — the conventional path, and the
 * wrong one: this site serves it from `/api/sitemap`, which is what robots.txt has always
 * told crawlers. The probe reported `sitemap-unreadable` against a perfectly good sitemap,
 * which is a false finding in the one direction that matters, because a monitor that cries
 * wolf is a monitor that gets muted (ADR 011).
 *
 * Reading the real file means the probe and the crawlers cannot disagree. If the path moves
 * and robots.txt is updated, this follows; if it moves and robots.txt is *not* updated,
 * crawlers break and so does this, which is the correct coupling.
 */
export function sitemapPathFromRobots(robotsTxt) {
  const match = robotsTxt.match(/^\s*Sitemap:\s*(\S+)\s*$/im)
  if (!match) return null
  try {
    return new URL(match[1]).pathname
  } catch {
    // A relative value is unusual but legal enough to accept rather than discard.
    return match[1].startsWith('/') ? match[1] : null
  }
}

/** Bodies are only read far enough to find a marker; a full page is megabytes of noise. */
const MAX_BODY_BYTES = 512_000

function handlesIn(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

/**
 * Fetch one URL and describe what came back, never throwing.
 *
 * A transport failure is recorded as an observation rather than propagated, because the
 * decision function has to be able to tell "the site said 404" from "I could not ask".
 */
export async function observe(baseUrl, pathname, kind) {
  const url = new URL(pathname, baseUrl)
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'healthy-jewelry-browse-only-smoke' },
    })
    let body = ''
    try {
      const text = await response.text()
      body = text.slice(0, MAX_BODY_BYTES)
    } catch {
      // A body that cannot be read is not a finding about the site; the status still counts.
      body = ''
    }
    return {
      path: pathname,
      kind,
      transport: 'ok',
      status: response.status,
      server: response.headers.get('server') ?? '',
      body,
    }
  } catch (error) {
    return { path: pathname, kind, transport: 'failed', status: 0, server: '', body: '', detail: error.message }
  }
}

/**
 * Pull product handles out of a sitemap body.
 *
 * Returns `null` when the sitemap could not be read at all — which the decision function
 * reports as its own finding, separate from "a handle is missing". A sitemap that 500s and
 * a sitemap that omits a product are different problems with different fixes.
 */
export function handlesFromSitemap(observation) {
  if (observation.transport !== 'ok' || observation.status !== 200 || !observation.body) return null
  const matches = observation.body.match(/\/products\/([a-z0-9][a-z0-9-]*)/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace('/products/', '')))].sort()
}

/**
 * Where to point, in order of authority.
 *
 * `PRODUCTION_SITE_URL` first, so a Preview deployment can be checked before it is
 * promoted. Otherwise the apex out of `src/config/site.ts` — the same source
 * `probe-canonical-domain.mjs` reads, and for the same reason: a probe carrying its own
 * copy of the hostname cannot notice the application drifting off it, which makes the
 * check quietly meaningless rather than loudly wrong (ADR 032).
 *
 * No hardcoded fallback. If neither is available the script says so and stops, rather than
 * checking a domain nobody asked about.
 */
export function resolveBaseUrl(env, siteConfigSource) {
  if (env.PRODUCTION_SITE_URL) return env.PRODUCTION_SITE_URL
  const apex = apexHostFromSiteConfig(siteConfigSource)
  return apex ? `https://${apex}` : null
}

async function main() {
  const siteConfig = path.join(ROOT, 'src/config/site.ts')
  const baseUrl = resolveBaseUrl(
    process.env,
    fs.existsSync(siteConfig) ? fs.readFileSync(siteConfig, 'utf-8') : ''
  )
  if (!baseUrl) {
    console.error(
      'No site to check: PRODUCTION_SITE_URL is unset and no apex could be read from ' +
        'src/config/site.ts.'
    )
    return 1
  }
  // stderr, not stdout: `--json` must emit parseable JSON and nothing else, or every
  // caller has to strip a preamble. The URL still reaches a human reading the log.
  console.error(`Checking ${baseUrl}`)

  const expectedHandles = handlesIn(PRODUCT_DIR)
  const collections = handlesIn(COLLECTION_DIR)

  const observations = []
  for (const handle of expectedHandles) {
    observations.push(await observe(baseUrl, `/products/${handle}`, 'product'))
  }
  for (const handle of collections) {
    observations.push(await observe(baseUrl, `/shop/${handle}`, 'collection'))
  }
  observations.push(await observe(baseUrl, '/shop', 'collection'))
  observations.push(await observe(baseUrl, `/products/${UNKNOWN_HANDLE}`, 'unknown-product'))

  const robots = fs.existsSync(path.join(ROOT, 'public/robots.txt'))
    ? fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf-8')
    : ''
  const sitemapPath = sitemapPathFromRobots(robots) ?? '/sitemap.xml'
  const sitemap = await observe(baseUrl, sitemapPath, 'sitemap')
  const result = assessBrowseOnly({
    expectedHandles,
    observations,
    sitemapHandles: handlesFromSitemap(sitemap),
  })

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const mark = result.verdict === 'clean' ? '✓' : result.verdict === 'findings' ? '✗' : '?'
    console.log(`${mark} browse-only catalogue: ${result.verdict}`)
    console.log('')
    console.log(result.summary)
    for (const finding of result.findings ?? []) {
      console.log('')
      console.log(`  · ${finding.code} — ${finding.detail}`)
    }
  }

  return result.verdict === 'findings' ? 1 : 0
}

// Guarded so the module can be imported by a test without firing requests or exiting.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code))
}
