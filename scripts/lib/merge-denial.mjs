// Healthy Jewelry — did GitHub refuse a known-bad pull request, judged without pressing merge?
//
// ## Why this exists instead of "open a bad PR and try to merge it"
//
// The owner's exit test for the merge gate was: open a known-bad pull request and have GitHub
// refuse the merge. Taken literally that means pressing merge. If the ruleset is right, GitHub
// refuses and nothing happens. If it is wrong — a context typo, a bypass actor, strict mode
// off — the bad pull request lands on `main`, and `main` auto-deploys to production. The test
// of the safety net is the fall it exists to prevent, performed for real, with the outcome
// unknown until after it has happened.
//
// GitHub already computes the answer without anyone attempting the merge: a pull request's
// `mergeable_state` is `blocked` when a required check has not passed, and `clean` (or
// `unstable`, `has_hooks`) when the merge button would work. So the proof is read, not
// performed: the effective rules (which contexts are required), the canary's check runs on its
// head commit (which of them failed), and GitHub's own verdict on mergeability. All three are
// GETs. This module is the pure judgement over them; `scripts/probe-merge-denial.mjs` does the
// reading and contains no call to any merge endpoint — asserted statically by its test.

/**
 * The verdicts, and why there are three.
 *
 *   · `denied`      — GitHub reports `blocked`, and at least one *required* context is failing,
 *                     pending or missing on the canary's head commit. The block is attributable
 *                     to the checks, which is the thing being proved.
 *   · `NOT-DENIED`  — GitHub reports the pull request mergeable while a required context has not
 *                     passed. The gate did not hold. Upper-case on purpose: it is the one answer
 *                     that means production is one click from a known-bad commit.
 *   · `unevaluable` — GitHub has not computed mergeability yet, the rules could not be read, the
 *                     canary is not actually failing a required check, or it is blocked for a
 *                     reason that is not the checks (conflicts, draft, out of date, reviews).
 *                     None of those proves anything in either direction, and ADR 010 is the rule
 *                     against reading any of them as a result.
 */
export const DENIAL_VERDICTS = /** @type {const} */ (['denied', 'NOT-DENIED', 'unevaluable'])

/** `mergeable_state` values under which the merge button works. */
export const MERGEABLE_STATES = /** @type {const} */ (['clean', 'unstable', 'has_hooks'])

/**
 * Check-run conclusions GitHub counts as satisfying a required check.
 *
 * `skipped` and `neutral` are in this list because GitHub treats them as passing for branch
 * protection — which is exactly why a skipped required job is a hole (the `dependency-scope`
 * job skips outside `pull_request`; see its comment in `ci.yml`).
 */
export const PASSING_CONCLUSIONS = /** @type {const} */ (['success', 'neutral', 'skipped'])

/**
 * The state of one required context on the canary's head commit.
 *
 * A context can be satisfied by a check run (named after the job) or by a commit status (named
 * by its `context`). The newest of each wins, because a re-run supersedes the run before it.
 *
 * @param {string} context
 * @param {Array<{ name: string, status: string, conclusion: string | null, started_at?: string, completed_at?: string, id?: number }>} checkRuns
 * @param {Array<{ context: string, state: string, updated_at?: string }>} statuses
 * @returns {'passing' | 'failing' | 'pending' | 'missing'}
 */
export function contextState(context, checkRuns = [], statuses = []) {
  const newest = (xs, at) =>
    [...xs].sort((a, b) => String(at(b) ?? '').localeCompare(String(at(a) ?? '')) || (b.id ?? 0) - (a.id ?? 0))[0]

  const run = newest(
    checkRuns.filter((r) => r?.name === context),
    (r) => r.completed_at ?? r.started_at
  )
  if (run) {
    if (run.status !== 'completed') return 'pending'
    return PASSING_CONCLUSIONS.includes(run.conclusion) ? 'passing' : 'failing'
  }

  const status = newest(
    statuses.filter((s) => s?.context === context),
    (s) => s.updated_at
  )
  if (status) {
    if (status.state === 'success') return 'passing'
    if (status.state === 'pending') return 'pending'
    return 'failing'
  }
  return 'missing'
}

/**
 * Judge the canary.
 *
 * @param {object} input
 * @param {string | null | undefined} input.mergeableState GitHub's `mergeable_state`.
 * @param {string[] | null} input.requiredContexts `null` when the rules could not be read.
 * @param {Array<object>} [input.checkRuns]
 * @param {Array<object>} [input.statuses]
 * @returns {{ verdict: 'denied' | 'NOT-DENIED' | 'unevaluable', reason: string, contexts: Record<string, string>, unmet: string[], detail: string }}
 */
export function judgeDenial({ mergeableState, requiredContexts, checkRuns = [], statuses = [] }) {
  const contexts = Object.fromEntries(
    (requiredContexts ?? []).map((c) => [c, contextState(c, checkRuns, statuses)])
  )
  const unmet = Object.entries(contexts)
    .filter(([, state]) => state !== 'passing')
    .map(([c]) => c)
    .sort()
  const result = (verdict, reason, detail) => ({ verdict, reason, contexts, unmet, detail })

  if (requiredContexts === null || requiredContexts === undefined) {
    return result(
      'unevaluable',
      'rules-unreadable',
      'The effective rules for the base branch could not be read, so nothing says which ' +
        'contexts are required. A block cannot be attributed to checks nobody can name.'
    )
  }

  if (!mergeableState || mergeableState === 'unknown') {
    return result(
      'unevaluable',
      'mergeability-not-computed',
      'GitHub has not computed mergeability for this pull request yet (it does so lazily, ' +
        'after a read). Re-run in a minute; "not yet known" is not "allowed".'
    )
  }

  const mergeable = MERGEABLE_STATES.includes(/** @type {any} */ (mergeableState))

  if (requiredContexts.length === 0) {
    return mergeable
      ? result(
          'NOT-DENIED',
          'no-required-contexts',
          `GitHub reports "${mergeableState}" and no status check is required on the base ` +
            `branch at all. Nothing stands between a failing pull request and main.`
        )
      : result(
          'unevaluable',
          'no-required-contexts',
          `GitHub reports "${mergeableState}", but no status check is required, so the block ` +
            `is not the checks' doing.`
        )
  }

  if (mergeableState === 'blocked') {
    return unmet.length > 0
      ? result(
          'denied',
          'required-context-unmet',
          `GitHub reports "blocked", and the required context(s) ${unmet
            .map((c) => `"${c}" (${contexts[c]})`)
            .join(', ')} have not passed on the head commit. The gate refused a known-bad ` +
            `pull request without anyone pressing merge.`
        )
      : result(
          'unevaluable',
          'blocked-for-another-reason',
          'GitHub reports "blocked", but every required context has passed — so the canary is ' +
            'not failing a required check, and the block is something else (a review ' +
            'requirement, most likely). Make the canary fail a required check.'
        )
  }

  if (mergeable) {
    return unmet.length > 0
      ? result(
          'NOT-DENIED',
          'mergeable-with-unmet-required-context',
          `GitHub reports "${mergeableState}" — the merge button works — while ${unmet
            .map((c) => `"${c}" (${contexts[c]})`)
            .join(', ')} has not passed. The gate did not hold: a bypass actor, a context ` +
            `name that does not match what CI publishes, or a ruleset that is not active.`
        )
      : result(
          'unevaluable',
          'canary-not-failing',
          `GitHub reports "${mergeableState}" and every required context passed. The canary is ` +
            `not a known-bad pull request, so its mergeability proves nothing about denial.`
        )
  }

  const other = {
    behind:
      'the head branch is behind the base, which strict mode blocks on its own. Update the ' +
      'canary branch so the only thing standing in its way is the failing check.',
    dirty: 'the pull request has merge conflicts, which block it regardless of any check.',
    draft: 'the pull request is a draft, which blocks it regardless of any check.',
  }
  return result(
    'unevaluable',
    mergeableState in other ? `state-${mergeableState}` : 'state-unrecognised',
    `GitHub reports "${mergeableState}": ${
      other[mergeableState] ?? 'a state this judgement does not know how to attribute.'
    }`
  )
}

/**
 * Ask for the pull request until GitHub has computed its mergeability.
 *
 * GitHub computes `mergeable` and `mergeable_state` lazily: the first read after a push often
 * returns `null` / `unknown` and starts a background job. Reading once and judging would make
 * the most common first answer an `unevaluable` nobody re-runs.
 *
 * @param {() => Promise<{ mergeable_state?: string | null, mergeable?: boolean | null }>} fetchPr
 * @param {{ delaysMs?: number[], sleep?: (ms: number) => Promise<void> }} [options]
 */
export async function pollMergeable(
  fetchPr,
  { delaysMs = [2_000, 4_000, 8_000, 16_000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}
) {
  let attempts = 0
  let pr = null
  for (let i = 0; i <= delaysMs.length; i += 1) {
    attempts += 1
    pr = await fetchPr()
    const state = pr?.mergeable_state
    if (state && state !== 'unknown') break
    if (i < delaysMs.length) await sleep(delaysMs[i])
  }
  return { pr, attempts }
}

/**
 * The evidence record, in the shape the runbook's template asks for.
 *
 * Deliberately flat and dated: it is pasted into `docs/runbooks/main-ruleset.md`'s evidence
 * table and must be re-checkable by the next person without the API — which is the standard
 * `docs/shopify-decommission-inventory.md` sets for evidence ("what was observed, in words,
 * with a date").
 */
export function evidenceRecord({ now, repo, prNumber, headSha, baseRef, attempts, mergeableState, protection, judgement }) {
  return {
    recordedAt: now.toISOString(),
    repo,
    pullRequest: prNumber,
    baseRef,
    headSha,
    mergeableState: mergeableState ?? null,
    mergeabilityReadAttempts: attempts,
    rules: protection,
    requiredContexts: Object.keys(judgement.contexts),
    contextStates: judgement.contexts,
    verdict: judgement.verdict,
    reason: judgement.reason,
    detail: judgement.detail,
    method: 'read-only: GET pull request, GET check runs and statuses, GET rules and rulesets. No merge was attempted.',
  }
}
