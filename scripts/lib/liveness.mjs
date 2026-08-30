/**
 * Did a workflow's checks actually execute?
 *
 * Shared by the two dead-man's switches — `probe-smoke-liveness.mjs`, which watches
 * production verification, and `probe-ci-liveness.mjs`, which watches the merge gate.
 * Both ask the same question of different workflows, and both exist because of the same
 * property: **from outside, a `skipped` step is indistinguishable from a passing one.**
 *
 * Extracted rather than copied. The verdict *shaping* stays in each probe because the two
 * differ on one point that matters — see `probe-ci-liveness.mjs` on why "no runs" is an
 * alarm for a cron-driven workflow and ordinary quiet for a push-driven one — but the
 * "did these steps run?" arithmetic is identical, and a second hand-copied `darkStreak`
 * would be two things to keep in step for no benefit.
 *
 * Pure, and parameterised by step name, so both callers can be exercised against real
 * captured history without a network. That property is not incidental:
 * [ADR 024](../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md) records that of
 * three probes written in one week, every defect landed in the one whose decision was
 * tangled with I/O and therefore had no fixture test.
 */

/**
 * Conclusions that mean a step actually ran.
 *
 * `failure` counts. The question these probes ask is "did anything look?", and a step that
 * ran and reported a real problem has looked. Requiring `success` would conflate *nobody
 * is checking* with *somebody checked and did not like what they found* — opposite
 * situations with opposite remedies, and only the first is a liveness finding. The second
 * is what the workflow's own failure channel is for.
 *
 * Anything else — `skipped`, `cancelled`, or the step being absent from the run entirely —
 * means nothing looked.
 */
export const EXECUTED_CONCLUSIONS = ['success', 'failure']

/**
 * Did this run execute every required step?
 *
 * @param {Array<{ name: string, conclusion: string | null }> | undefined} steps
 *   The run's steps, flattened across its jobs.
 * @param {readonly string[]} requiredSteps
 * @returns {boolean | null} `null` when step data is unavailable — which is not the same
 *   fact as "did not run", and must not be reported as one.
 */
export function didExecute(steps, requiredSteps) {
  if (!steps) return null
  return requiredSteps.every((name) =>
    EXECUTED_CONCLUSIONS.includes(steps.find((step) => step.name === name)?.conclusion)
  )
}

/**
 * How many consecutive recent runs failed to execute the required steps, and when the last
 * real check was.
 *
 * Stops at the first run whose step data is unknown rather than treating unknown as dark —
 * the same distinction `didExecute` draws, carried through the streak.
 *
 * @param {Array<{ id: number, created_at: string }>} runs Newest first, as the API returns.
 * @param {Record<number, Array<{ name: string, conclusion: string | null }>>} stepsByRunId
 * @param {readonly string[]} requiredSteps
 * @returns {{ count: number, lastExecutedAt: string | null }}
 */
export function darkStreak(runs, stepsByRunId, requiredSteps) {
  let count = 0
  for (const run of runs) {
    const executed = didExecute(stepsByRunId[run.id], requiredSteps)
    if (executed === null) break
    if (executed) return { count, lastExecutedAt: run.created_at }
    count++
  }
  return { count, lastExecutedAt: null }
}

/**
 * Read JSON from the GitHub API, with the token if one is present.
 *
 * Throws on a non-2xx rather than returning a body the caller would have to re-check.
 * Both probes turn that throw into `unevaluable` — an API this tool could not reach is a
 * failure of the tool, never a finding about the thing it watches
 * ([ADR 010](../../docs/adr/010-a-control-that-cannot-fail.md)).
 *
 * @param {string} pathname
 */
export async function githubJson(pathname) {
  const token = process.env.GITHUB_TOKEN
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
  const response = await fetch(`${api}${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'healthy-jewelry-control-audit',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${pathname}`)
  }
  return response.json()
}
