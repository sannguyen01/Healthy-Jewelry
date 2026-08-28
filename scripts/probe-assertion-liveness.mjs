#!/usr/bin/env node
/**
 * Breaks each invariant in `scripts/lib/sentinels.mjs` on purpose and checks that the
 * tests protecting it actually go red.
 *
 * ## The question this answers
 *
 * `e2e/contact.spec.ts` asserted a `{ success: true }` contract that PR #32 had deleted
 * 17 days earlier. It kept passing, for the wrong reason. Coverage tools counted those
 * lines as covered the whole time — the spec executed them. What the spec had stopped
 * doing was *distinguishing* a working success path from a broken one.
 *
 * No amount of reading source answers that. The only way to know whether a test carries
 * information is to break the thing it protects and watch. This is ADR 006's own test —
 * *"if the setup step never happens, does anything go red?"* — asked of an assertion
 * instead of a control, and asked by a machine rather than by whoever is reading.
 *
 * A sentinel whose mutation leaves the suite green is a **dead assertion**.
 *
 * ## Usage
 *
 *   node scripts/probe-assertion-liveness.mjs              # vitest sentinels only (fast)
 *   node scripts/probe-assertion-liveness.mjs --with-e2e   # also the Playwright ones
 *   node scripts/probe-assertion-liveness.mjs --only=<id>[,<id>]
 *   node scripts/probe-assertion-liveness.mjs --json
 *
 * Exits 1 if any sentinel's tests stayed green under mutation.
 *
 * ## Safety
 *
 * This edits tracked files. It refuses to start on a dirty working tree, so a crash
 * leaves a state `git checkout -- .` fully recovers, and it restores every file in a
 * `finally` plus on SIGINT/SIGTERM. The refusal is not politeness: a probe that mutated
 * source alongside uncommitted work could destroy it, which would make the tool more
 * dangerous than the bug it looks for.
 */

import fs from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { SENTINELS } from './lib/sentinels.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const withE2E = argv.includes('--with-e2e')
const asJson = argv.includes('--json')
const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',')

/** Refuses to run on a dirty tree. See the safety note above. */
function assertCleanTree() {
  let status
  try {
    status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    throw new Error('Not a git repository, or git is unavailable. This probe edits tracked files and will not run without a way to recover them.')
  }
  if (status.trim() !== '') {
    throw new Error(
      'The working tree has uncommitted changes.\n\n' +
        'This probe mutates tracked source files and restores them afterwards. Running it ' +
        'over uncommitted work risks destroying it, and makes a crash unrecoverable.\n\n' +
        'Commit or stash first:\n' +
        status
    )
  }
}

/**
 * Runs a sentinel's tests and reports whether they failed.
 *
 * @param {import('./lib/sentinels.mjs').Sentinel} sentinel
 * @returns {{ failed: boolean, exitCode: number }}
 */
function runTests(sentinel) {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL:
      sentinel.runner === 'vitest' ? 'https://healthyjewellery.com' : 'http://localhost:3000',
    SHOPIFY_STORE_DOMAIN: 'mock.myshopify.com',
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'mock_token',
    NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'mock.myshopify.com',
    SHOPIFY_WEBHOOK_SECRET: 'mock_webhook_secret',
    SHOPIFY_REVALIDATION_SECRET: 'mock_revalidation_secret',
    CI: 'true',
  }

  if (sentinel.runner === 'playwright') {
    // E2E runs against a production build — what Vercel serves — so the mutation has to
    // be compiled in before the spec can see it. `pnpm dev` would be faster and would be
    // testing something this project does not deploy.
    const build = spawnSync('pnpm', ['build'], { cwd: ROOT, env, stdio: 'pipe' })
    if (build.status !== 0) {
      // A mutation that breaks the build *is* a caught mutation: something went red.
      return { failed: true, exitCode: build.status ?? 1, viaBuild: true }
    }
    const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...sentinel.specs], {
      cwd: ROOT,
      env: { ...env, PLAYWRIGHT_SKIP_BUILD: '1' },
      stdio: 'pipe',
    })
    return { failed: result.status !== 0, exitCode: result.status ?? -1 }
  }

  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...sentinel.specs], {
    cwd: ROOT,
    env,
    stdio: 'pipe',
  })
  return { failed: result.status !== 0, exitCode: result.status ?? -1 }
}

/** @param {import('./lib/sentinels.mjs').Sentinel} sentinel */
function probe(sentinel) {
  const file = path.join(ROOT, sentinel.file)
  const original = fs.readFileSync(file, 'utf8')

  const occurrences = original.split(sentinel.find).length - 1
  if (occurrences !== 1) {
    // Not a dead assertion — a broken sentinel, and a different finding. A mutation that
    // does not apply proves nothing, and reporting it as "green under mutation" would be
    // a false accusation against a test that may be perfectly alive.
    return {
      id: sentinel.id,
      state: 'unapplicable',
      detail:
        `The anchor text occurs ${occurrences} times in ${sentinel.file}, not once. ` +
        `The code moved; update the sentinel.`,
    }
  }

  const restore = () => fs.writeFileSync(file, original)
  const onSignal = () => {
    restore()
    process.exit(130)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    fs.writeFileSync(file, original.replace(sentinel.find, sentinel.replace))
    const { failed, exitCode, viaBuild } = runTests(sentinel)
    return {
      id: sentinel.id,
      state: failed ? 'alive' : 'dead',
      exitCode,
      viaBuild: viaBuild ?? false,
      invariant: sentinel.invariant,
      specs: sentinel.specs,
      scar: sentinel.scar,
    }
  } finally {
    restore()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

function main() {
  assertCleanTree()

  const selected = SENTINELS.filter((s) => {
    if (only) return only.includes(s.id)
    return withE2E || s.runner === 'vitest'
  })

  if (selected.length === 0) {
    throw new Error('No sentinels selected. Check --only, or drop it.')
  }

  const results = []
  for (const sentinel of selected) {
    if (!asJson) process.stderr.write(`  … ${sentinel.id} (${sentinel.runner})\n`)
    results.push(probe(sentinel))
  }

  const dead = results.filter((r) => r.state === 'dead')
  const unapplicable = results.filter((r) => r.state === 'unapplicable')

  if (asJson) {
    console.log(JSON.stringify({ results, dead: dead.length, unapplicable: unapplicable.length }, null, 2))
  } else {
    console.log('')
    for (const result of results) {
      const mark = result.state === 'alive' ? '✓' : result.state === 'dead' ? '✗' : '?'
      console.log(`${mark} ${result.id} — ${result.state}`)
      if (result.state === 'dead') {
        console.log(`    invariant: ${result.invariant}`)
        console.log(`    should have failed: ${result.specs.join(', ')}`)
        console.log(`    why it matters: ${result.scar}`)
      }
      if (result.state === 'unapplicable') console.log(`    ${result.detail}`)
    }
    console.log('')
    if (dead.length > 0) {
      console.log(
        `${dead.length} dead assertion(s). The code above was broken on purpose and the ` +
          `tests protecting it stayed green — they execute it and depend on nothing.`
      )
    } else if (unapplicable.length > 0) {
      console.log(
        `Every applicable sentinel is alive, but ${unapplicable.length} could not be ` +
          `applied. A sentinel that cannot run is not evidence of anything.`
      )
    } else {
      console.log(`All ${results.length} sentinels alive.`)
    }
  }

  // An unapplicable sentinel is a real finding — a check that cannot run is not a check —
  // but it is a different one from a dead assertion, and only the second means a test has
  // stopped carrying information.
  process.exit(dead.length > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
