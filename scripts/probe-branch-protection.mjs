#!/usr/bin/env node
/**
 * Reads `main`'s branch protection from GitHub and compares it against what
 * `docs/controls.json` claims.
 *
 * ## Why a probe and not a paragraph
 *
 * Five documents in this repository asserted that `main` required `verify` and `e2e`.
 * None of them was checked against anything, and all five were wrong for as long as
 * they existed — `main` has never been protected. The merge record shows PR #34
 * squash-merged 4m37s after its own E2E job concluded failure.
 *
 * A sixth document saying the opposite fixes nothing durable. What fixes it is this:
 * something that asks GitHub, on a schedule, and reports the answer whatever it is.
 * See docs/adr/018-a-claim-about-a-control-is-not-a-control.md.
 *
 * ## Three outcomes, not two
 *
 * `GET /branches/main/protection` returns **404 when a branch is not protected**. Read
 * carelessly that is an error, and an error is the one result a monitoring script is
 * most likely to swallow — which would turn "there is no gate at all" into "the check
 * could not run", the exact laundering ADR 006 is about. So:
 *
 *   · `enforced`   — protection exists and requires precisely the documented contexts
 *   · `absent`     — no protection (the 404), reported as a finding, never as an error
 *   · `mismatched` — protection exists but requires a different set
 *
 * Only a transport or auth failure is `unevaluable`, and that is a fourth state kept
 * deliberately distinct from `absent` — ADR 010's separation of "this check failed"
 * from "this check could not run".
 *
 * ## Usage
 *
 *   GITHUB_TOKEN=… node scripts/probe-branch-protection.mjs [--json]
 *
 * Exits 0 when the registry and GitHub agree — including when both say the gate is
 * absent, because a truthful "not-configured" is a consistent state, not a failure.
 * Exits 1 when they disagree, which is the only thing this script is entitled to call
 * wrong: whether protection *should* exist is a human's decision, recorded in the
 * registry's `status`.
 */

import fs from 'node:fs'
import path from 'node:path'

import { ACCEPTED_GAP_MAX_AGE_DAYS, daysSinceAccepted, isStale } from './lib/accepted-gap.mjs'

const REGISTRY = path.resolve(import.meta.dirname, '../docs/controls.json')
const REPO = process.env.GITHUB_REPOSITORY ?? 'sannguyen01/Healthy-Jewelry'
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const BRANCH = 'main'
/** Written on every run so the workflow's reporting step reads data, not prose. */
const OUTPUT = 'merge-gate.json'

/** @returns {{ requiredContexts: string[], status: string }} */
function claimed() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  const gate = registry.controls.find((c) => c.id === 'merge-gate')
  if (!gate) {
    throw new Error('docs/controls.json has no merge-gate control. Nothing to compare against.')
  }
  return {
    requiredContexts: gate.requiredContexts ?? [],
    status: gate.status,
    acceptedSince: gate.acceptedSince,
    humanAction: gate.humanAction,
  }
}

/**
 * @returns {Promise<{ state: 'protected' | 'absent' | 'unevaluable', contexts: string[], detail: string }>}
 */
async function actual() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return {
      state: 'unevaluable',
      contexts: [],
      detail:
        'GITHUB_TOKEN is not set. Protection state is readable only with a token that has ' +
        'repository administration read access; without one this probe cannot distinguish ' +
        'an unprotected branch from an unreadable one, and must not guess.',
    }
  }

  let response
  try {
    response = await fetch(`${API}/repos/${REPO}/branches/${BRANCH}/protection`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'healthy-jewelry-control-audit',
      },
    })
  } catch (error) {
    return { state: 'unevaluable', contexts: [], detail: `Request failed: ${error.message}` }
  }

  // The load-bearing branch. GitHub answers "this branch has no protection" with a 404,
  // and a 404 handled as an error is how "there is no gate" becomes "we could not tell".
  if (response.status === 404) {
    return {
      state: 'absent',
      contexts: [],
      detail: `${BRANCH} has no branch protection rule. GitHub reports this as 404.`,
    }
  }

  if (response.status === 403 || response.status === 401) {
    return {
      state: 'unevaluable',
      contexts: [],
      detail:
        `GitHub returned ${response.status}. The token cannot read protection settings — ` +
        `this needs administration:read on the repository. Not the same as unprotected.`,
    }
  }

  if (!response.ok) {
    return {
      state: 'unevaluable',
      contexts: [],
      detail: `GitHub returned ${response.status} ${response.statusText}.`,
    }
  }

  const body = await response.json()
  const contexts = body?.required_status_checks?.contexts ?? []
  return {
    state: 'protected',
    contexts,
    detail: `${BRANCH} is protected and requires ${contexts.length} status check(s).`,
  }
}

/**
 * @param {{ requiredContexts: string[], status: string }} claim
 * @param {{ state: string, contexts: string[], detail: string }} observed
 */
export function verdict(claim, observed) {
  if (observed.state === 'unevaluable') {
    return {
      verdict: 'unevaluable',
      agrees: null,
      summary: observed.detail,
    }
  }

  if (observed.state === 'absent') {
    const agrees = claim.status === 'not-configured'
    return {
      verdict: 'absent',
      agrees,
      summary: agrees
        ? 'No branch protection on main, and docs/controls.json says so. Consistent — and ' +
          'still the highest-value unclosed item in this repository: main auto-deploys to ' +
          'production, so the merge button is the deploy button with nothing in between.'
        : 'docs/controls.json claims the merge gate is configured. It is not. That is the ' +
          'exact failure ADR 015 recorded, reintroduced.',
    }
  }

  const expected = [...claim.requiredContexts].sort()
  const found = [...observed.contexts].sort()
  const same = expected.length === found.length && expected.every((c, i) => c === found[i])

  if (!same) {
    return {
      verdict: 'mismatched',
      agrees: false,
      summary:
        `main is protected, but requires a different set of checks than the registry names.\n` +
        `  registry: ${expected.join(', ') || '(none)'}\n` +
        `  GitHub:   ${found.join(', ') || '(none)'}\n` +
        `A context GitHub requires that no job publishes blocks every pull request forever.`,
    }
  }

  return {
    verdict: 'enforced',
    agrees: claim.status === 'configured',
    summary:
      claim.status === 'configured'
        ? `main requires exactly the documented contexts: ${found.join(', ')}.`
        : `main is correctly protected, but docs/controls.json still says "not-configured". ` +
          `Update the registry — a stale registry is the thing this probe exists to prevent.`,
  }
}

/**
 * How many consecutive green runs on `main` count as "there is now a passing run to enforce
 * against" — the precondition ADR 015 named for enabling protection at all.
 *
 * Four, not one. A single green run after a red streak is as likely to be the flake as the
 * recovery, and this alarm is only worth having if people believe it (ADR 011).
 */
export const PRECONDITION_GREEN_RUNS = 4

/**
 * **Whether the absence of a merge gate should reach a person right now.**
 *
 * Separate from `verdict()` on purpose, and it does not change the exit code. The probe's
 * exit semantics are correct as they stand: "absent, and the registry honestly says so" is a
 * *consistent* state, and failing a scheduled audit over a console action nobody in CI can
 * perform would make the audit a permanent red that people learn to ignore.
 *
 * But consistent is not the same as fine, and until now that finding went into a log file
 * and stopped. `smoke-liveness` and `ci-liveness` each open a labelled issue; the merge gate
 * — the single highest-value unclosed item in this repository, and the reason eleven commits
 * reached `main` unverified on 2026-08-29 — had no channel at all. This is that channel's
 * decision, extracted so it can be pointed at a known answer (ADR 024).
 *
 * Two reasons fire, and only on `absent`:
 *
 *   · `stale-acceptance`  — the gap has not been consciously restated inside
 *     ACCEPTED_GAP_MAX_AGE_DAYS. `control-registry.test.ts` already asserts this, but it
 *     asserts it *in the merge gate*, which is the thing that does not exist. A deadline
 *     enforced only by the absent control is not a deadline.
 *   · `precondition-met` — ADR 015 said protection was "only reasonable once a passing run
 *     existed to enforce against". That is now true, so the one stated blocker is gone and
 *     somebody should be told rather than left to notice.
 *
 * Never on `enforced` (nothing to say), `mismatched` (already exits 1 and fails loudly), or
 * `unevaluable` — ADR 010's separation of "this check failed" from "this check could not
 * run" has to survive here too, or an expired token becomes an alarm about branch protection.
 *
 * @param {{
 *   verdict: string,
 *   control: { acceptedSince?: string, humanAction?: string },
 *   ciConclusions: string[] | null,
 *   now?: Date,
 * }} input
 * @returns {{ escalate: boolean, reason: 'stale-acceptance' | 'precondition-met' | null, detail: string }}
 */
export function escalationDecision({ verdict: state, control, ciConclusions, now = new Date() }) {
  if (state !== 'absent') {
    return {
      escalate: false,
      reason: null,
      detail: `Verdict is "${state}". This alarm speaks only for an absent gate.`,
    }
  }

  if (isStale(control, now)) {
    const days = daysSinceAccepted(control, now)
    return {
      escalate: true,
      reason: 'stale-acceptance',
      detail:
        `The gap was last consciously accepted ${days} days ago, over the ` +
        `${ACCEPTED_GAP_MAX_AGE_DAYS}-day limit. "Accepted" that nobody restates is ` +
        `indistinguishable from "forgotten".`,
    }
  }

  // `null` means the run history could not be read. That is not evidence of anything, and
  // inventing a precondition from an absence is the laundering ADR 006 is about.
  if (Array.isArray(ciConclusions) && ciConclusions.length >= PRECONDITION_GREEN_RUNS) {
    const window = ciConclusions.slice(0, PRECONDITION_GREEN_RUNS)
    if (window.every((c) => c === 'success')) {
      return {
        escalate: true,
        reason: 'precondition-met',
        detail:
          `The last ${PRECONDITION_GREEN_RUNS} CI runs on ${BRANCH} all passed, so the one ` +
          `blocker ADR 015 named — "only reasonable once a passing run existed to enforce ` +
          `against" — no longer holds.`,
      }
    }
  }

  return {
    escalate: false,
    reason: null,
    detail:
      'The gap is absent, documented, recently restated, and there is no fresh run of green ' +
      'CI to enforce against. Nothing new to say.',
  }
}

/**
 * The conclusions of the most recent completed `ci.yml` runs on `main`, newest first.
 *
 * Returns `null` on any failure. A history that could not be read must not read as a
 * history of failures, and must not read as a history of successes either.
 *
 * @returns {Promise<string[] | null>}
 */
async function recentCiConclusions() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  try {
    const response = await fetch(
      `${API}/repos/${REPO}/actions/workflows/ci.yml/runs` +
        `?branch=${BRANCH}&status=completed&per_page=${PRECONDITION_GREEN_RUNS}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'healthy-jewelry-control-audit',
        },
      }
    )
    if (!response.ok) return null
    const body = await response.json()
    const runs = body?.workflow_runs
    if (!Array.isArray(runs)) return null
    return runs.map((run) => run?.conclusion ?? 'unknown')
  } catch {
    return null
  }
}

async function main() {
  const claim = claimed()
  const observed = await actual()
  const result = verdict(claim, observed)

  // Only asked when the answer can matter. An enforced or unreadable gate escalates
  // nothing, and a request made to decide nothing is a request that can only fail.
  const ciConclusions = result.verdict === 'absent' ? await recentCiConclusions() : null
  const escalation = escalationDecision({
    verdict: result.verdict,
    control: claim,
    ciConclusions,
  })

  const payload = {
    control: 'merge-gate',
    ...result,
    registryStatus: claim.status,
    registryContexts: claim.requiredContexts,
    observedState: observed.state,
    observedContexts: observed.contexts,
    detail: observed.detail,
    escalation,
    humanAction: claim.humanAction ?? null,
    recentCiConclusions: ciConclusions,
  }

  // Always written, whatever the verdict, and always as data. The reporting step in
  // control-audit.yml reads this file rather than scraping the human-readable output —
  // an alarm that parses prose is an alarm that goes quiet when the prose is reworded.
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2))

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    const mark = result.agrees === false ? '✗' : result.agrees === null ? '?' : '✓'
    console.log(`${mark} merge-gate: ${result.verdict}`)
    console.log('')
    console.log(result.summary)
    // Not when the summary already is the detail — an unevaluable verdict carries it
    // verbatim, and a message printed twice reads as two findings.
    if (observed.detail && observed.state === 'absent') {
      console.log('')
      console.log(observed.detail)
    }
    if (escalation.escalate) {
      console.log('')
      console.log(`ESCALATE (${escalation.reason}): ${escalation.detail}`)
    }
  }

  // Disagreement between the registry and reality is the only failure. "Absent and
  // honestly documented" exits 0 — enabling protection is a console action, and a
  // blocking check on a state only a human can change is a permanent merge freeze.
  process.exit(result.agrees === false ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
