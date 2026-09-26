#!/usr/bin/env node
/**
 * Proves, read-only, that GitHub refuses to merge a known-bad pull request.
 *
 * ## Why read-only
 *
 * The obvious test of a merge gate is to try to merge something bad. If the gate is
 * misconfigured, that test merges the bad change into `main`, and `main` auto-deploys to
 * production — the proof and the failure are the same click. GitHub already computes whether a
 * merge would be allowed (`mergeable_state`), so this reads that verdict, the effective rules,
 * and the canary's check runs, and judges them in `scripts/lib/merge-denial.mjs`.
 *
 * **This script contains no call to any merge endpoint, and never will.** Every request goes
 * through {@link get}, which hard-codes the `GET` method and accepts no override.
 * `probe-merge-denial.test.ts` asserts that statically, so a future edit adding one fails the
 * merge gate rather than a production deploy. Pressing merge on the canary is a human act and
 * the runbook tells them not to.
 *
 * ## Usage
 *
 *   GITHUB_TOKEN=… node scripts/probe-merge-denial.mjs --pr <number> [--out evidence.json]
 *
 * The procedure that produces a canary pull request is in `docs/runbooks/main-ruleset.md`.
 *
 * Exit codes — only the proof itself exits 0:
 *
 *   0  denied       — blocked, and a required check is the reason
 *   1  NOT-DENIED   — mergeable while a required check has not passed: the gate does not hold
 *   2  unevaluable  — or a usage error. "Could not prove it" must not read as "proved"
 */

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { evaluateProtection, readProtection } from './probe-branch-protection.mjs'
import { evidenceRecord, judgeDenial, pollMergeable } from './lib/merge-denial.mjs'

const REPO = process.env.GITHUB_REPOSITORY ?? 'sannguyen01/Healthy-Jewelry'
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'

/**
 * The only way this script talks to GitHub. `GET`, always; no method parameter exists.
 *
 * @param {string} pathname
 * @param {string | undefined} token
 * @returns {Promise<{ status: number, body: any, error?: string }>}
 */
async function get(pathname, token) {
  try {
    const response = await fetch(`${API}${pathname}`, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'healthy-jewelry-merge-denial-probe',
      },
    })
    let body = null
    try {
      body = await response.json()
    } catch {
      // status alone is the answer
    }
    return { status: response.status, body }
  } catch (error) {
    return { status: 0, body: null, error: `Request failed: ${error?.message ?? error}` }
  }
}

/**
 * Parse `--pr N` and `--out path`.
 *
 * @param {string[]} argv
 * @returns {{ pr: number | null, out: string | null }}
 */
export function parseArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag)
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
  }
  const raw = value('--pr')
  const pr = raw && /^\d+$/.test(raw) ? Number(raw) : null
  return { pr, out: value('--out') }
}

async function main() {
  const { pr: prNumber, out } = parseArgs(process.argv.slice(2))
  if (prNumber === null) {
    console.error('Usage: node scripts/probe-merge-denial.mjs --pr <number> [--out evidence.json]')
    return 2
  }
  const token = process.env.GITHUB_TOKEN

  const { pr: prBody, attempts } = await pollMergeable(async () => {
    const reading = await get(`/repos/${REPO}/pulls/${prNumber}`, token)
    return reading.status === 200 ? reading.body : { mergeable_state: null, _status: reading.status, _error: reading.error }
  })

  const headSha = prBody?.head?.sha ?? null
  const baseRef = prBody?.base?.ref ?? 'main'

  const readings = await readProtection({ api: API, repo: REPO, branch: baseRef, token })
  const protection = evaluateProtection(readings, { requiredContexts: [] })
  const requiredContexts =
    protection.state === 'unevaluable' ? null : protection.state === 'absent' ? [] : protection.contexts

  const checkRuns = headSha
    ? ((await get(`/repos/${REPO}/commits/${headSha}/check-runs?per_page=100`, token)).body?.check_runs ?? [])
    : []
  const statuses = headSha
    ? ((await get(`/repos/${REPO}/commits/${headSha}/status`, token)).body?.statuses ?? [])
    : []

  const judgement = judgeDenial({
    mergeableState: prBody?.mergeable_state ?? null,
    requiredContexts,
    checkRuns,
    statuses,
  })

  const record = evidenceRecord({
    now: new Date(),
    repo: REPO,
    prNumber,
    headSha,
    baseRef,
    attempts,
    mergeableState: prBody?.mergeable_state ?? null,
    protection: {
      state: protection.state,
      sources: protection.sources,
      contexts: protection.contexts,
      strict: protection.strict ?? null,
      bypassActors: protection.bypassActors ?? null,
      readings: {
        classic: readings.classic.status,
        rules: readings.rules.status,
        rulesets: Object.fromEntries(Object.entries(readings.rulesets).map(([id, r]) => [id, r.status])),
      },
    },
    judgement,
  })

  const json = JSON.stringify(record, null, 2)
  if (out) fs.writeFileSync(out, `${json}\n`)
  console.log(json)
  console.error(`\n${judgement.verdict}: ${judgement.detail}`)
  if (prBody?._status && prBody._status !== 200) {
    console.error(`(the pull request read answered ${prBody._status}${prBody._error ? `: ${prBody._error}` : ''})`)
  }

  return judgement.verdict === 'denied' ? 0 : judgement.verdict === 'NOT-DENIED' ? 1 : 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exit(await main())
}
