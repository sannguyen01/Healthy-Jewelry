// Healthy Jewelry — what the control audit should do when assertion liveness is not clean.
//
// ## Why this is a module and not eleven lines of YAML
//
// ADR 030, and `workflow-inline-script-budget.test.ts` enforcing it: a `github-script`
// block is a transport — read inputs, call a decision, apply the result. The first version
// of this reporter was 49 lines of logic inside a YAML string, four over the budget, and
// the budget was right. A decision in a string literal cannot be imported, so the only way
// to exercise it is to break production and wait six hours for the next scheduled run.
// That is how the production-smoke escalation shipped three bugs and posted a hundred
// comments without ever escalating.
//
// ## What it decides
//
// `probe-assertion-liveness.mjs` exits non-zero for two reasons that are not the same
// finding, and the distinction is the whole point of keeping the log in the issue body:
//
//   · **A dead sentinel.** A test executed deliberately-broken code and stayed green. The
//     invariant it names is unprotected *now*, and the fix is in that test.
//   · **A probe that could not run**, or that evaluated nothing. The control is dark. It
//     says nothing either way about the suite, and the fix is in the probe or the job.
//
// Collapsing those into "liveness failed" is the laundering ADR 010 is about, so this
// carries the probe's own words through rather than paraphrasing them.

export const LIVENESS_ISSUE_LABEL = 'assertions-dead'
export const LIVENESS_ISSUE_TITLE = 'An assertion the suite relies on is dead, or cannot be checked'

/** Trailing bytes of the probe log are the useful end: the verdict prints last. */
const MAX_LOG_BYTES = 3000

/**
 * Two bodies are "the same thing to say" when they differ only by which run said it.
 *
 * ADR 011: a channel that repeats itself is a channel people mute, and this one has
 * exactly one thing to say until someone fixes it.
 *
 * @param {string} text
 */
function withoutRun(text) {
  return String(text ?? '').replace(/Run: \S+/g, '').trim()
}

/**
 * @param {object} input
 * @param {string | null} input.log contents of `liveness.log`, or null when unreadable
 * @param {string} input.runUrl
 * @returns {string}
 */
export function composeLivenessBody({ log, runUrl }) {
  const trimmed = typeof log === 'string' ? log.trim() : ''
  // Never invent a diagnosis from an absence — the step's own outcome reports that.
  const diagnosis = trimmed
    ? ['```', trimmed.slice(-MAX_LOG_BYTES), '```'].join('\n')
    : 'The probe produced no output at all.'

  return [
    'The assertion-liveness probe did not come back clean.',
    '',
    diagnosis,
    '',
    '**Two different findings reach this issue, and they are not the same.**',
    'A *dead* sentinel means a test executed broken code and stayed green — the',
    'invariant it names is unprotected right now. A probe that *refused to start*',
    'or evaluated nothing means the control itself is dark, and says nothing',
    'either way about the suite. The log above distinguishes them.',
    '',
    `Run: ${runUrl}`,
    '',
    'See `docs/adr/020-a-test-that-cannot-fail-is-documentation.md`.',
  ].join('\n')
}

/**
 * What the audit should do about the current state of the probe.
 *
 * @param {object} input
 * @param {'success' | 'failure' | string} input.outcome the liveness step's own outcome
 * @param {string | null} [input.log] contents of `liveness.log`
 * @param {Array<{ number: number }>} [input.openIssues] open issues carrying the label
 * @param {Array<{ body?: string }>} [input.comments] comments on the first open issue
 * @param {string} input.runUrl
 * @returns {{ close: number[], closeComment: string, comment: number | null,
 *             create: boolean, body: string }}
 */
export function livenessIssuePlan({ outcome, log = null, openIssues = [], comments = [], runUrl }) {
  const idle = { close: [], closeComment: '', comment: null, create: false, body: '' }

  if (outcome === 'success') {
    return {
      ...idle,
      close: openIssues.map((i) => i.number),
      closeComment: 'Every sentinel is alive again, and the probe ran. Closing.',
    }
  }

  // Any outcome that is neither a pass nor a failure — cancelled, skipped — is an absence
  // of evidence. Opening an issue from one would report a finding nobody measured.
  if (outcome !== 'failure') return idle

  const body = composeLivenessBody({ log, runUrl })

  if (openIssues.length === 0) return { ...idle, create: true, body }

  const last = comments[comments.length - 1]
  if (last && withoutRun(last.body) === withoutRun(body)) return idle

  return { ...idle, comment: openIssues[0].number, body }
}
