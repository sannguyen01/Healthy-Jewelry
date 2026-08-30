#!/usr/bin/env node
/**
 * A dead-man's switch for the merge gate.
 *
 * ## The outage this exists because of
 *
 * `probe-smoke-liveness.mjs` watches production verification. Nothing watched CI, and on
 * 2026-08-29 at 04:27:56Z the merge gate went dark and stayed dark for a day.
 *
 * `pnpm install --frozen-lockfile` failed 0 seconds in — a dependabot merge had
 * regenerated the lockfile without its `overrides:` block — and every step after it
 * reported `skipped`:
 *
 *     Install dependencies   failure
 *     Lint                   skipped
 *     Type-check             skipped
 *     Unit tests             skipped
 *     Production build       skipped
 *     E2E tests (Playwright) skipped   ← the whole job
 *
 * Eleven consecutive runs. Eleven pull requests merged by hand in that window, none of
 * them evaluated by anything. The Actions tab showed a red X whose cause read as a
 * dependency problem, so a reader stopped there and never learned that the gate itself had
 * stopped running.
 *
 * That is [ADR 022](../docs/adr/022-absence-needs-its-own-alarm.md) exactly — *"every
 * control here reports the presence of a failure, none the absence of a success"* — and
 * the alarm ADR 022 produced was pointed at the other workflow. Issue #45's body describes
 * this pathology, for `production-smoke.yml`, while it was live and unwatched here.
 *
 * ## Why `Lint` and not the whole gate
 *
 * A legitimately failing build *also* leaves later steps `skipped`: lint fails, and
 * type-check, tests and build never run. That is a red gate working correctly, not a dark
 * one, and a probe demanding that all four executed would alarm on every genuinely broken
 * pull request — becoming a channel people mute
 * ([ADR 011](../docs/adr/011-repeated-identical-failures-must-escalate.md)), which is the
 * failure mode this family of tools is least able to afford.
 *
 * The distinction that matters is whether the gate ever *looked at the repository*.
 * `Lint` is the first step that does. If it ran — pass or fail — the code was evaluated
 * and CI is doing its job. If it is `skipped`, the run died in setup and nothing about the
 * change was checked at all. One step, chosen because it is the earliest point where a
 * verdict about the code exists, mirroring the smoke probe's single
 * `Live store and storefront`.
 *
 * ## Why "no runs" is not an alarm here
 *
 * `production-smoke.yml` is cron-driven, so silence means a stopped tier and the smoke
 * probe reports `dark` for it. `ci.yml` fires on push and pull request. A quiet day on
 * `main` is a quiet day, not a broken gate, so no runs in the window returns `idle` and
 * exits 0. Reporting otherwise would alarm every weekend and teach everyone to ignore it.
 *
 * ## Usage
 *
 *   GITHUB_TOKEN=… node scripts/probe-ci-liveness.mjs [--json] [--window-hours=48]
 *
 * Exits 1 when the merge gate is dark.
 */

import { didExecute, darkStreak, githubJson } from './lib/liveness.mjs'

const REPO = process.env.GITHUB_REPOSITORY ?? 'sannguyen01/Healthy-Jewelry'
const WORKFLOW = 'ci.yml'

/** The branch that matters: what Vercel deploys, and what merges land on. */
export const BRANCH = 'main'

/**
 * The step whose execution means the gate evaluated the repository.
 *
 * One name, deliberately — see the header on why demanding the full set would fire on
 * every ordinary red build.
 */
export const REQUIRED_STEPS = ['Lint']

/**
 * How far back the gate must have evaluated something.
 *
 * Not derived from a cron, because `ci.yml` has none. 48h is the same policy number
 * `lib/smoke-schedule.mjs` argues for and for the same reason: one weekend minus a margin,
 * so a Friday-evening breakage is loud before Monday. The real outage ran ~13h before
 * anyone looked and would have been caught well inside this window.
 */
export const DEFAULT_WINDOW_HOURS = 48

/**
 * The verdict, from run and step data alone, so it can be pointed at known answers without
 * a network — the property [ADR 024](../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)
 * exists to require.
 *
 * @param {object} input
 * @param {Array<{ id: number, created_at: string, conclusion: string | null }>} input.runs
 *   Newest first, as the Actions API returns them.
 * @param {Record<number, Array<{ name: string, conclusion: string | null }>>} input.stepsByRunId
 * @param {Date} input.now
 * @param {number} [input.windowHours]
 */
export function assessCiLiveness({
  runs,
  stepsByRunId,
  now,
  windowHours = DEFAULT_WINDOW_HOURS,
}) {
  const cutoff = new Date(now.getTime() - windowHours * 3600_000)
  const inWindow = runs.filter((run) => new Date(run.created_at) >= cutoff)

  if (inWindow.length === 0) {
    // Nobody pushed. Not a finding — see the header.
    return {
      verdict: 'idle',
      reason: 'no-runs',
      windowHours,
      runsInWindow: 0,
      summary:
        `No CI run on ${BRANCH} in the last ${windowHours}h. This workflow is triggered by ` +
        `pushes and pull requests rather than a schedule, so that means nothing landed — ` +
        `not that the gate is broken.`,
    }
  }

  const executed = (run) => didExecute(stepsByRunId[run.id], REQUIRED_STEPS)

  const unknown = inWindow.filter((run) => executed(run) === null)
  if (unknown.length === inWindow.length) {
    // A failure of this probe, not a finding about the gate. ADR 010's separation.
    return {
      verdict: 'unevaluable',
      reason: 'no-step-data',
      windowHours,
      runsInWindow: inWindow.length,
      summary:
        `Found ${inWindow.length} CI run(s) on ${BRANCH} in the last ${windowHours}h but ` +
        `could not read step results for any of them. This says nothing about the gate.`,
    }
  }

  const alive = inWindow.filter((run) => executed(run) === true)
  if (alive.length > 0) {
    return {
      verdict: 'lit',
      windowHours,
      runsInWindow: inWindow.length,
      summary:
        `${alive.length} of ${inWindow.length} CI run(s) on ${BRANCH} in the last ` +
        `${windowHours}h actually evaluated the repository.`,
    }
  }

  const streak = darkStreak(runs, stepsByRunId, REQUIRED_STEPS)
  return {
    verdict: 'dark',
    reason: 'gate-not-executed',
    windowHours,
    runsInWindow: inWindow.length,
    streak: streak.count,
    lastExecutedAt: streak.lastExecutedAt,
    summary:
      `${inWindow.length} CI run(s) on ${BRANCH} completed in the last ${windowHours}h and ` +
      `none of them executed ${REQUIRED_STEPS.join(', ')}.\n\n` +
      `The runs are happening. The gate inside them is not — every check reports ` +
      `\`skipped\`, which from outside is indistinguishable from \`success\`. A run that ` +
      `dies in setup is a run that merged nothing safely. ` +
      (streak.count > 0 ? `${streak.count} consecutive run(s) now. ` : '') +
      (streak.lastExecutedAt
        ? `Last real evaluation: ${streak.lastExecutedAt}.`
        : `No run in the fetched history has ever executed it.`),
  }
}

async function main() {
  const windowArgument = process.argv.find((a) => a.startsWith('--window-hours='))
  const windowHours = windowArgument
    ? Number.parseInt(windowArgument.split('=')[1], 10)
    : DEFAULT_WINDOW_HOURS

  let result
  try {
    const { workflow_runs: runs } = await githubJson(
      `/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&per_page=20`
    )
    const stepsByRunId = {}
    for (const run of runs.slice(0, 10)) {
      const { jobs } = await githubJson(`/repos/${REPO}/actions/runs/${run.id}/jobs`)
      stepsByRunId[run.id] = jobs.flatMap((job) => job.steps ?? [])
    }
    result = assessCiLiveness({ runs, stepsByRunId, now: new Date(), windowHours })
  } catch (error) {
    result = {
      verdict: 'unevaluable',
      reason: 'api-unreachable',
      summary: `Could not read the workflow history: ${error.message}`,
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const mark = result.verdict === 'dark' ? '✗' : result.verdict === 'lit' ? '✓' : '?'
    console.log(`${mark} merge gate: ${result.verdict}`)
    console.log('')
    console.log(result.summary)
    if (result.verdict === 'dark') {
      console.log('')
      console.log(
        'This is not the same finding as "CI is failing". A failing gate has evaluated the\n' +
          'code and rejected it, which is the gate working. This one says the gate has not\n' +
          'evaluated anything — so every merge in this window landed unchecked, and the red\n' +
          'X in the Actions tab names a cause that stops people reading further.'
      )
    }
  }

  process.exit(result.verdict === 'dark' ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
