/**
 * Whether a commit's own CI run earned it the production aliases.
 *
 * ## Why this exists
 *
 * On 2026-10-02 a pull request whose unit tests had failed was merged into `main`
 * (incident PR-94, masterplan §13). The deployment platform then built that commit, and the one
 * after it, and gave both the production aliases. Detection had worked: `verify` was red. Two
 * admission boundaries ignored it. The merge boundary is the ruleset's job. This module is the
 * input to the other one: a single `Production admission` check that the deployment platform
 * is told to wait for before it assigns production aliases.
 *
 * A READY build says the build finished. It says nothing about tests, because the platform's
 * build command does not run them.
 *
 * ## Why a separate check rather than the three that already exist
 *
 * The three CI contexts already report on every commit. A deployment check could list them,
 * but on a push to `main` one of them, `Dependency scope`, is *skipped* by design (it reads a
 * pull request description, and a push has none), and GitHub reports a skipped job as a
 * success. A list of three would therefore either wait forever on a context that never runs on
 * a push, or rest on a "success" that means "did not run". One verdict that knows which result
 * each event must produce removes both readings.
 *
 * ## The policy, which is exhaustive on purpose
 *
 * - `pull_request`: `verify`, `e2e` and `dependencyScope` all `success`.
 * - `push` to `refs/heads/main`: `verify` and `e2e` `success`, and `dependencyScope`
 *   **exactly `skipped`**. That is a stated invariant of `ci.yml` (the job is PR-only), not a
 *   tolerance: if the job ever starts running on push, this rule and its tests change together.
 *   A `success` there would mean the workflow changed under this verdict, so it is refused.
 * - Anything else is refused: a push to any other branch, `merge_group` (no policy has been
 *   defined or tested for a queue), `workflow_dispatch`, and a missing event name.
 *
 * Only an explicit `success` admits `verify` or `e2e`. A result that is absent, empty or
 * unrecognised is `missing`, and `missing` is never admitted. That is the whole lesson of the
 * incident: a check that did not run must never read as one that passed.
 *
 * ## What it does not see
 *
 * It judges the run it is part of, and nothing else: no pull request head, no earlier run, no
 * other commit. A merge commit on `main` has its own SHA, its own push run and so its own
 * verdict, however green the pull request that produced it was. It also cannot make the
 * deployment platform wait for it, and it cannot stop a person from promoting a deployment by
 * hand. Those are platform settings, recorded under `production-admission` in
 * `docs/controls.json`.
 */

/** The results GitHub reports for a needed job. Anything else is `missing`. */
export const JOB_RESULTS = Object.freeze(['success', 'failure', 'cancelled', 'skipped'])

/** The one ref whose pushes are production candidates. */
export const PRODUCTION_REF = 'refs/heads/main'

/** The jobs whose results the verdict reads, in the order it reports them. */
export const ADMISSION_JOBS = Object.freeze(['verify', 'e2e', 'dependencyScope'])

/**
 * What each job must have reported for this event and ref, or null when no policy applies.
 *
 * @param {string | undefined} event
 * @param {string | undefined} ref
 * @returns {Record<string, string> | null}
 */
export function requiredResults(event, ref) {
  if (event === 'pull_request') {
    return { verify: 'success', e2e: 'success', dependencyScope: 'success' }
  }
  if (event === 'push' && ref === PRODUCTION_REF) {
    return { verify: 'success', e2e: 'success', dependencyScope: 'skipped' }
  }
  return null
}

/**
 * A job result as GitHub reported it, or `missing`.
 *
 * @param {unknown} value
 * @returns {'success' | 'failure' | 'cancelled' | 'skipped' | 'missing'}
 */
export function jobResult(value) {
  return typeof value === 'string' && JOB_RESULTS.includes(value) ? /** @type {never} */ (value) : 'missing'
}

/**
 * @typedef {object} AdmissionInput
 * @property {string} [event]           `github.event_name`.
 * @property {string} [ref]             `github.ref`, the full ref (`refs/heads/main`).
 * @property {string} [verify]          `needs.verify.result`.
 * @property {string} [e2e]             `needs.e2e.result`.
 * @property {string} [dependencyScope] `needs['dependency-scope'].result`.
 */

/**
 * @typedef {object} AdmissionVerdict
 * @property {boolean} admitted
 * @property {'pull_request' | 'push-main' | 'none'} policy
 * @property {Record<string, string>} results  What each job reported, normalised.
 * @property {string[]} unmet                  `job: got X, needs Y` for every job that missed.
 * @property {string} reason
 */

/**
 * @param {AdmissionInput} [input]
 * @returns {AdmissionVerdict}
 */
export function admissionVerdict({ event, ref, verify, e2e, dependencyScope } = {}) {
  const results = { verify: jobResult(verify), e2e: jobResult(e2e), dependencyScope: jobResult(dependencyScope) }
  const required = requiredResults(event, ref)

  if (!required) {
    const what = event === 'push' ? `a push to ${ref || '(no ref)'}` : `the ${event || '(missing)'} event`
    return {
      admitted: false,
      policy: 'none',
      results,
      unmet: [],
      reason: `no admission policy covers ${what}; only pull_request and a push to ${PRODUCTION_REF} have one`,
    }
  }

  const policy = event === 'pull_request' ? 'pull_request' : 'push-main'
  const unmet = ADMISSION_JOBS.filter((job) => results[job] !== required[job]).map(
    (job) => `${job}: got ${results[job]}, needs ${required[job]}`,
  )

  return {
    admitted: unmet.length === 0,
    policy,
    results,
    unmet,
    reason:
      unmet.length === 0
        ? `${policy}: ${ADMISSION_JOBS.map((job) => `${job} ${results[job]}`).join(', ')}`
        : `${policy}: ${unmet.join('; ')}`,
  }
}
