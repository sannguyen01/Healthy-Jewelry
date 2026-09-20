#!/usr/bin/env node
/**
 * A dead-man's switch for the production verification tier.
 *
 * ## Why absence needs its own alarm
 *
 * `production-smoke.yml` has run every six hours since 2026-08-21 and has failed at the
 * preflight step on every one of them — a `SHOPIFY_ADMIN_ACCESS_TOKEN` holding the wrong
 * kind of token. Thirty-plus consecutive runs. Issue #24 has been open since 2026-08-15
 * with 32 comments, correctly escalated, correctly labelled `human-required`.
 *
 * All of that worked. What nobody was told is the part that matters: because the preflight
 * fails, **the checks downstream of it have not executed once in that window.** Run
 * 33120472571 is the shape of every one of them —
 *
 *     Preflight            failure
 *     Live store and storefront   skipped
 *     Webhook signing secret      skipped
 *
 * — and it completed in six seconds. The fabricated-catalogue detector, which is the only
 * thing standing between customers and a static placeholder catalogue with unsellable
 * variant IDs, and `classifyPhotographyCoverage`, which watches the one open item this
 * storefront's whole premise rests on, have both been dark since 2026-08-15.
 *
 * From outside, a skipped job is indistinguishable from a passing one. The Actions tab
 * shows a red X whose *cause* is a credential, so a reader stops there, fixes nothing, and
 * never learns that the real checks never ran. Every existing control in this repository
 * reports the **presence of a failure**. None reports the **absence of a success**.
 *
 * See docs/adr/022-absence-needs-its-own-alarm.md.
 *
 * ## Usage
 *
 *   GITHUB_TOKEN=… node scripts/probe-smoke-liveness.mjs [--json] [--window-hours=26]
 *
 * Exits 1 when the verification tier is dark, or has just stopped.
 */

import { SMOKE_CRON_INTERVAL_HOURS } from './lib/smoke-schedule.mjs'
import { EXECUTED_CONCLUSIONS, didExecute, darkStreak, githubJson } from './lib/liveness.mjs'

const REPO = process.env.GITHUB_REPOSITORY ?? 'sannguyen01/Healthy-Jewelry'
const WORKFLOW = 'production-smoke.yml'

/**
 * The steps whose **execution** means production was actually looked at.
 *
 * Deliberately not the job's own conclusion. A job that fails at the preflight *is* a
 * completed run, and counting it would satisfy "a run happened" while proving nothing —
 * which is the entire failure this probe exists to name.
 *
 * And deliberately not the step's *success*, which is what this asserted until
 * 2026-08-29. The question here is "has anything looked at the live store?", and a step
 * that ran and reported real findings has looked. Requiring success would mean the alarm
 * stays lit for as long as production has a problem — conflating *nobody is checking* with
 * *somebody checked and did not like what they found*, which are opposite situations with
 * opposite remedies. The first is this probe's subject; the second is what the smoke run's
 * own failure issue is for.
 *
 * That distinction became load-bearing when each live step started gating on its own
 * credentials rather than on the preflight's verdict: a run with one wrong Admin token now
 * executes the twelve checks that never read it and fails on the five that do. Verification
 * is happening. An alarm insisting otherwise would be a control reporting something other
 * than the truth — the failure this whole family of tools exists to prevent.
 *
 * See docs/adr/026-a-capability-is-not-a-verdict.md.
 */
export const REQUIRED_STEPS = ['Live store and storefront']

/**
 * Re-exported so this probe's public surface is unchanged by the extraction. The reasoning
 * for which conclusions count lives in `lib/liveness.mjs`, beside the shared predicate.
 */
export { EXECUTED_CONCLUSIONS }

/**
 * How far back a successful check must have happened. Four scheduled slots plus margin,
 * so a single missed or delayed run does not raise an alarm but a stopped tier does.
 * `src/tests/unit/heartbeat-window.test.ts` holds this against the workflow's own cron.
 */
export const DEFAULT_WINDOW_HOURS = 26

/**
 * The verdicts that exit non-zero, and so open the `verification-dark` issue.
 *
 * Named rather than compared inline in three places. `control-audit.yml` gates its reporting
 * step on this script's **exit code** (`steps.smoke-liveness.outcome == 'failure'`) and uses
 * the printed output as the issue body, so adding a verdict here is the whole wiring — no
 * workflow change, and none of the inline-script budget that
 * [ADR 030](../docs/adr/030-an-equivalence-relation-is-the-control.md) exists to keep down.
 *
 * `unevaluable` is deliberately absent: an API this probe could not reach is a failure of the
 * probe, never a finding about the tier ([ADR 010](../docs/adr/010-a-control-that-cannot-fail.md)).
 */
export const ALARMING_VERDICTS = ['dark', 'stopped']

/**
 * The verdict, computed from run and step data alone so it can be exercised against real
 * history without a network.
 *
 * @param {object} input
 * @param {Array<{ id: number, created_at: string, conclusion: string | null }>} input.runs
 *   Newest first, as the Actions API returns them.
 * @param {Record<number, Array<{ name: string, conclusion: string | null }>>} input.stepsByRunId
 * @param {Date} input.now
 * @param {number} [input.windowHours]
 */
export function assessLiveness({ runs, stepsByRunId, now, windowHours = DEFAULT_WINDOW_HOURS }) {
  const cutoff = new Date(now.getTime() - windowHours * 3600_000)
  const inWindow = runs.filter((run) => new Date(run.created_at) >= cutoff)

  /** Did this run actually execute the checks? `null` when step data is unknown. */
  const executed = (run) => didExecute(stepsByRunId[run.id], REQUIRED_STEPS)

  if (inWindow.length === 0) {
    return {
      verdict: 'dark',
      reason: 'no-runs',
      windowHours,
      runsInWindow: 0,
      summary:
        `No production-smoke run at all in the last ${windowHours}h. The workflow is ` +
        `scheduled every ${SMOKE_CRON_INTERVAL_HOURS}h, so this is not a slow run — it is ` +
        `a tier that has stopped. Nothing is watching the live store.`,
      lastExecutedAt: lastExecution(runs, stepsByRunId),
    }
  }

  const unknown = inWindow.filter((run) => executed(run) === null)
  if (unknown.length === inWindow.length) {
    // Step data could not be read for anything in the window. That is a failure of this
    // probe, not a finding about the tier, and the two must not be reported as one.
    return {
      verdict: 'unevaluable',
      reason: 'no-step-data',
      windowHours,
      runsInWindow: inWindow.length,
      summary:
        `Found ${inWindow.length} run(s) in the last ${windowHours}h but could not read ` +
        `step results for any of them. This says nothing about the verification tier.`,
    }
  }

  const alive = inWindow.filter((run) => executed(run) === true)

  // A tier that *stops* is news at the moment it stops, not `windowHours` later when the
  // last executing run ages out.
  //
  // This gap is not hypothetical and it has a date. Production-smoke run #154
  // (2026-09-19T15:35Z) executed the checks and reported real findings; run #155
  // (2026-09-19T20:14Z) skipped them and reported **success**, because the five secrets in
  // the `production-readonly` environment had been emptied in between and
  // `preflight-secrets.mjs` reads all-absent as `not-configured` — a state it deliberately
  // treats as "nobody has set this up yet, which is not news". At the 20:47 control audit
  // #154 was still inside the 26h window, so `alive.length > 0` held and this function
  // returned `lit`. Correct by its own definition, and 26 hours late.
  //
  // `not-configured` used to mean *never configured*. During a decommission it also means
  // *de-configured*, which is the opposite kind of event. The evidence distinguishing them
  // is already in the history this probe reads: a tier that never started has no executing
  // run behind it, and a tier that stopped does.
  //
  // Kept separate from `dark` for the same reason `dark` is kept separate from
  // `unevaluable` — the remedies differ. `dark` says nothing has looked for a long time and
  // somebody should find out why. `stopped` says something changed very recently, names the
  // last run that worked, and points at whoever made that change. Both exit non-zero and
  // both reach the same `verification-dark` issue; only the words differ, and the words are
  // what a reader acts on.
  //
  // See docs/adr/033-a-premise-that-expired-mid-decommission.md.
  //
  // `inWindow[0]` is the newest run because `runs` arrives newest-first from the Actions API
  // and `filter` preserves order. That ordering was incidental before this branch and is now
  // load-bearing, so it is stated here as well as in the `@param` — a `sort` added upstream
  // for tidiness would silently invert this verdict, and nothing else in the function cares.
  const newestInWindow = inWindow[0]
  if (executed(newestInWindow) === false && alive.length > 0) {
    const streak = darkStreak(runs, stepsByRunId, REQUIRED_STEPS)
    return {
      verdict: 'stopped',
      reason: 'checks-stopped-executing',
      windowHours,
      runsInWindow: inWindow.length,
      streak: streak.count,
      lastExecutedAt: streak.lastExecutedAt,
      summary:
        `The most recent production-smoke run did not execute ` +
        `${REQUIRED_STEPS.join(', ')}, and an earlier run in the last ${windowHours}h did.\n\n` +
        `Verification has just stopped. ` +
        (streak.lastExecutedAt
          ? `The last run that actually checked the live store was ${streak.lastExecutedAt}; ` +
            `${streak.count} run(s) since then have skipped it. `
          : '') +
        `A skipped step reports the same green as a passing one, so the workflow's own ` +
        `conclusion will not say this. Something changed the tier's inputs — most often the ` +
        `smoke secrets being removed or rescoped — and this is the run to look at.`,
    }
  }

  if (alive.length > 0) {
    return {
      verdict: 'lit',
      windowHours,
      runsInWindow: inWindow.length,
      summary:
        `${alive.length} of ${inWindow.length} run(s) in the last ${windowHours}h actually ` +
        `checked the live store.`,
    }
  }

  // Runs are happening and the checks are not. The interesting case, and the one that
  // has been true since 2026-08-15.
  const streak = darkStreak(runs, stepsByRunId, REQUIRED_STEPS)
  return {
    verdict: 'dark',
    reason: 'checks-not-executed',
    windowHours,
    runsInWindow: inWindow.length,
    streak: streak.count,
    lastExecutedAt: streak.lastExecutedAt,
    summary:
      `${inWindow.length} production-smoke run(s) completed in the last ${windowHours}h and ` +
      `none of them executed ${REQUIRED_STEPS.join(', ')}.\n\n` +
      `The runs are happening. The checks inside them are not — they report ` +
      `\`skipped\`, which from outside is indistinguishable from \`success\`. ` +
      (streak.count > 0 ? `${streak.count} consecutive run(s) now. ` : '') +
      (streak.lastExecutedAt
        ? `Last real check: ${streak.lastExecutedAt}.`
        : `No run in the fetched history has ever executed them.`),
  }
}

function lastExecution(runs, stepsByRunId) {
  return darkStreak(runs, stepsByRunId, REQUIRED_STEPS).lastExecutedAt
}

async function main() {
  const windowArgument = process.argv.find((a) => a.startsWith('--window-hours='))
  const windowHours = windowArgument
    ? Number.parseInt(windowArgument.split('=')[1], 10)
    : DEFAULT_WINDOW_HOURS

  let result
  try {
    const { workflow_runs: runs } = await githubJson(
      `/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=20`
    )
    const stepsByRunId = {}
    for (const run of runs.slice(0, 10)) {
      const { jobs } = await githubJson(`/repos/${REPO}/actions/runs/${run.id}/jobs`)
      stepsByRunId[run.id] = jobs.flatMap((job) => job.steps ?? [])
    }
    result = assessLiveness({ runs, stepsByRunId, now: new Date(), windowHours })
  } catch (error) {
    // Cannot reach the API. Not a finding about the tier — ADR 010's separation again.
    result = {
      verdict: 'unevaluable',
      reason: 'api-unreachable',
      summary: `Could not read the workflow history: ${error.message}`,
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const alarming = ALARMING_VERDICTS.includes(result.verdict)
    const mark = result.verdict === 'lit' ? '✓' : alarming ? '✗' : '?'
    console.log(`${mark} production verification: ${result.verdict}`)
    console.log('')
    console.log(result.summary)
    if (alarming) {
      console.log('')
      console.log(
        result.verdict === 'stopped'
          ? 'This is not the same finding as "production smoke is failing". That issue names a\n' +
              'credential. This one names the moment verification stopped happening at all —\n' +
              'a change the workflow\'s own green conclusion cannot report, because a skipped\n' +
              'step and a passing one look identical from outside. Start with whatever changed\n' +
              'the tier\'s inputs just before the run above.'
          : 'This is not the same finding as "production smoke is failing". That issue names a\n' +
              'credential. This one names the fact that nothing has looked at the live store\n' +
              'since it broke — which is why it gets its own channel rather than a 33rd comment\n' +
              'on a thread people have already learned to skip.'
      )
    }
  }

  process.exit(ALARMING_VERDICTS.includes(result.verdict) ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
