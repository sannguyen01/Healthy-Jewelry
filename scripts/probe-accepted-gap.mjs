#!/usr/bin/env node
/**
 * Reports every accepted control gap that has stopped being restated.
 *
 * ## Why this is a probe and not an assertion in the merge gate
 *
 * It was an assertion in the merge gate, and on 2026-09-15 that turned every pull
 * request in the repository red.
 *
 * `control-registry.test.ts` measured each gap's age against `Date.now()` and failed
 * past `ACCEPTED_GAP_MAX_AGE_DAYS`. `smoke-secret-isolation` was accepted 2026-08-15,
 * so at midnight UTC on day 31 the `verify` job went red — on a GitHub Settings action
 * that no diff can affect, for two pull requests (#66 and #67) whose contents had
 * nothing to do with it. `merge-gate` was on the same fuse for 2026-10-01.
 *
 * The check was right; its severity was not. A wall-clock event is not caused by the
 * change in front of you, so blocking that change communicates nothing to the person
 * who can act and everything to the person who cannot. This repository already uses
 * the correct posture twice for exactly this class — `ci.yml`'s credential audit is
 * `continue-on-error` because "a blocking step would freeze every merge on a hygiene
 * finding nobody can fix from a pull request", and premise drift reports rather than
 * blocks ([ADR 008](../docs/adr/008-decisions-need-premise-detectors.md)).
 *
 * So the age check moves here: scheduled, non-blocking, and addressed to a human by
 * opening an issue. The merge gate keeps the structural assertions a diff *can* break
 * — that `acceptedSince` exists and is well-formed, and that `acceptedWhy` is long
 * enough to be a reason. See [ADR 029](../docs/adr/029-a-governance-clock-is-not-a-merge-gate.md).
 *
 * ## Why a second probe rather than widening `probe-branch-protection.mjs`
 *
 * That probe already escalates a stale acceptance — for `merge-gate` alone. Its
 * `claimed()` reads one hardcoded registry entry, because its subject is branch
 * protection and staleness is one of two reasons it speaks up. Widening it to every
 * accepted control would make a probe named for one control answer questions about all
 * of them, and `smoke-secret-isolation` — the gap that actually went stale — would
 * still have been reported under the `merge-gate-unenforced` label.
 *
 * Two facts, two labels. That is [ADR 011](../docs/adr/011-repeated-identical-failures-must-escalate.md)'s
 * rule, and the reason `merge-gate-dark` and `merge-gate-unenforced` are already
 * separate despite both meaning "the gate did not stop it".
 *
 * `merge-gate`'s own staleness is therefore reported by both, deliberately: the other
 * probe says "branch protection is absent AND the acceptance is stale", this one says
 * "an acceptance is stale". They are different sentences, and the second one is the
 * only one that will ever be true of `smoke-secret-isolation`.
 *
 * ## Exit status
 *
 * **Always 0 when the registry is readable**, whatever it finds. A stale acceptance is
 * a finding to report, never a failure — that is the entire point of moving it here. A
 * non-zero exit is reserved for the probe being unable to do its job at all, which is a
 * defect in this repository rather than a fact about its controls
 * ([ADR 010](../docs/adr/010-a-control-that-cannot-fail.md)'s separation of "this check
 * failed" from "this check could not run").
 *
 * ## Usage
 *
 *   node scripts/probe-accepted-gap.mjs [--json]
 */

import fs from 'node:fs'
import path from 'node:path'

import { ACCEPTED_GAP_MAX_AGE_DAYS, daysSinceAccepted, isStale } from './lib/accepted-gap.mjs'

const REGISTRY = path.resolve(import.meta.dirname, '../docs/controls.json')

/** Written on every run so the workflow's reporting step reads data, never prose. */
const OUTPUT = 'accepted-gap.json'

/** One label, one fact: an acceptance has stopped being restated. */
export const ISSUE_LABEL = 'control-acceptance-stale'
export const ISSUE_TITLE = 'An accepted control gap has stopped being restated'

/**
 * The controls whose gap was consciously accepted rather than closed.
 *
 * Identical selector to `control-registry.test.ts`'s, deliberately: the two must agree
 * about what they are talking about, or moving the age check between them would quietly
 * change its subject.
 *
 * @param {{ controls?: Array<Record<string, unknown>> }} registry
 * @returns {Array<Record<string, unknown>>}
 */
export function acceptedControls(registry) {
  const controls = registry?.controls
  if (!Array.isArray(controls)) return []
  return controls.filter((c) => c?.status === 'not-configured')
}

/**
 * Age every accepted gap, newest-stale first.
 *
 * A control with no `acceptedSince` reads as maximally stale rather than being skipped —
 * `daysSinceAccepted` measures from the epoch for exactly that reason. "Nobody wrote down
 * when this was accepted" is a worse state than "this was accepted a long time ago", and
 * silently passing over it is how an unclassified entry becomes an unverified one
 * ([ADR 019](../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)).
 *
 * @param {Array<Record<string, unknown>>} controls
 * @param {Date | number} [now]
 * @returns {Array<{ id: string, acceptedSince: string | null, days: number, stale: boolean, humanAction: string | null }>}
 */
export function ageAcceptances(controls, now = new Date()) {
  return controls
    .map((control) => ({
      id: typeof control?.id === 'string' ? control.id : '(unnamed control)',
      acceptedSince: typeof control?.acceptedSince === 'string' ? control.acceptedSince : null,
      days: daysSinceAccepted(control, now),
      stale: isStale(control, now),
      humanAction: typeof control?.humanAction === 'string' ? control.humanAction : null,
    }))
    .sort((a, b) => b.days - a.days)
}

/**
 * Whether to say anything, and what.
 *
 * Pure, and exported, because this is the decision that reaches a person — and a
 * decision that reaches a person is the one thing in this repository that must be
 * reachable by a test. `escalationDecision` in `probe-branch-protection.mjs` is a pure
 * function for the same reason; the smoke workflow's equivalent was not, and shipped a
 * comparison that could never match across 124 consecutive runs.
 *
 * @param {{ controls: Array<Record<string, unknown>>, now?: Date | number }} input
 * @returns {{
 *   escalate: boolean,
 *   stale: Array<{ id: string, days: number, acceptedSince: string | null, humanAction: string | null }>,
 *   aged: ReturnType<typeof ageAcceptances>,
 *   detail: string,
 *   title: string,
 *   body: string | null,
 * }}
 */
export function escalationDecision({ controls, now = new Date() }) {
  const aged = ageAcceptances(controls, now)
  const stale = aged.filter((entry) => entry.stale)

  if (aged.length === 0) {
    return {
      escalate: false,
      stale: [],
      aged,
      detail:
        'No control in the registry carries an accepted gap. Nothing to age. If this is ' +
        'unexpected, the registry selector and the registry have disagreed about what ' +
        '"accepted" means.',
      title: ISSUE_TITLE,
      body: null,
    }
  }

  if (stale.length === 0) {
    const oldest = aged[0]
    return {
      escalate: false,
      stale: [],
      aged,
      detail:
        `${aged.length} accepted gap${aged.length === 1 ? '' : 's'}, all restated inside ` +
        `the ${ACCEPTED_GAP_MAX_AGE_DAYS}-day window. Oldest is "${oldest.id}" at ` +
        `${oldest.days} days.`,
      title: ISSUE_TITLE,
      body: null,
    }
  }

  return {
    escalate: true,
    stale,
    aged,
    detail:
      `${stale.length} accepted gap${stale.length === 1 ? ' has' : 's have'} passed the ` +
      `${ACCEPTED_GAP_MAX_AGE_DAYS}-day restatement window: ` +
      stale.map((entry) => `${entry.id} (${entry.days}d)`).join(', '),
    title: ISSUE_TITLE,
    body: composeBody(stale),
  }
}

/**
 * The issue body, composed here rather than in the workflow.
 *
 * The workflow step that posts this is a transport: it reads a file, creates or updates
 * an issue, and closes it again. It contains no sentence of its own, because a sentence
 * inside a YAML string literal is a sentence no test can read.
 *
 * @param {Array<{ id: string, days: number, acceptedSince: string | null, humanAction: string | null }>} stale
 * @returns {string}
 */
export function composeBody(stale) {
  const rows = stale.map(
    (entry) =>
      `| \`${entry.id}\` | ${entry.acceptedSince ?? '**never recorded**'} | ${entry.days} |`
  )

  const actions = stale
    .filter((entry) => entry.humanAction)
    .map((entry) => [`### \`${entry.id}\``, '', entry.humanAction ?? '', ''].join('\n'))

  return [
    'One or more accepted control gaps have not been restated inside the',
    `${ACCEPTED_GAP_MAX_AGE_DAYS}-day window the registry allows.`,
    '',
    '| Control | Accepted since | Days |',
    '|---|---|---|',
    ...rows,
    '',
    '**This is not a deadline for fixing the gap. It is a deadline for deciding again.**',
    'Either close the gap, or update `acceptedSince` and `acceptedWhy` in',
    '`docs/controls.json` to say it is still a deliberate choice. "Accepted" that nobody',
    'restates is indistinguishable from "forgotten", and the probe watching it stays quiet',
    'in either case — which is the state `merge-gate` was in while eleven commits reached',
    '`main` unverified.',
    '',
    '## What each one needs from a person',
    '',
    ...actions,
    '---',
    '',
    'This issue is opened and updated by `scripts/probe-accepted-gap.mjs` on the',
    '`control-audit.yml` schedule, and closed automatically once every acceptance is',
    'inside the window again. It deliberately does **not** block the merge gate: a',
    'wall-clock event is not caused by the change in front of you, and blocking that',
    'change reaches the one person who cannot act on it. See',
    '[ADR 029](../blob/main/docs/adr/029-a-governance-clock-is-not-a-merge-gate.md).',
  ].join('\n')
}

function main() {
  let registry
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  } catch (error) {
    // The probe could not run. Distinct from "the probe ran and found nothing", and the
    // only condition here entitled to a non-zero exit.
    console.error(`✗ accepted-gap: could not read ${REGISTRY}`)
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(1)
  }

  const controls = acceptedControls(registry)
  const decision = escalationDecision({ controls })

  const payload = {
    control: 'accepted-gap',
    maxAgeDays: ACCEPTED_GAP_MAX_AGE_DAYS,
    label: ISSUE_LABEL,
    ...decision,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2))

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(`${decision.escalate ? '✗' : '✓'} accepted-gap: ${decision.detail}`)
    console.log('')
    for (const entry of decision.aged) {
      const mark = entry.stale ? '✗' : '✓'
      const since = entry.acceptedSince ?? 'never recorded'
      console.log(`  ${mark} ${entry.id} — accepted ${since} (${entry.days}d)`)
    }
  }

  // Always 0. Staleness reports; it does not fail. That is the change this file exists
  // to make, and a probe that exited 1 here would have recreated the merge freeze in a
  // scheduled job instead of in the gate.
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
