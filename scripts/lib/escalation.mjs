/**
 * **Whether a production-smoke failure reaches a person, and what it says to them.**
 *
 * This is the decision that used to live as ~110 lines of JavaScript inside a YAML
 * `script:` string in `.github/workflows/production-smoke.yml`. It had no tests, and it
 * could not have any: a decision inside a string literal is not importable, so the only
 * way to exercise it was to break production and wait six hours.
 *
 * It was wrong for a month and nobody could see it. See
 * [ADR 030](../../docs/adr/030-an-equivalence-relation-is-the-control.md).
 *
 * ## The bug this file exists because of
 *
 * The step decided "is this the same failure as last time?" by comparing the raw tail of
 * each step's log against the previous comment's. The storefront log carries a wall-clock
 * figure measured on that run:
 *
 * ```
 * ✓ Open Graph image renders within the crawler budget
 *   176ms cold, 17KB (budget 2500ms)
 * ```
 *
 * Across nine consecutive comments on issue #24 that number read 176, 99, 145, 106, 186,
 * 129, 209, 137, 194. So "unchanged" was **always false**, the streak counter never left
 * 1, and the escalation branch — the only part of this channel that reaches a human
 * differently from the ninety-nine before it — was unreachable from the day it was
 * written. Issue #24 accumulated **100 near-identical comments over ~124 runs** since
 * 2026-08-15 while the alarm it was supposed to raise never fired.
 *
 * `diagnosisOf()` did strip the run URL, so somebody had already thought about volatile
 * content once. They stripped the volatile field they could see in the comment's header,
 * and not the one buried forty lines inside a `<details>` block.
 *
 * ## Why an allowlist, and not a hash or a similarity score
 *
 * The obvious fix is to hash "the interesting bits", or to compare with a fuzzy
 * threshold. Both are refused here, because both answer the question *approximately*, and
 * an approximate answer to "is this the same failure?" fails in whichever direction its
 * tuning happens to lean — silently, exactly like the bug above.
 *
 * So the equivalence relation is **explicit and enumerated**:
 *
 *   1. Keep only *actionable verdict lines* — a line beginning `✗`, the `Failed:` summary,
 *      and the `Could not be evaluated:` summary. Everything else in a smoke log is
 *      narration, and narration is where the volatile fields live.
 *   2. Rewrite each known volatile token to a placeholder, from the `NORMALISERS` table
 *      below. Nothing is rewritten that is not named there.
 *
 * ### If you add a field to the smoke output, add a normaliser
 *
 * **A new per-run figure on a verdict line reintroduces this bug exactly.** Not partially:
 * the streak resets every run and the escalation stops firing, which is the state this
 * channel was already in for a month while looking busy. If a `✗` line, a `Failed:` line,
 * or a `Could not be evaluated:` line gains a duration, a byte count, a timestamp, an id,
 * or a URL, it needs an entry in `NORMALISERS` in the same commit.
 *
 * That instruction is written here rather than left implied because an unclassified entry
 * is an unverified one —
 * [ADR 019](../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 *
 * ### The limit this relation has, stated now rather than discovered later
 *
 * Verdict *headers* are kept; the `·` detail bullets underneath them are not. So a
 * preflight failure that moves from one wrongly-set secret to a different wrongly-set
 * secret keeps the header `✗ Secrets set to the wrong kind of value` and compares
 * **equal** — true of the action required ("go fix a secret"), false of which secret. The
 * `Failed:` summary does name the individual storefront checks, so a change in *which*
 * checks fail is caught.
 *
 * That is a deliberate narrowing toward quiet, and it is asserted in
 * `escalation-decision.test.ts` so it stays a known property instead of becoming a
 * surprise.
 */

/** The label that marks the single open "production smoke is failing" issue. */
export const SMOKE_LABEL = 'production-smoke'

/** Added once, when repetition stops being information (ADR 011). */
export const ESCALATION_LABEL = 'human-required'

/** Prefixed to the issue title on escalation, and removed when the diagnosis moves. */
export const ESCALATION_TITLE_PREFIX = '[escalated] '

/**
 * Consecutive runs with the same diagnosis before this channel escalates.
 *
 * Three runs is eighteen hours on the six-hourly schedule — long enough that a transient
 * outage has had two chances to clear itself, short enough that a real configuration
 * problem is escalated the same day.
 */
export const ESCALATION_THRESHOLD = 3

/** The issue title, before any escalation prefix. */
export const ISSUE_TITLE = 'Production smoke is failing'

/** How much of each step's log is carried into the notification. */
export const MAX_LOG = 3000

/**
 * The hidden counter carried by the standing report comment.
 *
 * The streak cannot be counted from the comments themselves, and that is the *second*
 * unreachability in the original step: it counted trailing identical comments while
 * suppressing the comment whenever the diagnosis was identical. The count therefore could
 * never exceed the one comment that had been allowed through, so `streak < 3` held forever
 * even for a diagnosis that never changed — independently of the volatile-figure bug
 * above. Two separate reasons the escalation could not fire, eleven lines apart.
 *
 * Counting runs requires remembering across runs, and a workflow remembers nothing. So the
 * count lives in the comment, and the quiet path *edits that comment in place*. "Quiet"
 * means nobody is notified — GitHub sends no mail for an edit — not that nothing is
 * recorded.
 */
const STREAK_MARKER = /<!--\s*smoke-streak:\s*(\d+)\s*-->/

/** The opening line every report comment this channel writes begins with. */
const REPORT_PREFIX = /^Still failing\./

/**
 * Lines that carry a verdict, as opposed to lines that narrate one.
 *
 * `✓` is deliberately absent. A passing check is not part of why the run failed, and every
 * per-run measurement in the smoke output so far has been printed under one.
 */
const VERDICT_LINE = [/^✗/, /^Failed:/, /^Could not be evaluated:/i]

/** Chrome a report comment wraps the diagnosis in, dropped before the fallback compare. */
const REPORT_CHROME = [/^Still failing\.$/, /^Run: /, /^Unchanged for /, /^<!--/]

/**
 * **The complete list of tokens that may differ between two runs of the same failure.**
 *
 * Ordered, and the order matters: a timestamp contains digits and dashes, and a run id
 * lives inside a URL, so the narrow patterns run before the wide ones. Adding a pattern
 * here widens what counts as "the same failure" — do it only for a field that genuinely
 * varies per run, and never for one that varies per *cause*.
 */
export const NORMALISERS = [
  {
    name: 'iso-timestamp',
    pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g,
    to: '<timestamp>',
  },
  { name: 'run-id', pattern: /actions\/runs\/\d+/g, to: 'actions/runs/<run-id>' },
  { name: 'url', pattern: /https?:\/\/\S+/g, to: '<url>' },
  { name: 'duration-ms', pattern: /\b\d+(?:\.\d+)?ms\b/g, to: '<ms>' },
  { name: 'size-kb', pattern: /\b\d+(?:\.\d+)?KB\b/g, to: '<kb>' },
]

/**
 * Rewrite every known volatile token to its placeholder.
 *
 * @param {string} text
 * @returns {string}
 */
export function normaliseVolatile(text) {
  return NORMALISERS.reduce((acc, { pattern, to }) => acc.replace(pattern, to), String(text ?? ''))
}

/**
 * **The equivalence relation.** Two diagnoses are the same failure iff their keys match.
 *
 * Exported and pure because this single comparison *is* the control: too strict and the
 * channel says the same thing a hundred times, too loose and it stays silent through a new
 * failure. Both are muted alarms, and only one of them looks broken.
 *
 * A body with no verdict line at all — "No step produced output", or a shape this parser
 * has not met — falls back to comparing the whole normalised text rather than yielding an
 * empty key. An empty key would make every unparseable report equal to every other one,
 * which is this same bug pointed the other way.
 *
 * @param {string} text a comment body, or a freshly composed diagnosis
 * @returns {string}
 */
export function diagnosisKey(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())

  const verdicts = lines.filter((line) => VERDICT_LINE.some((re) => re.test(line)))
  const kept =
    verdicts.length > 0
      ? verdicts
      : lines.filter((line) => line && !REPORT_CHROME.some((re) => re.test(line)))

  return normaliseVolatile(kept.join('\n')).trim()
}

/**
 * GitHub returns labels as strings on some routes and as objects on others.
 *
 * @param {Array<string | { name?: string }>} labels
 * @returns {string[]}
 */
export function labelNames(labels) {
  if (!Array.isArray(labels)) return []
  return labels.map((l) => (typeof l === 'string' ? l : (l?.name ?? ''))).filter(Boolean)
}

/**
 * The "**What failed:**" block, from whatever step logs the run produced.
 *
 * Tail, not head: the verdict and the failing check are at the end of each log.
 *
 * Issue #18 told its reader the cause might be "a Shopify incident, an expired credential,
 * or a configuration change". It was none of those — five named secrets were unset, and
 * the preflight had printed exactly that, in the log the issue merely linked to. A
 * notification that makes its reader open the run to learn anything sends them looking in
 * the wrong place first.
 *
 * @param {Array<{ name: string, text: string }>} logs
 * @returns {string}
 */
export function composeDiagnosis(logs) {
  const blocks = (Array.isArray(logs) ? logs : [])
    .map((log) => ({ name: log?.name, text: String(log?.text ?? '').trim() }))
    .filter((log) => log.text.length > 0)
    .map((log) => {
      const clipped =
        log.text.length > MAX_LOG
          ? `…(truncated, see the run)\n${log.text.slice(-MAX_LOG)}`
          : log.text
      return `<details><summary><code>${log.name}</code></summary>\n\n\`\`\`\n${clipped}\n\`\`\`\n</details>`
    })

  return blocks.length > 0
    ? ['**What failed:**', '', ...blocks].join('\n')
    : 'No step produced output — the run failed before the checks started.'
}

/** The standing caveat, identical on the issue body and on every report comment. */
const CAVEAT = [
  'This checks the **live** store and deployment, so it can fail for reasons',
  'unrelated to any commit — a Shopify incident, an expired credential, or a',
  'configuration change. It is deliberately not part of branch protection.',
  '',
  'See `docs/go-live-runbook.md` and `docs/credential-inventory.md`.',
]

/**
 * The body of the issue this channel opens on the first failure.
 *
 * @param {{ runUrl: string, diagnosis: string }} input
 * @returns {string}
 */
export function composeIssueBody({ runUrl, diagnosis }) {
  return [
    'The scheduled production smoke run failed.',
    '',
    `Run: ${runUrl}`,
    '',
    diagnosis,
    '',
    ...CAVEAT,
  ].join('\n')
}

/**
 * A report comment: the current diagnosis, plus the streak in both readable and
 * machine-readable form.
 *
 * The visible line exists so that a person opening the issue learns "unchanged for twelve
 * runs" from the comment they are already looking at, instead of scrolling a hundred of
 * them to work it out. The marker exists because the next run has to read the number back.
 *
 * Neither is a verdict line, so neither participates in `diagnosisKey` — the counter
 * cannot make the thing it counts look different.
 *
 * @param {{ runUrl: string, diagnosis: string, streak?: number }} input
 * @returns {string}
 */
export function composeReport({ runUrl, diagnosis, streak = 1 }) {
  return [
    'Still failing.',
    '',
    `Run: ${runUrl}`,
    ...(streak > 1 ? ['', `Unchanged for ${streak} consecutive runs.`] : []),
    '',
    diagnosis,
    '',
    `<!-- smoke-streak: ${streak} -->`,
  ].join('\n')
}

/**
 * The one comment that is meant to be louder than the ones before it.
 *
 * @param {{ runUrl: string, streak: number }} input
 * @returns {string}
 */
export function composeEscalation({ runUrl, streak }) {
  return [
    `Same diagnosis for ${streak} consecutive runs — escalating instead of`,
    'repeating the comment. This is a console configuration problem, not',
    'something a future run or a code change will resolve on its own. See the',
    'diagnosis above and `docs/go-live-runbook.md`. This issue stays quiet now',
    'until the diagnosis changes or the run recovers.',
    '',
    `Run: ${runUrl}`,
  ].join('\n')
}

/**
 * Read back the streak a previous run recorded on a report comment.
 *
 * A report with no marker is one written before this counter existed, and reads as 1 —
 * the conservative direction, since it delays an escalation rather than inventing one.
 *
 * @param {string} body
 * @returns {number}
 */
export function readStreak(body) {
  const match = STREAK_MARKER.exec(String(body ?? ''))
  return match ? Number(match[1]) : 1
}

/**
 * **What this failing run should do to the issue thread, and what it should say.**
 *
 * Pure, total, and returning data rather than performing it. The workflow step that runs
 * this is a transport: it reads the logs, calls this, and dispatches. It contains no
 * sentence of its own, because a sentence inside a YAML string literal is a sentence no
 * test can read — which is how a hundred of them came to be written.
 *
 * The four actions:
 *
 *   · `create`     — no open failure issue. Open one.
 *   · `comment`    — first repeat, or the diagnosis moved. Post a report. This is the only
 *                    routine path that notifies anybody.
 *   · `escalate`   — the same diagnosis for `threshold` runs and not yet escalated. Label,
 *                    retitle, and say so once.
 *   · `stay-quiet` — same diagnosis, below threshold or already escalated. Refresh the
 *                    standing comment's counter in place and say nothing new.
 *
 * `refresh` and `issueUpdate` are present when the corresponding write is wanted, and the
 * transport applies whichever it is handed. That is what keeps the branch structure out of
 * YAML: the transport has no `if` of its own about *why*, only about *what was returned*.
 *
 * Note that the issue body is not counted as a report. The run that opens the issue is run
 * one, the first `Still failing.` comment is run two, and escalation at a threshold of
 * three therefore lands on run four.
 *
 * @param {{
 *   issue: { number?: number, title?: string } | null,
 *   comments: Array<{ id?: number, body?: string }>,
 *   diagnosis: string,
 *   labels: Array<string | { name?: string }>,
 *   threshold?: number,
 *   runUrl: string,
 * }} input
 * @returns {{
 *   action: 'create' | 'comment' | 'escalate' | 'stay-quiet',
 *   reason: string,
 *   streak: number,
 *   title?: string,
 *   body?: string | null,
 *   labels?: string[],
 *   refresh?: { commentId: number, body: string } | null,
 *   issueUpdate?: { title: string, labels: string[] } | null,
 * }}
 */
export function escalationDecision({
  issue,
  comments,
  diagnosis,
  labels,
  threshold = ESCALATION_THRESHOLD,
  runUrl,
}) {
  if (!issue) {
    return {
      action: 'create',
      reason: 'no open production-smoke issue — this is the first failure',
      streak: 1,
      title: ISSUE_TITLE,
      body: composeIssueBody({ runUrl, diagnosis }),
      labels: [SMOKE_LABEL],
      refresh: null,
      issueUpdate: null,
    }
  }

  const names = labelNames(labels)
  const escalated = names.includes(ESCALATION_LABEL)
  const key = diagnosisKey(diagnosis)

  // Only comments this channel wrote. A human's reply, or the escalation comment itself,
  // is not a report — treating one as the baseline would break the streak on the run after
  // every escalation, which is exactly when the channel is supposed to be silent.
  const reports = (Array.isArray(comments) ? comments : []).filter((c) =>
    REPORT_PREFIX.test(String(c?.body ?? '').trim())
  )
  const last = reports[reports.length - 1]
  const same = last !== undefined && diagnosisKey(last.body) === key

  if (!same) {
    const streak = 1
    return {
      action: 'comment',
      reason: last ? 'the diagnosis changed since the last report' : 'first repeat of this failure',
      streak,
      body: composeReport({ runUrl, diagnosis, streak }),
      refresh: null,
      // A new cause has to be escalatable again, or the sentence the escalation comment
      // already prints — "until the diagnosis changes" — is untrue. The original step never
      // removed the label, so the first escalation would also have been the last one.
      issueUpdate: escalated
        ? {
            title: String(issue.title ?? ISSUE_TITLE).replace(/^\[escalated\]\s*/, ''),
            labels: names.filter((name) => name !== ESCALATION_LABEL),
          }
        : null,
    }
  }

  const streak = readStreak(last.body) + 1
  const refresh = { commentId: last.id, body: composeReport({ runUrl, diagnosis, streak }) }

  if (escalated) {
    return {
      action: 'stay-quiet',
      reason: `same diagnosis for ${streak} runs, already escalated`,
      streak,
      body: null,
      refresh,
      issueUpdate: null,
    }
  }

  if (streak < threshold) {
    return {
      action: 'stay-quiet',
      reason: `same diagnosis for ${streak} of ${threshold} runs — counting, not repeating`,
      streak,
      body: null,
      refresh,
      issueUpdate: null,
    }
  }

  return {
    action: 'escalate',
    reason: `same diagnosis for ${streak} consecutive runs`,
    streak,
    body: composeEscalation({ runUrl, streak }),
    refresh,
    issueUpdate: {
      title: `${ESCALATION_TITLE_PREFIX}${String(issue.title ?? ISSUE_TITLE).replace(
        /^\[escalated\]\s*/,
        ''
      )}`,
      labels: [...names, ESCALATION_LABEL],
    },
  }
}
