#!/usr/bin/env node
/**
 * Gathers evidence of what every host answering for the site actually serves, and classifies
 * any commerce it finds by where in the chain it appears.
 *
 * ## What it asks, and of whom
 *
 * Hosts: the apex (read from `src/config/site.ts`, as every other live probe here reads it),
 * `www.` + the apex, the deployment URL the apex itself reports (`/api/version` →
 * `build.vercelUrl`, a `*.vercel.app` host), and `--preview-url` when given.
 *
 * Paths: `/`, `/shop`, `/materials`, the first catalogue product, an unknown product, and eight
 * commerce-era URLs, each fetched with `redirect: 'manual'` and the chain walked by hand (at
 * most three hops, same registrable domain only).
 *
 * Twice. The second pass is the cache speaking: a first-pass MISS and a second-pass HIT with a
 * different body is a CDN serving two versions of one page, which is one of the four answers
 * this probe exists to tell apart.
 *
 * Per request it records the time, host, path, pass, status, redirect chain, a subset of
 * response headers, the body's sha256, what the detectors saw, and the build commit that host's
 * `/api/version` reports. The decision is `classifyDiscrepancy()` in `lib/live-surface.mjs`.
 *
 * ## What it does not do
 *
 * It files no issue and fails no gate. It is report-only by design, in `control-audit.yml`
 * beside the other scheduled probes: the purchase-era copy it observes is present in source
 * pending legal review, and a scheduled check that goes red on text nobody in CI may change is
 * one people mute (ADR 011). It never sends a credential anywhere — no request carries one.
 *
 * ## Usage
 *
 *   node scripts/probe-live-surface.mjs [--out live-surface.json] [--summary live-surface.md]
 *                                       [--preview-url <url>] [--external-shows-commerce]
 *
 * `--external-shows-commerce` records that some retrieval outside this probe (a crawler cache,
 * a search snippet, an assistant's browsing tool) showed commerce — the input the fourth rule
 * needs and that no HTTP request can supply.
 *
 * Exit codes: 0 `clean` or `unevaluable`; 1 any other classification. `unevaluable` is not a
 * failure for the reason every live probe here gives: a runner that could not reach the site
 * has learned nothing about it.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { isAttributable } from './lib/browse-only.mjs'
import { apexHostFromSiteConfig } from './lib/canonical-domain.mjs'
import { parseContract } from './lib/commerce-contract.mjs'
import { forbiddenHostPattern, parseEgress } from './lib/egress.mjs'
import {
  classifyDiscrepancy,
  detectBody,
  nextHop,
  pickHeaders,
  probePaths,
  renderSummary,
  requestShowsCommerce,
} from './lib/live-surface.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PRODUCT_DIR = path.join(ROOT, 'src/content/catalog/products')
const TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 2_000_000
const PASSES = 2

/** The first catalogue handle, from filenames — the licence `verify-browse-only.mjs` documents. */
export function firstHandle(dir = PRODUCT_DIR) {
  if (!fs.existsSync(dir)) return null
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()[0] ?? null
}

/**
 * Fetch one URL, walking redirects by hand. Never throws.
 *
 * @param {string} url
 * @param {(url: string, init: object) => Promise<{ status: number, headers: { get: (name: string) => string | null }, text: () => Promise<string> }>} [fetchImpl]
 */
export async function fetchChain(url, fetchImpl = fetch) {
  const chain = []
  let current = url
  for (let hop = 0; ; hop += 1) {
    let response
    try {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'healthy-jewelry-live-surface-probe' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      return { chain, transport: 'failed', detail: String(error?.cause?.code ?? error?.message ?? error) }
    }
    const location = response.headers.get('location')
    chain.push({ url: current, status: response.status, location })
    const step = nextHop(current, response.status, location, hop)
    if (step.follow && step.to) {
      current = step.to
      continue
    }
    let body = ''
    try {
      body = (await response.text()).slice(0, MAX_BODY_BYTES)
    } catch {
      // status and headers remain the answer
    }
    return {
      chain,
      transport: 'ok',
      status: response.status,
      finalUrl: current,
      stoppedBecause: step.reason,
      headers: pickHeaders((n) => response.headers.get(n)),
      body,
    }
  }
}

async function buildIdentity(origin) {
  const answer = await fetchChain(`${origin}/api/version`)
  if (answer.transport !== 'ok' || answer.status !== 200) return { commit: null, vercelUrl: null, status: answer.status ?? 0 }
  try {
    const json = JSON.parse(answer.body)
    return { commit: json?.build?.commit ?? null, vercelUrl: json?.build?.vercelUrl ?? null, status: 200 }
  } catch {
    return { commit: null, vercelUrl: null, status: answer.status }
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] ?? null : null
  }
  const out = flag('--out')
  const summaryOut = flag('--summary')
  const externalRetrievalShowsCommerce = argv.includes('--external-shows-commerce')

  let apex = null
  try {
    apex = apexHostFromSiteConfig(fs.readFileSync(path.join(ROOT, 'src/config/site.ts'), 'utf8'))
  } catch {
    // reported below
  }
  if (!apex) {
    console.error('Could not read the apex out of src/config/site.ts. Refusing to guess a hostname.')
    return 2
  }

  const edgeIdentity = await buildIdentity(`https://${apex}`)
  const targets = [
    { role: 'apex', host: apex },
    { role: 'www', host: `www.${apex}` },
  ]
  if (edgeIdentity.vercelUrl) {
    const host = String(edgeIdentity.vercelUrl).replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    targets.push({ role: 'deployment', host })
  }
  // A flag rather than an environment variable: it is an input to one run, not
  // configuration a deployment holds, and `.env.local.example` lists only the latter.
  const previewUrl = flag('--preview-url')
  if (previewUrl) {
    try {
      targets.push({ role: 'preview', host: new URL(previewUrl).host })
    } catch {
      console.error('--preview-url is not a URL; ignored.')
    }
  }

  // §7 and §13 from the one parse the merge gate uses: the routes this site retired and the
  // hosts it may never load are the contract's answer, not this probe's.
  const contractText = fs.readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8')
  const paths = probePaths(firstHandle(), parseContract(contractText).routesForbidden)
  const forbiddenHosts = forbiddenHostPattern(parseEgress(contractText).forbidden)
  const requests = []
  const hosts = []
  /** @type {Record<string, string[]>} */
  const observations = {}

  for (const target of targets) {
    const origin = `https://${target.host}`
    const identity = target.role === 'apex' ? edgeIdentity : await buildIdentity(origin)
    const summary = {
      role: target.role,
      host: target.host,
      reachable: false,
      protected: false,
      commit: identity.commit,
      commerce: false,
      digests: {},
      skipped: 0,
    }

    let dead = false
    for (let pass = 1; pass <= PASSES; pass += 1) {
      for (const { path: p, kind } of paths) {
        if (dead) {
          summary.skipped += 1
          continue
        }
        const answer = await fetchChain(`${origin}${p}`)
        const status = answer.status ?? 0
        const server = answer.headers?.server ?? ''
        const attributable =
          answer.transport === 'ok' && isAttributable({ transport: 'ok', status, server, body: answer.body })
        const record = {
          at: new Date().toISOString(),
          host: target.host,
          role: target.role,
          path: p,
          kind,
          pass,
          transport: answer.transport,
          status,
          chain: answer.chain,
          stoppedBecause: answer.stoppedBecause ?? null,
          headers: answer.headers ?? null,
          sha256: answer.transport === 'ok' ? createHash('sha256').update(answer.body).digest('hex') : null,
          bytes: answer.body?.length ?? 0,
          commit: identity.commit,
          attributable,
          detectors: attributable ? detectBody(answer.body, forbiddenHosts) : null,
          detail: answer.detail ?? null,
        }
        requests.push(record)

        // A host that cannot be reached, or that answers with a deployment-protection 401,
        // will answer every other request the same way. Recorded once, then skipped, so a dead
        // host costs one timeout rather than one per path per pass.
        if (!attributable) {
          dead = true
          continue
        }
        if (status === 401 && /vercel/i.test(server)) {
          summary.protected = true
          dead = true
          continue
        }
        summary.reachable = true
        if (requestShowsCommerce(record)) summary.commerce = true
        if (pass === 1 && status === 200 && record.sha256) summary.digests[p] = record.sha256
        for (const term of record.detectors?.purchaseEraCopy ?? []) {
          observations[term] = [...new Set([...(observations[term] ?? []), `${target.host}${p}`])]
        }
      }
    }
    hosts.push(summary)
  }

  const classification = classifyDiscrepancy({ externalRetrievalShowsCommerce, hosts })
  const evidence = {
    generatedAt: new Date().toISOString(),
    apex,
    passes: PASSES,
    paths,
    hosts,
    classification,
    observations,
    requests,
  }

  if (out) fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`)
  const markdown = renderSummary(evidence)
  if (summaryOut) fs.writeFileSync(summaryOut, `${markdown}\n`)
  console.log(markdown)

  return ['clean', 'unevaluable'].includes(classification.classification) ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exit(await main())
}
