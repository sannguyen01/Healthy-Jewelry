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

/**
 * Refuses to run on a dirty tree. See the safety note above.
 *
 * **Tracked files only, and the distinction cost this control a run every six hours.**
 *
 * `git status --porcelain` lists untracked files too, as `?? path`. The steps above this
 * one in `control-audit.yml` each pipe their probe through `tee <name>.log`, and those logs
 * are written into the workspace root. So by the time this probe started, `merge-gate.log`
 * and `accepted-gap.log` existed, porcelain was non-empty, and it threw before mutating
 * anything — every scheduled run, reported as one `failure` cell in a job summary nobody
 * reads, while `continue-on-error: true` kept the job green.
 *
 * The irony is exact: `main()` below carries a guard against "measured nothing, reported
 * all was well", written after this probe spent PR #44 to 2026-09-18 in precisely that
 * state. The guard was correct and never ran, because the refusal happens first.
 *
 * Narrowing this to tracked changes is not a narrowing of the control. The safety argument
 * in the module docstring is specifically about tracked files: this probe edits them and
 * restores them, and a crash leaves a state `git checkout -- .` recovers. An untracked file
 * is never touched, never restored, and cannot be destroyed by anything here — refusing on
 * one protects nothing and disables everything.
 */
function assertCleanTree() {
  let status
  try {
    status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    throw new Error('Not a git repository, or git is unavailable. This probe edits tracked files and will not run without a way to recover them.')
  }
  status = status
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('??'))
    .join('\n')
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

/**
 * The verdict, as a function of what was observed and nothing else.
 *
 * Extracted from `probe()` so it can be exercised against known answers without mutating
 * a file or running a suite. That separation is not cosmetic: this probe shipped with two
 * defects in one week — a sentinel naming the wrong spec, and a missing browser binary
 * read as "the mutation was caught" — and **it had no unit test at all**, while the two
 * probes that did have one (`verdict` in probe-branch-protection, `assessLiveness` in
 * probe-smoke-liveness) shipped clean. The difference was that their decisions were pure
 * and this one's was tangled with filesystem and subprocess work.
 *
 * Four states, and only `dead` means a test has stopped carrying information:
 *
 * - `unapplicable` — the mutation could not be applied; the anchor moved.
 * - `unevaluable`  — the tests were already failing, so a red result proves nothing.
 * - `alive`        — the mutation was applied and the tests noticed.
 * - `dead`         — the mutation was applied and the tests did not.
 *
 * See docs/adr/024-a-tool-never-pointed-at-a-known-answer.md.
 *
 * @param {object} observed
 * @param {number} observed.occurrences        Times the anchor text appears in the file.
 * @param {{ failed: boolean, exitCode: number } | null} observed.baseline
 *   Result of running the specs unmutated, or null when not reached.
 * @param {{ failed: boolean, exitCode: number, viaBuild?: boolean } | null} observed.mutated
 *   Result of running them mutated, or null when not reached.
 * @returns {{ state: 'unapplicable' | 'unevaluable' | 'alive' | 'dead', exitCode?: number, viaBuild?: boolean }}
 */
export function classifyProbeResult({ occurrences, baseline, mutated }) {
  if (occurrences !== 1) return { state: 'unapplicable' }
  if (!baseline) return { state: 'unevaluable' }
  if (baseline.failed) return { state: 'unevaluable' }
  if (!mutated) {
    // **A throw, not a state.** This function answers "did the tests notice the
    // mutation?", and with no mutated run there is no answer — only the absence
    // of one. Returning `unevaluable` here made the absence indistinguishable
    // from a genuine finding, and the call site exploited that by asking this
    // function two questions it does not answer. See `baselineUsable`.
    throw new Error(
      'classifyProbeResult: `mutated` is required. Use anchorUsable()/baselineUsable() ' +
        'for the pre-mutation guards — this function reports the post-mutation verdict ' +
        'and has no meaningful answer without one.'
    )
  }
  return {
    state: mutated.failed ? 'alive' : 'dead',
    exitCode: mutated.exitCode,
    viaBuild: mutated.viaBuild ?? false,
  }
}

/**
 * Can this sentinel's mutation be applied at all?
 *
 * @param {number} occurrences Times the anchor text appears in the file.
 * @returns {{ usable: boolean }}
 */
export function anchorUsable(occurrences) {
  return { usable: occurrences === 1 }
}

/**
 * Is the unmutated run a usable baseline?
 *
 * ## The bug this function exists to have made impossible
 *
 * Both pre-mutation guards used to be written as calls to `classifyProbeResult`
 * with `mutated: null`:
 *
 * ```js
 * const baseline = runTests(sentinel)
 * if (classifyProbeResult({ occurrences, baseline, mutated: null }).state === 'unevaluable') {
 *   return { state: 'unevaluable', detail: `${specs} already fails without the mutation …` }
 * }
 * ```
 *
 * `classifyProbeResult` returns `unevaluable` for a null `mutated` — correctly,
 * for its own contract — so **that condition was true on every run, for every
 * sentinel, whatever the baseline did.** The probe never applied a single
 * mutation after the refactor that introduced it (PR #44). It reported all
 * seventeen sentinels `unevaluable` and exited 0.
 *
 * Three things kept it invisible for weeks, and each is worth naming separately:
 *
 *   · **`unevaluable` is not a failure.** The run exited 0 and the weekly
 *     verification passed.
 *   · **The message blamed the wrong thing.** It said the specs "already fail
 *     without the mutation (exit 0)" and told the reader to fix the suite or the
 *     environment. The suite was green; `exit 0` is printed right there in the
 *     sentence and contradicts the claim around it.
 *   · **The extracted decision was unit-tested and correct.** Every case in
 *     `probe-liveness-decision.test.ts` passes a real `mutated`, because that is
 *     what the function is for. Extracting the decision made the decision
 *     testable and left the *composition* untested — which is where the defect
 *     went.
 *
 * `classifyProbeResult` now throws on a null `mutated`, so the misuse cannot
 * recur silently: it is a crash rather than a plausible-looking verdict.
 *
 * @param {{ failed: boolean, exitCode: number } | null} baseline
 * @returns {{ usable: boolean, reason?: 'not-run' | 'already-red' }}
 */
export function baselineUsable(baseline) {
  if (!baseline) return { usable: false, reason: 'not-run' }
  if (baseline.failed) return { usable: false, reason: 'already-red' }
  return { usable: true }
}

/**
 * @param {import('./lib/sentinels.mjs').Sentinel} sentinel
 *
 * Establishes a green baseline before mutating, because a red result only means the
 * mutation was caught if the same tests were passing a moment earlier.
 *
 * This was not in the first version, and the omission was caught the way these things
 * always are — by accident. The pinned `chrome-headless-shell` build was missing from
 * this machine, so *every* Playwright run failed at browser launch, and the probe read
 * those failures as two sentinels alive. It reported exactly the answer it wanted and had
 * measured nothing.
 *
 * That is ADR 010's distinction — "this check failed" versus "this check could not run" —
 * which the branch-protection probe keeps carefully and this one did not, inside the tool
 * built to find precisely that class of mistake.
 */
function probe(sentinel) {
  const file = path.join(ROOT, sentinel.file)
  const original = fs.readFileSync(file, 'utf8')

  const occurrences = original.split(sentinel.find).length - 1
  if (!anchorUsable(occurrences).usable) {
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
    // Baseline first. A test that is already failing tells us nothing when it fails again.
    const baseline = runTests(sentinel)
    const usable = baselineUsable(baseline)
    if (!usable.usable) {
      return {
        id: sentinel.id,
        state: 'unevaluable',
        invariant: sentinel.invariant,
        specs: sentinel.specs,
        detail:
          usable.reason === 'already-red'
            ? `${sentinel.specs.join(', ')} already fails without the mutation (exit ` +
              `${baseline.exitCode}). Until it passes, a red result under mutation proves ` +
              `nothing — the tests would have been red either way. Fix the suite, or the ` +
              `environment, then re-run.`
            : `The baseline run for ${sentinel.specs.join(', ')} produced no result, so ` +
              `there is nothing to compare a mutated run against.`,
      }
    }

    fs.writeFileSync(file, original.replace(sentinel.find, sentinel.replace))
    const mutated = runTests(sentinel)
    const classified = classifyProbeResult({ occurrences, baseline, mutated })
    return {
      id: sentinel.id,
      state: classified.state,
      exitCode: classified.exitCode,
      viaBuild: classified.viaBuild,
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
  const unapplicable = results.filter(
    (r) => r.state === 'unapplicable' || r.state === 'unevaluable'
  )

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
      if (result.state === 'unapplicable' || result.state === 'unevaluable') {
        console.log(`    ${result.detail}`)
      }
    }
    console.log('')
    if (dead.length > 0) {
      console.log(
        `${dead.length} dead assertion(s). The code above was broken on purpose and the ` +
          `tests protecting it stayed green — they execute it and depend on nothing.`
      )
    } else if (unapplicable.length > 0) {
      console.log(
        `Every evaluable sentinel is alive, but ${unapplicable.length} could not be ` +
          `evaluated — the anchor moved, or the tests were already red before the ` +
          `mutation. A sentinel that cannot run is not evidence of anything, and reading ` +
          `it as evidence is how a probe reports the answer it wanted.`
      )
    } else {
      console.log(`All ${results.length} sentinels alive.`)
    }
  }

  // An unapplicable sentinel is a real finding — a check that cannot run is not a check —
  // but it is a different one from a dead assertion, and only the second means a test has
  // stopped carrying information. One sentinel whose anchor moved does not invalidate the
  // sixteen that ran.
  //
  // **Zero evaluated is a different fact entirely**, and it now fails. That is the state
  // this probe was actually in from PR #44 until 2026-09-18: every sentinel reported
  // `unevaluable`, nothing was ever mutated, and the run exited 0 — a control reporting
  // that it had measured nothing, in the voice of one reporting that all was well. It is
  // ADR 010's own distinction ("this check failed" versus "this check could not run")
  // applied to the probe as a whole rather than to one sentinel, and this file already
  // records the same class of mistake happening inside it once before.
  const evaluated = results.filter((r) => r.state === 'alive' || r.state === 'dead')
  if (evaluated.length === 0 && results.length > 0) {
    console.log(
      `\nNot one of ${results.length} sentinels could be evaluated. The probe measured ` +
        `nothing, which is a failure of the probe rather than a clean bill of health for ` +
        `the suite.`
    )
    process.exit(1)
  }

  process.exit(dead.length > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
