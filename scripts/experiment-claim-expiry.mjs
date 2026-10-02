#!/usr/bin/env node
/**
 * Does an expired claim approval leave the page a visitor is actually served?
 *
 * Builds a production artifact in which one claim (`brand-positioning`) is approved from
 * yesterday and expires at the end of today, and serves it once — a server that is running
 * when the approval lapses, which is the case that matters in production:
 *
 *   1. before the server's clock moves, the approved wording must appear (anti-vacuity: a
 *      fixture that never rendered would make its later absence meaningless, ADR 020);
 *   2. then both of the server's clocks jump two days past expiry
 *      (`scripts/experiments/shift-clock.mjs` — `Date` for the claim resolver, `performance`
 *      for Next's cache), each page is requested up to `--attempts` times, and the verdict says
 *      whether the wording left every surface that carried it (visible text, `<meta>` content,
 *      JSON-LD), and on which attempt.
 *
 * One server rather than two on purpose. A server *started* after the move dates every
 * prerendered entry at load, sees it as fresh, and serves a HIT whatever the revalidation
 * window — which is how this experiment's first version reported FAIL for a correct build.
 *
 * The decision is `judgeExpiry()` in `scripts/lib/claim-expiry.mjs`; this file only builds,
 * serves and fetches. The fixture is written into a scratch copy exported with `git archive
 * <ref>`, never into the repository's registry, and it names itself as a fixture.
 *
 * ## Usage
 *
 *   node scripts/experiment-claim-expiry.mjs [--ref <git ref>] [--out report.json] [--attempts 8]
 *
 * `--ref` defaults to HEAD; commit before running. Needs the pnpm store already populated (it
 * installs with `--prefer-offline`) and two to three minutes for the build. Manual by design:
 * it is a proof about a rendering mode, re-run when the rendering mode or Next's major version
 * changes, not a merge-gate check.
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 unevaluable or a setup failure.
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { EXPERIMENT_CLAIM_ID, inlineText, judgeExpiry, withExpiringApproval, wordingOn } from './lib/claim-expiry.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const SHIFT_MS = 2 * 86_400_000
/** Real time between the server starting and its clocks jumping: enough to read the baseline. */
const JUMP_DELAY_MS = 20_000
const PAGES = ['/', '/about', '/materials']

function flag(argv, name, fallback) {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}

function run(cmd, args, cwd, env = {}) {
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } })
}

/** Start `next start` and resolve once it answers; returns a stop function. */
async function serve(dir, port, env) {
  const child = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], {
    cwd: dir,
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  })
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })
      if (r.status > 0) return stop
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  stop()
  throw new Error('next start did not answer within 60s')
}

async function get(port, p) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { redirect: 'manual' })
  const body = Buffer.from(await r.arrayBuffer())
  return { status: r.status, cache: r.headers.get('x-nextjs-cache'), body }
}

async function main() {
  const argv = process.argv.slice(2)
  const ref = flag(argv, '--ref', 'HEAD')
  const out = flag(argv, '--out', null)
  const attempts = Number(flag(argv, '--attempts', '8'))
  const port = Number(flag(argv, '--port', '3217'))
  const sha = execFileSync('git', ['rev-parse', ref], { cwd: ROOT }).toString().trim()

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hj-claim-expiry-${sha.slice(0, 7)}-`))
  console.error(`[experiment] ${ref} (${sha.slice(0, 7)}) → ${dir}`)
  execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${dir}"`], { cwd: ROOT })
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], dir)

  const registryPath = path.join(dir, 'src/content/claims/claims.json')
  const buildClock = new Date()
  const registry = withExpiringApproval(JSON.parse(fs.readFileSync(registryPath, 'utf8')), buildClock)
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
  const wording = inlineText(registry.claims.find((c) => c.id === EXPERIMENT_CLAIM_ID).wording)

  console.error('[experiment] building…')
  run('pnpm', ['build'], dir, { NEXT_TELEMETRY_DISABLED: '1' })

  // The jump is scheduled before the server starts (the preload reads it once), far enough
  // ahead that the baseline below is read on the real clock, with time to spare.
  const jumpAt = Date.now() + JUMP_DELAY_MS
  const preload = pathToFileURL(path.join(ROOT, 'scripts/experiments/shift-clock.mjs')).href
  const stop = await serve(dir, port, {
    NODE_OPTIONS: `--import ${preload}`,
    HJ_CLOCK_SHIFT_MS: String(SHIFT_MS),
    HJ_CLOCK_JUMP_AT_MS: String(jumpAt),
  })
  const baseline = {}
  const shifted = {}
  let ogBefore = null
  let ogAfter = null
  try {
    for (const p of PAGES) baseline[p] = wordingOn((await get(port, p)).body.toString('utf8'), wording)
    ogBefore = createHash('sha256').update((await get(port, '/opengraph-image')).body).digest('hex')
    if (Date.now() >= jumpAt) throw new Error('the baseline was still being read when the clock jumped; raise JUMP_DELAY_MS')
    await new Promise((res) => setTimeout(res, jumpAt - Date.now() + 1000))

    for (const p of PAGES) {
      shifted[p] = []
      for (let i = 0; i < attempts; i += 1) {
        const r = await get(port, p)
        const where = wordingOn(r.body.toString('utf8'), wording)
        shifted[p].push({ ...where, cache: r.cache, status: r.status })
        if (!Object.values(where).some(Boolean)) break
        await new Promise((res) => setTimeout(res, 1500))
      }
    }
    // The share card: one request to notice staleness, one after regeneration.
    await get(port, '/opengraph-image')
    await new Promise((res) => setTimeout(res, 2500))
    ogAfter = createHash('sha256').update((await get(port, '/opengraph-image')).body).digest('hex')
  } finally {
    stop()
  }

  const judgement = judgeExpiry({ baseline, attempts: shifted })
  const report = {
    recordedAt: new Date().toISOString(),
    ref,
    sha,
    claim: EXPERIMENT_CLAIM_ID,
    wording,
    buildClock: buildClock.toISOString(),
    serverClockShiftMs: SHIFT_MS,
    serverClockJumpedAt: new Date(jumpAt).toISOString(),
    baseline,
    shifted,
    openGraphImage: {
      before: ogBefore,
      after: ogAfter,
      changed: ogBefore !== ogAfter,
      note: 'PNG text is not inspectable here; a changed hash after expiry is necessary, not sufficient.',
    },
    ...judgement,
  }
  const json = JSON.stringify(report, null, 2)
  if (out) fs.writeFileSync(out, `${json}\n`)
  console.log(json)
  fs.rmSync(dir, { recursive: true, force: true })
  return judgement.verdict === 'PASS' ? 0 : judgement.verdict === 'FAIL' ? 1 : 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exit(await main())
  } catch (error) {
    console.error(`[experiment] could not run: ${error?.message ?? error}`)
    process.exit(2)
  }
}
