import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { conditions as parseConditions } from '../support/parsers'

/**
 * **An `if:` that asks about another step must say when it wants to run.**
 *
 * ## The platform semantic this exists because of
 *
 * GitHub ANDs `success()` onto any step or job `if:` that names no status function. So a
 * condition written to ask *"is this configured?"* silently also asks *"did everything
 * before me succeed?"*, and the two questions have nothing to do with each other.
 *
 * `production-smoke.yml` shipped `if: steps.preflight.outputs.configured == 'true'` on
 * every live check. The preflight failed on a bad credential, the implicit `success()` went
 * false, and **thirteen checks reported `skipped` for fourteen days** — twelve of which
 * never read that credential at all. #46 fixed it by gating each check on the capability it
 * actually needs.
 *
 * That was one instance, found while investigating a different symptom. This file exists
 * because finding an instance by accident does not retire the class, and the same footgun
 * was still sitting in `control-audit.yml`:
 *
 *     - name: Report a dark verification tier
 *       if: steps.smoke-liveness.outcome == 'failure'
 *
 * Read plainly, that says "report when the tier is dark". Read as GitHub evaluates it, it
 * says "report when the tier is dark **and nothing above me failed**". It happened to work,
 * for a reason written nowhere near it: every preceding step sets `continue-on-error: true`,
 * which keeps the job green so the implicit `success()` stays true. Delete one
 * `continue-on-error` — an edit that reads like tightening a control — and the alarm that
 * reports dark alarms goes dark itself, silently, which is
 * [ADR 022](../../../docs/adr/022-absence-needs-its-own-alarm.md)'s subject arriving one
 * level up.
 *
 * ## Why this parses rather than greps
 *
 * A regex over `if:` lines would have unknown coverage
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)) and would
 * miss job-level conditions, block scalars, and anything a future workflow writes in a
 * shape nobody anticipated. `workflow-validity.test.ts` already added `yaml` as a
 * devDependency for exactly this argument, so the document is walked instead.
 *
 * ## Why there is an allowlist rather than a narrower rule
 *
 * Some conditions genuinely want the implicit `success()` — the Playwright cache-hit pair
 * in `ci.yml` should not run when the job is already failing. Those are enumerated below
 * with a reason each, because the alternative is a cleverer predicate that tries to infer
 * intent, and a guardrail that guesses is the thing ADR 007 warns about. An exemption that
 * has to be written down is an exemption someone has decided;
 * [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md) makes the
 * same argument about colour tokens, and for the same reason: there is no third state
 * between "classified" and "unverified".
 *
 * See [ADR 027](../../../docs/adr/027-governance-and-execution-are-different-questions.md).
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

/** The functions that make a condition's execution intent explicit. */
const STATUS_FUNCTIONS = ['success()', 'failure()', 'always()', 'cancelled()']

/**
 * Context references whose value says nothing about whether the job is still healthy —
 * so an `if:` reading one is asking a question the implicit `success()` does not answer.
 */
const DECOUPLED_REFERENCES = /\b(steps|needs)\.[\w-]+\.(outcome|conclusion|outputs|result)\b/

/**
 * Conditions that genuinely mean "…and only if we are still on the happy path".
 *
 * Keyed by workflow and the exact condition text, so an edit to the condition invalidates
 * its own exemption rather than inheriting it.
 */
const INTENTIONAL_IMPLICIT_SUCCESS: Record<string, Record<string, string>> = {
  'ci.yml': {
    "steps.playwright-cache.outputs.cache-hit != 'true'":
      'Installing browsers on a cache miss. If an earlier step in this job failed there ' +
      'is nothing to test, so inheriting success() is the wanted behaviour.',
    "steps.playwright-cache.outputs.cache-hit == 'true'":
      'The cache-hit half of the same pair — installs only the OS packages the cache ' +
      'cannot hold. Same reasoning.',
  },
}

type Step = { name?: string; if?: unknown }
type Job = { if?: unknown; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
}

/** Every `if:` in one workflow file. The reader itself lives in `../support/parsers`. */
function conditions(file: string) {
  return parseConditions(readFileSync(join(WORKFLOWS, file), 'utf8'))
}

describe('workflow conditions are parseable at all', () => {
  it('finds workflows', () => {
    // Without this, a moved directory makes every assertion below vacuously true —
    // the shape of green that proves nothing.
    expect(workflowFiles().length).toBeGreaterThan(0)
  })

  it('finds conditions to check', () => {
    const total = workflowFiles().flatMap(conditions).length
    expect(
      total,
      'No `if:` conditions were found in any workflow. Either the parser stopped ' +
        'walking the document shape, or the workflows moved. Both make this file a ' +
        'test that cannot fail (ADR 020).'
    ).toBeGreaterThan(0)
  })
})

describe('an if: that reads another step names its status function', () => {
  it.each(workflowFiles())('%s', (file) => {
    const exempt = INTENTIONAL_IMPLICIT_SUCCESS[file] ?? {}

    const offenders = conditions(file).filter(({ condition }) => {
      if (!DECOUPLED_REFERENCES.test(condition)) return false
      if (STATUS_FUNCTIONS.some((fn) => condition.includes(fn))) return false
      return !(condition in exempt)
    })

    expect(
      offenders,
      `${file} has ${offenders.length} condition(s) that read another step's result ` +
        'without saying when they want to run:\n\n' +
        offenders.map((o) => `  ${o.where}\n    if: ${o.condition}`).join('\n\n') +
        '\n\nGitHub ANDs `success()` onto an `if:` that names no status function, so each ' +
        'of these silently also requires that nothing earlier in the job failed — which ' +
        'is not what any of them are asking about.\n\n' +
        'Prefix with the intent you actually mean, usually `always() && …` for a step ' +
        'that reports on a failure, or `failure() && …` for one that only runs after ' +
        'one. If the implicit `success()` genuinely is wanted, add the condition to ' +
        'INTENTIONAL_IMPLICIT_SUCCESS in this file with the reason, so the exemption is ' +
        'a decision on the record rather than an oversight that looks identical to one.'
    ).toEqual([])
  })
})

describe('the allowlist cannot rot', () => {
  it.each(Object.keys(INTENTIONAL_IMPLICIT_SUCCESS))('%s still contains its exemptions', (file) => {
    // An exemption for a condition that no longer exists is dead weight that would
    // silently start covering a *different* future condition with the same text.
    const present = new Set(conditions(file).map((c) => c.condition))
    const stale = Object.keys(INTENTIONAL_IMPLICIT_SUCCESS[file]).filter((c) => !present.has(c))

    expect(
      stale,
      `These conditions are exempted in this test but no longer appear in ${file}:\n\n  ` +
        stale.join('\n  ') +
        '\n\nDelete the entries. A stale exemption is indistinguishable from a live one.'
    ).toEqual([])
  })
})
