#!/usr/bin/env node
/**
 * Asks whether the brand domain is bound to the production deployment, and reports the
 * answer whatever it is.
 *
 * ## Why this exists
 *
 * Every live check in this repository fetches `PRODUCTION_SITE_URL` and asserts something
 * about the response. Not one of them can tell you whether that name reaches the Production
 * deployment, whether `www` reaches the same one, or whether the hostname the application
 * believes in is bound at all. Those are configuration facts, invisible from a browser tab,
 * and this repository's whole position (ADR 018) is that a configuration fact stated in a
 * document is a claim, while a configuration fact read from its own source of truth is
 * evidence.
 *
 * The failure it is built for is already on record twice. `docs/dns-domain-setup.md`
 * documents `account.healthyjewellery.com` resolving to a Vercel anycast IP, answering 404,
 * with no project in the account claiming it. And `src/config/build-info.ts` documents an
 * orphaned preview alias serving a snapshot of an app that no longer exists — which renders,
 * navigates, and is wrong.
 *
 * ## Where the decision lives
 *
 * Not here. `scripts/lib/canonical-domain.mjs` is a pure function over observations; this
 * file is transport and printing. That split is ADR 030's rule, and it is what lets
 * `src/tests/unit/canonical-domain-decision.test.ts` drive every branch from a fixture
 * instead of from the weather (ADR 024).
 *
 * ## Usage
 *
 *   node scripts/probe-canonical-domain.mjs [--json]
 *
 * Exit codes, and the reason there are three:
 *
 *   0  bound         — both hostnames reach the same production deployment
 *   0  unevaluable   — no egress, or no host answered. NOT a failure: a sandbox with no
 *                      public-web access must not open an issue claiming the domain broke,
 *                      and a scheduled audit that goes red for its own network is an audit
 *                      people mute within a week (ADR 011).
 *   1  drifted       — the binding is wrong, and a person needs to open the Vercel console
 *
 * Always writes `canonical-domain.json` so the workflow's reporting step reads data rather
 * than parsing prose — the same contract `probe-branch-protection.mjs` uses.
 */

import fs from 'node:fs'
import path from 'node:path'

import { describeFetchError, hintForFetchError } from './lib/fetch-error.mjs'
import {
  apexHostFromSiteConfig,
  classifyResponseOrigin,
  classifyTransportFailure,
  decideCanonicalDomain,
} from './lib/canonical-domain.mjs'

const SITE_CONFIG = path.resolve(import.meta.dirname, '../src/config/site.ts')
const OUTPUT = 'canonical-domain.json'
/** Enough to catch a slow cold start, short enough that six hostnames cannot stall a job. */
const TIMEOUT_MS = 15_000
/** A redirect chain longer than this is a loop, not a policy. */
const MAX_REDIRECTS = 3

/**
 * Follow redirects by hand.
 *
 * `redirect: 'follow'` would give the right body and throw away the thing being measured —
 * whether `www` hands over to the apex, and whether either hop leaves the brand. The chain
 * is the evidence, so it has to be walked rather than delegated.
 *
 * @param {string} host
 * @returns {Promise<import('./lib/canonical-domain.mjs').HostObservation>}
 */
async function observe(host) {
  const chain = [host]
  let url = `https://${host}/api/version`

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { accept: 'application/json', 'user-agent': 'healthy-jewellery-domain-probe' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      const detail = describeFetchError(err)
      return { host, transport: classifyTransportFailure(detail), detail, chain }
    }

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      let next
      try {
        next = new URL(location, url)
      } catch {
        return {
          host,
          transport: 'ok',
          status: response.status,
          chain,
          server: response.headers.get('server'),
          version: null,
        }
      }
      // Record the hostname only when it actually changes: a scheme or path redirect
      // within one host is not a binding fact and would make the chain unreadable.
      if (next.hostname !== chain[chain.length - 1]) chain.push(next.hostname)
      url = next.toString()
      continue
    }

    /** @type {unknown} */
    let version = null
    try {
      version = await response.json()
    } catch {
      // Left null. `/api/version` always answers 200 with JSON, so anything else means the
      // name is bound to something that is not this application — which the decision
      // function reports as `version-unreadable` rather than swallowing.
    }

    const server = response.headers.get('server')
    const body = version && typeof version === 'object' ? version : null

    // A refusal from something that identifies itself as nothing is evidence of nothing.
    // See classifyResponseOrigin — this branch is why the probe does not report five
    // findings about a domain it never reached.
    if (classifyResponseOrigin({ status: response.status, server, version: body }) === 'intercepted') {
      return {
        host,
        transport: 'unreachable',
        detail:
          `HTTP ${response.status} from an intermediary that sent no \`server\` header. ` +
          'The request did not demonstrably reach the origin, so nothing about the origin ' +
          'can be concluded from it.',
        chain,
      }
    }

    return {
      host,
      transport: 'ok',
      status: response.status,
      chain,
      server,
      version: body,
    }
  }

  return {
    host,
    transport: 'ok',
    status: 310,
    chain,
    server: null,
    version: null,
  }
}

async function main() {
  const asJson = process.argv.includes('--json')

  let apexHost
  try {
    apexHost = apexHostFromSiteConfig(fs.readFileSync(SITE_CONFIG, 'utf8'))
  } catch (err) {
    console.error(`Could not read ${SITE_CONFIG}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  if (!apexHost) {
    // Refuse rather than fall back to a hardcoded hostname. A probe that carries its own
    // copy of the domain cannot detect the application drifting off it, which is the single
    // thing this join exists to do — and `src/config/site.ts` already throws on the wrong
    // spelling precisely because that drift has happened here before.
    console.error(
      'Could not read SITE_URL out of src/config/site.ts. Refusing to guess the canonical ' +
        'hostname: a probe that hardcodes the domain cannot notice the app moving off it.'
    )
    process.exit(1)
  }

  const hosts = [apexHost, `www.${apexHost}`]
  const observations = []
  for (const host of hosts) observations.push(await observe(host))

  const expectedCommit = process.env.EXPECTED_COMMIT?.trim() || null
  const verdict = decideCanonicalDomain({ observations, apexHost, expectedCommit })

  const payload = {
    checkedAt: new Date().toISOString(),
    apexHost,
    expectedCommit,
    state: verdict.state,
    summary: verdict.summary,
    action: verdict.action,
    findings: verdict.findings,
    observations: observations.map((o) => ({
      host: o.host,
      transport: o.transport,
      status: o.status ?? null,
      chain: o.chain ?? [o.host],
      server: o.server ?? null,
      commit: o.version?.build?.commit ?? null,
      vercelEnv: o.version?.runtime?.vercelEnv ?? o.version?.build?.vercelEnv ?? null,
      detail: o.detail ?? null,
    })),
  }
  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`)

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    const mark = { bound: '✓', drifted: '✗', unevaluable: '·' }[verdict.state]
    console.log(`${mark} ${verdict.summary}\n`)
    for (const o of payload.observations) {
      const where = o.chain.length > 1 ? `  →  ${o.chain.join(' → ')}` : ''
      console.log(
        `  ${o.host}  ${o.transport === 'ok' ? `${o.status} ${o.vercelEnv ?? 'env?'} ${o.commit?.slice(0, 7) ?? 'commit?'}` : o.transport}${where}`
      )
    }
    if (verdict.findings.length > 0) {
      console.log('')
      for (const f of verdict.findings) console.log(`  · ${f.code} — ${f.detail}`)
    }
    // The hint stays separate from the finding, so a fact and a guess never read alike.
    const firstTransportDetail = payload.observations.find((o) => o.detail)?.detail
    const hint = firstTransportDetail ? hintForFetchError(firstTransportDetail) : null
    if (hint) console.log(`\n  hint: ${hint}`)
    if (verdict.action) console.log(`\n  ${verdict.action}`)
    if (verdict.state === 'unevaluable') {
      console.log(
        '\n  This probe needs public-web egress. A sandboxed agent session does not have it; ' +
          'CI does. Reported as unevaluable rather than failed, on purpose.'
      )
    }
  }

  process.exit(verdict.state === 'drifted' ? 1 : 0)
}

await main()
