import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

const {
  ESCALATION_LABEL,
  ESCALATION_THRESHOLD,
  ISSUE_TITLE,
  MAX_LOG,
  NORMALISERS,
  SMOKE_LABEL,
  composeDiagnosis,
  composeReport,
  diagnosisKey,
  escalationDecision,
  labelNames,
  normaliseVolatile,
  readStreak,
} = await import('../../../scripts/lib/escalation.mjs')

/**
 * **The alarm channel for a production failure, and the comparison at the heart of it.**
 *
 * ## What was wrong
 *
 * `.github/workflows/production-smoke.yml` held this decision as ~110 lines of JavaScript
 * inside a YAML `script:` string. It had no tests, and it could not have had any — a
 * function in a string literal is not importable. The only way to exercise it was to break
 * production and wait six hours for the next scheduled run.
 *
 * It was broken. The comparison that decides "is this the same failure as last time?" read
 * the raw tail of each step's log, and the storefront log carries a wall-clock figure
 * measured on that run (`176ms cold, 17KB`). Nine consecutive comments on issue #24 read
 * 176, 99, 145, 106, 186, 129, 209, 137, 194 — so two identical failures never compared
 * equal, the streak never advanced, and the escalation branch was unreachable. **Issue #24
 * reached 100 comments across ~124 runs and escalated zero times.**
 *
 * A second, independent reason it could not fire sits eleven lines away: the streak counted
 * *trailing identical comments*, while the same branch suppressed the comment whenever the
 * diagnosis was identical. The count could never exceed the one comment that had been let
 * through. Even with the volatile figures removed, `streak < 3` would have held forever.
 *
 * ## What this file is for
 *
 * Every case below injects its inputs. There is no clock to wait for, no issue to break,
 * and no six-hour round trip — which is the entire argument for extracting the decision in
 * the first place ([ADR 030](../../../docs/adr/030-an-equivalence-relation-is-the-control.md),
 * and [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md) for why a
 * tool nobody has pointed at a known answer is a first draft).
 *
 * The two failure modes it is really guarding are mirror images, and only one of them
 * looks broken from outside:
 *
 * **Speaking when it should not.** Ninety-nine identical comments. Visible, and the reason
 * [ADR 011](../../../docs/adr/011-repeated-identical-failures-must-escalate.md) exists.
 *
 * **Staying quiet when it should speak.** A relation so loose that a *new* production
 * failure reads as the old one and is silently folded into a streak. Invisible, and worse.
 * Hence the assertions below run in both directions on every property, and the fixtures are
 * real captured comment bodies rather than ones shaped to the parser
 * ([ADR 028](../../../docs/adr/028-a-fixture-is-the-input-you-thought-of.md)).
 */

const ROOT = resolve(__dirname, '../../..')
const RUN_A = 'https://github.com/sannguyen01/Healthy-Jewelry/actions/runs/34899857722'
const RUN_B = 'https://github.com/sannguyen01/Healthy-Jewelry/actions/runs/34927043854'

/** A report comment as `github.rest.issues.listComments` returns one. */
function report(body: string, id = 1) {
  return { id, body }
}

/** An open issue as `github.rest.issues.listForRepo` returns one. */
function openIssue(overrides: Partial<{ number: number; title: string }> = {}) {
  return { number: 24, title: ISSUE_TITLE, ...overrides }
}

function decide(
  overrides: Partial<{
    issue: { number?: number; title?: string } | null
    comments: Array<{ id?: number; body?: string }>
    diagnosis: string
    labels: Array<string | { name?: string }>
    threshold: number
    runUrl: string
  }> = {}
) {
  return escalationDecision({
    issue: openIssue(),
    comments: [],
    diagnosis: 'no diagnosis supplied',
    labels: [SMOKE_LABEL],
    threshold: ESCALATION_THRESHOLD,
    runUrl: RUN_B,
    ...overrides,
  })
}

describe('the bug: two runs of one failure must compare equal', () => {
  it('the fixtures really are two different comments', () => {
    // Without this the headline assertion below could pass on two copies of one string,
    // which is the shape of green this whole file refuses.
    expect(ISSUE_24_RUN_A).not.toBe(ISSUE_24_RUN_B)
  })

  it('and they differ only in the run URL and the per-run figures', () => {
    // The precise claim: nothing about *why* the run failed moved between these two
    // comments. Asserted by substitution rather than by eye, so a future fixture swap
    // cannot quietly smuggle in a real difference and make the next test vacuous.
    const collapse = (body: string) =>
      body
        .replace(/actions\/runs\/\d+/g, 'actions/runs/RUN')
        .replace(/\b\d+ms\b/g, 'MS')
        .replace(/\b\d+KB\b/g, 'KB')
    expect(collapse(ISSUE_24_RUN_A)).toBe(collapse(ISSUE_24_RUN_B))
  })

  it('two real comments from issue #24 compare EQUAL', () => {
    // The assertion the shipped workflow could not make. These are comments 5671158651 and
    // 5674519891, six hours apart, reporting one wrongly-set Shopify token — 194ms against
    // 163ms. The old comparison stripped the run URL and nothing else, so it read these as
    // two different failures, and did so ninety-nine times.
    expect(diagnosisKey(ISSUE_24_RUN_A)).toBe(diagnosisKey(ISSUE_24_RUN_B))
  })

  it('and the key it compares them by is not empty', () => {
    // An equivalence relation that maps everything to '' would pass the test above and be
    // catastrophically wrong: every failure would equal every other one, and the channel
    // would fold a genuine new outage into the standing streak without a word.
    expect(diagnosisKey(ISSUE_24_RUN_A).length).toBeGreaterThan(0)
    expect(diagnosisKey(ISSUE_24_RUN_A)).toContain('✗ WRONG SECRET (HTTP 401)')
    expect(diagnosisKey(ISSUE_24_RUN_A)).toContain('Failed: Rate limiting is distributed')
  })

  it('a genuinely different failure compares UNEQUAL', () => {
    // Same thread, same shape, one different ✗ line. If this ever compares equal the
    // channel has stopped being an alarm and become a log.
    const different = ISSUE_24_RUN_B.replace(
      '✗ WRONG SECRET (HTTP 401)',
      '✗ NO RESPONSE (connection refused)'
    )
    expect(diagnosisKey(different)).not.toBe(diagnosisKey(ISSUE_24_RUN_B))
  })

  it('a different set of failing checks compares UNEQUAL', () => {
    // The `Failed:` summary is the line that names *which* storefront checks failed, and
    // it is the reason detail bullets can be dropped without losing the storefront signal.
    const different = ISSUE_24_RUN_B.replace(
      'Failed: Rate limiting is distributed, not per-instance, A signed webhook actually revalidates the cached page',
      'Failed: A signed webhook actually revalidates the cached page'
    )
    expect(diagnosisKey(different)).not.toBe(diagnosisKey(ISSUE_24_RUN_B))
  })

  it('a check moving from failed to could-not-be-evaluated compares UNEQUAL', () => {
    const different = ISSUE_24_RUN_B.replace(
      'Could not be evaluated: Shopify serves the pinned API version,',
      'Could not be evaluated:'
    )
    expect(diagnosisKey(different)).not.toBe(diagnosisKey(ISSUE_24_RUN_B))
  })
})

describe('the normaliser allowlist is explicit, and closed', () => {
  it('names exactly the five volatile token classes the module documents', () => {
    // A list, not a hash. If an entry is added here it must be because a field genuinely
    // varies per run — widening this widens what counts as "the same failure".
    expect(NORMALISERS.map((n: { name: string }) => n.name)).toEqual([
      'iso-timestamp',
      'run-id',
      'url',
      'duration-ms',
      'size-kb',
    ])
  })

  it.each([
    ['duration', '✗ Storefront responded in 1840ms', '✗ Storefront responded in 210ms'],
    ['size', '✗ Bundle is 412KB', '✗ Bundle is 398KB'],
    ['timestamp', '✗ Token expired at 2026-09-14T03:59:52Z', '✗ Token expired at 2026-09-15T21:37:59Z'],
    [
      'run id',
      '✗ Compare against actions/runs/34899857722',
      '✗ Compare against actions/runs/34927043854',
    ],
    [
      'url',
      `✗ Deployment unreachable: ${RUN_A}`,
      `✗ Deployment unreachable: ${RUN_B}`,
    ],
  ])('a %s on a verdict line does not make two runs look different', (_what, a, b) => {
    expect(diagnosisKey(a)).toBe(diagnosisKey(b))
  })

  it('a volatile field NOT on the list still breaks the comparison — by design', () => {
    // This is the instruction in the module header, asserted. A new per-run figure on a
    // verdict line reintroduces the original bug in full, and it fails loudly here rather
    // than quietly in production six hours later. The fix is a NORMALISERS entry, never a
    // looser comparison.
    expect(diagnosisKey('✗ Retried 4 times')).not.toBe(diagnosisKey('✗ Retried 7 times'))
  })

  it('normaliseVolatile leaves text with no volatile token alone', () => {
    expect(normaliseVolatile('✗ WRONG SECRET (HTTP 401)')).toBe('✗ WRONG SECRET (HTTP 401)')
  })

  it('normalises a URL and the run id inside it together', () => {
    expect(normaliseVolatile(RUN_A)).toBe(normaliseVolatile(RUN_B))
  })
})

describe('the stated limit of the relation', () => {
  /**
   * Detail bullets under a `✗` header are not part of the key. Recorded as a passing
   * assertion rather than as prose, because a limit nobody asserts is a limit nobody
   * notices has changed — and the direction it errs in (toward quiet) is the direction
   * that does not look broken.
   */
  it('a different secret under the same ✗ header compares EQUAL', () => {
    const other = ISSUE_24_RUN_B.replace(
      'SHOPIFY_ADMIN_ACCESS_TOKEN does not start with "shpat_"',
      'SHOPIFY_STOREFRONT_ACCESS_TOKEN does not start with "shpat_"'
    )
    expect(other).not.toBe(ISSUE_24_RUN_B)
    expect(diagnosisKey(other)).toBe(diagnosisKey(ISSUE_24_RUN_B))
  })

  it('a ✓ line is never part of the key', () => {
    const withPass = '✓ Open Graph image renders within the crawler budget\n✗ WRONG SECRET'
    expect(diagnosisKey(withPass)).toBe('✗ WRONG SECRET')
  })
})

describe('a body with no verdict line at all', () => {
  const NOTHING = 'No step produced output — the run failed before the checks started.'

  it('falls back to the whole text rather than to an empty key', () => {
    expect(diagnosisKey(NOTHING)).toBe(NOTHING)
  })

  it('so two different unparseable reports are still different', () => {
    // The failure mode this fallback exists to prevent: an empty key makes every shape the
    // parser has not met equal to every other one, and a genuinely new failure disappears
    // into the standing streak.
    expect(diagnosisKey(NOTHING)).not.toBe(diagnosisKey('The runner ran out of disk.'))
  })

  it('and the report chrome around it is still ignored', () => {
    const wrapped = `Still failing.\n\nRun: ${RUN_A}\n\nUnchanged for 4 consecutive runs.\n\n${NOTHING}\n\n<!-- smoke-streak: 4 -->`
    expect(diagnosisKey(wrapped)).toBe(diagnosisKey(NOTHING))
  })
})

describe('no open issue', () => {
  it('opens one, labelled, with the diagnosis in the body', () => {
    const decision = decide({ issue: null, diagnosis: '✗ WRONG SECRET (HTTP 401)' })
    expect(decision.action).toBe('create')
    expect(decision.title).toBe(ISSUE_TITLE)
    expect(decision.labels).toEqual([SMOKE_LABEL])
    expect(decision.body).toContain('✗ WRONG SECRET (HTTP 401)')
    expect(decision.body).toContain(RUN_B)
    expect(decision.body).toContain('docs/go-live-runbook.md')
  })

  it('and writes nothing else — there is no thread to refresh yet', () => {
    const decision = decide({ issue: null })
    expect(decision.refresh).toBeNull()
    expect(decision.issueUpdate).toBeNull()
  })
})

describe('an open issue whose diagnosis has moved', () => {
  it('comments, and resets the streak to 1', () => {
    const decision = decide({
      comments: [report(composeReport({ runUrl: RUN_A, diagnosis: '✗ OLD', streak: 5 }))],
      diagnosis: '✗ NEW',
    })
    expect(decision.action).toBe('comment')
    expect(decision.streak).toBe(1)
    expect(decision.body).toContain('✗ NEW')
    expect(decision.body).toContain('<!-- smoke-streak: 1 -->')
  })

  it('clears an existing escalation so the new cause can escalate in its own right', () => {
    // The original step never removed the label, so `alreadyEscalated` stayed true forever
    // and the first escalation would have been the last one — while the comment it posted
    // promised "until the diagnosis changes".
    const decision = decide({
      issue: openIssue({ title: '[escalated] Production smoke is failing' }),
      comments: [report(composeReport({ runUrl: RUN_A, diagnosis: '✗ OLD' }))],
      diagnosis: '✗ NEW',
      labels: [SMOKE_LABEL, ESCALATION_LABEL],
    })
    expect(decision.action).toBe('comment')
    expect(decision.issueUpdate).toEqual({
      title: ISSUE_TITLE,
      labels: [SMOKE_LABEL],
    })
  })

  it('leaves the issue alone when it was never escalated', () => {
    const decision = decide({
      comments: [report(composeReport({ runUrl: RUN_A, diagnosis: '✗ OLD' }))],
      diagnosis: '✗ NEW',
    })
    expect(decision.issueUpdate).toBeNull()
  })

  it('treats an open issue with no reports yet as the first repeat', () => {
    const decision = decide({ comments: [], diagnosis: '✗ WRONG SECRET' })
    expect(decision.action).toBe('comment')
    expect(decision.streak).toBe(1)
    expect(decision.reason).toContain('first repeat')
  })
})

describe('an open issue reporting the same failure again', () => {
  const diagnosis = ISSUE_24_RUN_B

  function threadAt(streak: number, id = 7) {
    return [report(composeReport({ runUrl: RUN_A, diagnosis: ISSUE_24_RUN_A, streak }), id)]
  }

  it('counts instead of repeating, and posts nothing', () => {
    const decision = decide({ comments: threadAt(1), diagnosis })
    expect(decision.action).toBe('stay-quiet')
    expect(decision.streak).toBe(2)
    expect(decision.body).toBeNull()
  })

  it('records the count by editing the standing comment in place', () => {
    // The only way to count runs in a workflow that remembers nothing. An edit does not
    // notify, so the thread stays quiet while the counter still advances — which is what
    // makes the threshold reachable at all.
    const decision = decide({ comments: threadAt(1, 7), diagnosis })
    expect(decision.refresh?.commentId).toBe(7)
    expect(decision.refresh?.body).toContain('<!-- smoke-streak: 2 -->')
    expect(decision.refresh?.body).toContain('Unchanged for 2 consecutive runs.')
  })

  it('escalates exactly at the threshold', () => {
    const decision = decide({ comments: threadAt(ESCALATION_THRESHOLD - 1), diagnosis })
    expect(decision.action).toBe('escalate')
    expect(decision.streak).toBe(ESCALATION_THRESHOLD)
    expect(decision.body).toContain(`Same diagnosis for ${ESCALATION_THRESHOLD} consecutive runs`)
    expect(decision.issueUpdate).toEqual({
      title: '[escalated] Production smoke is failing',
      labels: [SMOKE_LABEL, ESCALATION_LABEL],
    })
  })

  it('and not one run before it', () => {
    // Both sides of the boundary, because every interesting bug in a threshold lives here
    // and none of them is reachable by waiting for the schedule.
    const decision = decide({ comments: threadAt(ESCALATION_THRESHOLD - 2), diagnosis })
    expect(decision.action).toBe('stay-quiet')
    expect(decision.streak).toBe(ESCALATION_THRESHOLD - 1)
  })

  it('escalates once, then stays quiet however long it goes on', () => {
    const decision = decide({
      comments: threadAt(40),
      diagnosis,
      labels: [SMOKE_LABEL, ESCALATION_LABEL],
    })
    expect(decision.action).toBe('stay-quiet')
    expect(decision.streak).toBe(41)
    expect(decision.body).toBeNull()
    expect(decision.issueUpdate).toBeNull()
    // Still counting, though — so the issue says how long, and a human reading it does not
    // have to count comments to find out.
    expect(decision.refresh?.body).toContain('Unchanged for 41 consecutive runs.')
  })

  it('does not prefix the title twice on a re-escalation', () => {
    const decision = decide({
      issue: openIssue({ title: '[escalated] Production smoke is failing' }),
      comments: threadAt(ESCALATION_THRESHOLD - 1),
      diagnosis,
    })
    expect(decision.issueUpdate?.title).toBe('[escalated] Production smoke is failing')
  })

  it('a report with no streak marker reads as 1, not as NaN', () => {
    // Every comment already on issue #24 predates the marker. `NaN + 1` is `NaN`,
    // `NaN < 3` is false, and the channel would have escalated on the very next run of a
    // month-old thread. Reading 1 delays an escalation rather than inventing one.
    const decision = decide({
      comments: [report(`Still failing.\n\nRun: ${RUN_A}\n\n${ISSUE_24_RUN_A}`)],
      diagnosis,
    })
    expect(decision.streak).toBe(2)
  })
})

describe('comments that are not this channel talking', () => {
  const diagnosis = ISSUE_24_RUN_B
  const standing = report(composeReport({ runUrl: RUN_A, diagnosis: ISSUE_24_RUN_A, streak: 2 }), 7)

  it('an escalation comment does not become the baseline', () => {
    // It carries no verdict line, so a naive tail read would see the diagnosis "change"
    // on the very next run — restarting the cycle the escalation had just ended.
    const decision = decide({
      comments: [standing, report('Same diagnosis for 3 consecutive runs — escalating instead of', 8)],
      diagnosis,
      labels: [SMOKE_LABEL, ESCALATION_LABEL],
    })
    expect(decision.action).toBe('stay-quiet')
    expect(decision.streak).toBe(3)
    expect(decision.refresh?.commentId).toBe(7)
  })

  it('a human replying on the thread does not reset the streak either', () => {
    const decision = decide({
      comments: [standing, report('Looking at this now — the token is in the wrong slot.', 9)],
      diagnosis,
    })
    expect(decision.action).toBe('escalate')
    expect(decision.streak).toBe(3)
  })
})

describe('the tail of a long thread', () => {
  /**
   * The second, independent defect in the shipped step: `listComments({ per_page: 100 })`
   * with no pagination, and then `comments[comments.length - 1]`. GitHub returns page one,
   * so past a hundred comments "the last comment" is the hundredth-*oldest* and the
   * comparison is against a month-old diagnosis forever.
   *
   * Issue #24 sat at exactly 100 comments when this was written — one short of the cliff.
   * The transport now pages; this asserts the decision reads the true tail it is handed.
   */
  const thread = Array.from({ length: 150 }, (_, i) =>
    i === 149
      ? report(composeReport({ runUrl: RUN_A, diagnosis: '✗ NEWEST CAUSE', streak: 6 }), 999)
      : report(composeReport({ runUrl: RUN_A, diagnosis: '✗ ANCIENT CAUSE', streak: 2 }), i)
  )

  it('is what the decision compares against, not the hundredth comment', () => {
    const decision = decide({ comments: thread, diagnosis: '✗ NEWEST CAUSE' })
    expect(decision.action).toBe('escalate')
    expect(decision.streak).toBe(7)
    expect(decision.refresh?.commentId).toBe(999)
  })

  it('and a diagnosis matching only the old head still reads as changed', () => {
    const decision = decide({ comments: thread, diagnosis: '✗ ANCIENT CAUSE' })
    expect(decision.action).toBe('comment')
    expect(decision.streak).toBe(1)
  })
})

describe('composeDiagnosis', () => {
  it('wraps each step log in its own details block, in order', () => {
    const composed = composeDiagnosis([
      { name: 'preflight', text: '✗ Secrets set to the wrong kind of value' },
      { name: 'webhook', text: '✗ WRONG SECRET (HTTP 401)' },
    ])
    expect(composed).toContain('**What failed:**')
    expect(composed.indexOf('<code>preflight</code>')).toBeLessThan(
      composed.indexOf('<code>webhook</code>')
    )
  })

  it('drops a step that produced nothing rather than printing an empty heading', () => {
    const composed = composeDiagnosis([
      { name: 'preflight', text: '   ' },
      { name: 'webhook', text: '✗ WRONG SECRET' },
    ])
    expect(composed).not.toContain('preflight')
  })

  it('keeps the tail, because the verdict is at the end of the log', () => {
    const composed = composeDiagnosis([
      { name: 'storefront', text: `${'x'.repeat(MAX_LOG + 500)}\n✗ THE VERDICT` },
    ])
    expect(composed).toContain('✗ THE VERDICT')
    expect(composed).toContain('…(truncated, see the run)')
  })

  it('says so plainly when no step ran at all', () => {
    expect(composeDiagnosis([])).toContain('No step produced output')
  })

  it('and that sentence is still a comparable key', () => {
    expect(diagnosisKey(composeDiagnosis([]))).toBe(composeDiagnosis([]))
  })
})

describe('small shapes the transport hands over raw', () => {
  it('labelNames accepts both shapes GitHub returns', () => {
    expect(labelNames([SMOKE_LABEL, { name: ESCALATION_LABEL }])).toEqual([
      SMOKE_LABEL,
      ESCALATION_LABEL,
    ])
  })

  it('labelNames survives an absent list', () => {
    expect(labelNames(undefined as never)).toEqual([])
  })

  it('readStreak reads its own marker back', () => {
    expect(readStreak(composeReport({ runUrl: RUN_A, diagnosis: '✗ X', streak: 12 }))).toBe(12)
  })

  it('and the visible line agrees with the marker', () => {
    const body = composeReport({ runUrl: RUN_A, diagnosis: '✗ X', streak: 12 })
    expect(body).toContain('Unchanged for 12 consecutive runs.')
    expect(readStreak(body)).toBe(12)
  })

  it('a first report carries no "unchanged" line to contradict itself', () => {
    expect(composeReport({ runUrl: RUN_A, diagnosis: '✗ X' })).not.toContain('Unchanged for')
  })
})

describe('the workflow step is a transport and nothing else', () => {
  /**
   * The extraction is only real if the workflow actually calls the extracted module. A
   * `scripts/lib` file nothing imports is the shape `ci.yml` already shipped once — a
   * `fetch-depth: 0` carried for an auditor that was invoked nowhere.
   *
   * This also pins the import specifier. `actions/github-script` runs the block through
   * `new AsyncFunction`, where a relative specifier has no referrer to resolve against, so
   * the path must be absolute. A typo here fails at 03:59 UTC in a scheduled job, six
   * hours after the commit that caused it.
   */
  const workflow = parse(
    readFileSync(join(ROOT, '.github/workflows/production-smoke.yml'), 'utf8')
  ) as { jobs?: Record<string, { steps?: Array<{ name?: string; with?: { script?: string } }> }> }

  const step = Object.values(workflow.jobs ?? {})
    .flatMap((job) => job.steps ?? [])
    .find((s) => s.name === 'Report failure as an issue')

  const script = String(step?.with?.script ?? '')

  it('the step still exists', () => {
    expect(step, 'the failure-reporting step was renamed or removed').toBeTruthy()
    expect(script.length).toBeGreaterThan(0)
  })

  it('imports scripts/lib/escalation.mjs by absolute path', () => {
    expect(script).toContain('scripts/lib/escalation.mjs')
    expect(script).toContain('GITHUB_WORKSPACE')
  })

  it('every name it destructures is actually exported', async () => {
    // The import is resolved at 03:59 UTC inside a scheduled job. A name that moved would
    // surface there and nowhere else, which is the class of defect this whole PR is about.
    const exported = await import('../../../scripts/lib/escalation.mjs')
    const destructured = /const\s*\{([^}]*)\}\s*=\s*await import/.exec(script)?.[1] ?? ''
    const names = destructured
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)

    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(Object.keys(exported), `the step imports ${name}, which is not exported`).toContain(
        name
      )
    }
  })

  it('pages the comments instead of taking the first hundred', () => {
    // The bug: `per_page: 100` with no pagination, then `comments[comments.length - 1]`.
    // Past a hundred comments that is the hundredth-oldest.
    expect(script).toContain('github.paginate')
    expect(script).not.toMatch(/listComments\(\{/)
  })

  it('composes no sentence of its own', () => {
    // Every human-readable string belongs in the module, where a test can read it. The
    // transport may name labels and paths; it may not write prose.
    const sentences = script.match(/'[^']{60,}'|`[^`]{60,}`/g) ?? []
    const prose = sentences.filter((s) => !s.includes('${') && /\s\w+\s\w+\s\w+\s/.test(s))
    expect(prose, `the step still composes text: ${prose.join(' | ')}`).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures: real comment bodies, captured verbatim from issue #24.
 *
 * Comment 5671158651 (2026-09-14T21:37:59Z, 194ms) and comment 5674519891
 * (2026-09-15T03:59:21Z, 163ms). Six hours apart, one unchanged cause, and the shipped
 * comparison called them different failures — as it did for the ninety-eight before them.
 *
 * Captured rather than written, because a fixture shaped to the parser only ever proves
 * the parser agrees with itself (ADR 028). These two carry a truncation marker, a details
 * block per step, a run URL, two per-run measurements and a UTF-8 bullet list, none of
 * which would have occurred to anyone writing a fixture by hand.
 * ──────────────────────────────────────────────────────────────────────── */

const ISSUE_24_RUN_A = `Still failing.

Run: https://github.com/sannguyen01/Healthy-Jewelry/actions/runs/34899857722

**What failed:**

<details><summary><code>preflight</code></summary>

\`\`\`
✗ Secrets set to the wrong kind of value

1 secret is set to a value of the wrong kind.

These are present, so every presence check passes. They are still wrong, and the
API that receives them reports it in a way that reads as an outage rather than a
configuration error:

  · SHOPIFY_ADMIN_ACCESS_TOKEN does not start with "shpat_". Admin API tokens always do. This is the same swap as
    above in the other direction — likely a Storefront token in the Admin slot.

Fix the value, then redeploy. For NEXT_PUBLIC_* variables in Vercel, redeploy with
"Use existing Build Cache" UNCHECKED — they are inlined at build time.
\`\`\`
</details>
<details><summary><code>storefront</code></summary>

\`\`\`
…(truncated, see the run)
sts with 401

✓ Open Graph image renders within the crawler budget
  194ms cold, 17KB (budget 2500ms)

──────────────────────────────────────────────────────────────────────
Store observations (never failures)

  · Store identity: could not be evaluated — Admin API could not be evaluated — the API rejected this token (HTTP 401).
  Shopify says: [API] Invalid API key or access token (unrecognized login or wrong password)
  This is a credential problem, NOT a finding about the store. SHOPIFY_ADMIN_ACCESS_TOKEN does not hold
  a token this API recognises — most often a token for the *other* surface, which is a
  different credential rather than a differently-scoped one. Correct it in the Shopify
  admin; no code change resolves this, and no other check here depends on it.

· premises could not be evaluated: Admin API could not be evaluated — the API rejected this token (HTTP 401).

Open Graph cold render: 194ms (budget 2500ms)

──────────────────────────────────────────────────────────────────────
10/17 checks passed

Failed: Rate limiting is distributed, not per-instance, A signed webhook actually revalidates the cached page

Could not be evaluated: Shopify serves the pinned API version, Every product is published to the headless publication, Checkout policies exist and are not stock templates, A photographed product actually shows its photograph, The catalogue has product photography at all
\`\`\`
</details>
<details><summary><code>webhook</code></summary>

\`\`\`
→ POST https://healthyjewellery.com/api/webhooks/shopify
  topic: products/update, shop: y0k9ve-q1.myshopify.com

✗ WRONG SECRET (HTTP 401)
The deployment computed a different signature. SHOPIFY_WEBHOOK_SECRET is almost certainly the wrong one of the two:
  · webhooks created in Shopify Admin (Settings → Notifications) are signed with
    the signing secret shown on that page;
  · webhooks created by an app are signed with the app client secret.
They are not interchangeable. (A mismatched x-shopify-shop-domain also 401s.)
\`\`\`
</details>`

const ISSUE_24_RUN_B = `Still failing.

Run: https://github.com/sannguyen01/Healthy-Jewelry/actions/runs/34927043854

**What failed:**

<details><summary><code>preflight</code></summary>

\`\`\`
✗ Secrets set to the wrong kind of value

1 secret is set to a value of the wrong kind.

These are present, so every presence check passes. They are still wrong, and the
API that receives them reports it in a way that reads as an outage rather than a
configuration error:

  · SHOPIFY_ADMIN_ACCESS_TOKEN does not start with "shpat_". Admin API tokens always do. This is the same swap as
    above in the other direction — likely a Storefront token in the Admin slot.

Fix the value, then redeploy. For NEXT_PUBLIC_* variables in Vercel, redeploy with
"Use existing Build Cache" UNCHECKED — they are inlined at build time.
\`\`\`
</details>
<details><summary><code>storefront</code></summary>

\`\`\`
…(truncated, see the run)
sts with 401

✓ Open Graph image renders within the crawler budget
  163ms cold, 17KB (budget 2500ms)

──────────────────────────────────────────────────────────────────────
Store observations (never failures)

  · Store identity: could not be evaluated — Admin API could not be evaluated — the API rejected this token (HTTP 401).
  Shopify says: [API] Invalid API key or access token (unrecognized login or wrong password)
  This is a credential problem, NOT a finding about the store. SHOPIFY_ADMIN_ACCESS_TOKEN does not hold
  a token this API recognises — most often a token for the *other* surface, which is a
  different credential rather than a differently-scoped one. Correct it in the Shopify
  admin; no code change resolves this, and no other check here depends on it.

· premises could not be evaluated: Admin API could not be evaluated — the API rejected this token (HTTP 401).

Open Graph cold render: 163ms (budget 2500ms)

──────────────────────────────────────────────────────────────────────
10/17 checks passed

Failed: Rate limiting is distributed, not per-instance, A signed webhook actually revalidates the cached page

Could not be evaluated: Shopify serves the pinned API version, Every product is published to the headless publication, Checkout policies exist and are not stock templates, A photographed product actually shows its photograph, The catalogue has product photography at all
\`\`\`
</details>
<details><summary><code>webhook</code></summary>

\`\`\`
→ POST https://healthyjewellery.com/api/webhooks/shopify
  topic: products/update, shop: y0k9ve-q1.myshopify.com

✗ WRONG SECRET (HTTP 401)
The deployment computed a different signature. SHOPIFY_WEBHOOK_SECRET is almost certainly the wrong one of the two:
  · webhooks created in Shopify Admin (Settings → Notifications) are signed with
    the signing secret shown on that page;
  · webhooks created by an app are signed with the app client secret.
They are not interchangeable. (A mismatched x-shopify-shop-domain also 401s.)
\`\`\`
</details>`
