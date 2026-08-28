/**
 * The names GitHub actually publishes as check-run contexts, read from a workflow file.
 *
 * ## Why this exists
 *
 * Branch protection matches on the **check-run name**, and a check run is named after
 * the job's `name:` — not the job's key in the `jobs:` map. `ci.yml` declares:
 *
 *     jobs:
 *       verify:
 *         name: Lint · Type-check · Unit tests · Build
 *
 * so the context GitHub reports is `Lint · Type-check · Unit tests · Build`, and
 * `verify` is a string that appears nowhere in the checks API. Five documents in this
 * repository asserted `verify` and `e2e` were the required checks. Typing those into
 * the required-checks box registers two contexts nothing ever reports, which does not
 * error — it blocks every pull request permanently, and the E2E result still gates
 * nothing. The fix everyone reaches for first is the one that bricks the repository.
 * See docs/adr/015-a-gate-that-was-only-ever-documented.md.
 *
 * `src/tests/unit/required-checks-contract.test.ts` uses this to hold the documents to
 * the workflow, so the two strings a human will type are proven correct before they
 * type them.
 *
 * ## Why this is not a YAML parser
 *
 * This repo has no YAML dependency and adding one to read two lines would be the larger
 * change. What it reads instead is *structural*, not a pattern hunt: the `jobs:` block,
 * its two-space keys, and the four-space `name:` under each. A step's `name:` sits at
 * six spaces behind a `- `, so the indentation alone separates them. `parseWorkflowJobs`
 * reports what it found rather than only what matched, which is what lets its callers
 * assert the parse was complete instead of trusting it — the ADR 007 requirement that a
 * guardrail must know its own coverage.
 */

/**
 * A job as branch protection sees it.
 *
 * @typedef {object} WorkflowJob
 * @property {string} id            The key under `jobs:`.
 * @property {string | null} name   The `name:` value, or null if the job declares none.
 * @property {string} checkName     What GitHub publishes: the name, or the id when
 *                                  there is no name. This is the string to type into
 *                                  branch protection.
 */

/**
 * @param {string} source Raw workflow YAML.
 * @returns {WorkflowJob[]} In declaration order.
 */
export function parseWorkflowJobs(source) {
  const lines = source.split('\n')
  const jobs = []

  let inJobs = false
  for (const line of lines) {
    // A comment line can hold anything, including something job-shaped.
    if (/^\s*#/.test(line)) continue

    if (/^jobs:\s*$/.test(line)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue

    // Any key back at column 0 ends the jobs block.
    if (/^[A-Za-z_]/.test(line)) break

    const jobStart = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (jobStart) {
      jobs.push({ id: jobStart[1], name: null, checkName: jobStart[1] })
      continue
    }

    // Exactly four spaces: a key of the current job. A step's `name:` is deeper and
    // behind a `- `, so it cannot reach here.
    const jobName = line.match(/^ {4}name:\s*(.+?)\s*$/)
    if (jobName && jobs.length > 0) {
      const job = jobs[jobs.length - 1]
      if (job.name === null) {
        job.name = stripQuotes(jobName[1])
        job.checkName = job.name
      }
    }
  }

  return jobs
}

/** @param {string} value */
function stripQuotes(value) {
  const quoted = value.match(/^(['"])(.*)\1$/)
  return quoted ? quoted[2] : value
}

/**
 * How many job keys the `jobs:` block contains, counted independently of the parse
 * above.
 *
 * A parser that silently finds nothing is the failure mode this whole workstream is
 * about: a check that reports success because it looked at an empty set reads exactly
 * like a check that passed. Callers compare this against `parseWorkflowJobs().length`
 * so a change in indentation style fails loudly instead of quietly matching nothing.
 *
 * @param {string} source
 * @returns {number}
 */
export function countJobKeys(source) {
  const body = source.split(/^jobs:\s*$/m)[1]
  if (body === undefined) return 0
  const untilNextTopLevel = body.split(/\n(?=[A-Za-z_])/)[0]
  return untilNextTopLevel
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)).length
}
