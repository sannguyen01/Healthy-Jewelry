import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { judgeDenial, contextState, pollMergeable, evidenceRecord, DENIAL_VERDICTS } = await import(
  '../../../scripts/lib/merge-denial.mjs'
)
const { parseArgs } = await import('../../../scripts/probe-merge-denial.mjs')

/**
 * **Proving a merge gate denies a bad pull request, without pressing merge.**
 *
 * The owner's exit test was "open a known-bad PR and have GitHub refuse the merge". Pressing
 * merge to find out is destructive in exactly the case the test exists for: a misconfigured
 * rule lets the bad change onto `main`, and `main` auto-deploys to production. GitHub already
 * computes the answer as `mergeable_state`, so the proof is a reading — and every branch of the
 * judgement over that reading is a fixture here (ADR 024).
 */

const ROOT = resolve(__dirname, '../../..')
const REQUIRED = ['Lint · Type-check · Unit tests · Build', 'Dependency scope', 'E2E tests (Playwright)']

const run = (name: string, conclusion: string | null, status = 'completed', completed_at = '2026-09-26T10:00:00Z') => ({
  name,
  status,
  conclusion,
  completed_at,
})
const allPassing = REQUIRED.map((name) => run(name, 'success'))
const verifyFails = [run(REQUIRED[0], 'failure'), run(REQUIRED[1], 'success'), run(REQUIRED[2], 'skipped')]

/**
 * What a canary must also be read as, before a block can be pinned on its failing check: not a
 * draft, free of conflicts, and not behind its base. These fixtures carried none of it until
 * 2026-09-27 and read `denied` — the judgement took GitHub's "blocked" as meaning "blocked by the
 * check", when GitHub had reported PR #90 "clean" while it was a draft.
 */
const READY = { draft: false, mergeable: true, behindBy: 0 } as const

describe('judgeDenial — each verdict from a known answer', () => {
  it('denied: blocked, and a required check failed on the head commit', () => {
    const result = judgeDenial({ mergeableState: 'blocked', requiredContexts: REQUIRED, checkRuns: verifyFails, ...READY })
    expect(result.verdict).toBe('denied')
    expect(result.reason).toBe('required-context-unmet')
    expect(result.unmet).toEqual([REQUIRED[0]])
    expect(result.contexts[REQUIRED[0]]).toBe('failing')
  })

  it('denied also when the required check is still pending, or never reported', () => {
    for (const checkRuns of [[run(REQUIRED[0], null, 'in_progress')], []]) {
      expect(judgeDenial({ mergeableState: 'blocked', requiredContexts: REQUIRED, checkRuns, ...READY }).verdict).toBe('denied')
    }
  })

  // Under READY too, because that is how a canary the gate let through actually reads — not a
  // draft, no conflicts, up to date. Both rows matter. The "unread" rows catch a working button
  // misread as a block (`|| buttonWorks`): it falls through to `precondition-unknown`, which is
  // not NOT-DENIED. The "ready" rows are the only ones that catch the same mistake written
  // against the `mergeable` *parameter* (`|| mergeable`) — null in every unread fixture, so a
  // no-op there. That form is what merge-denial-attribution read after 7cdb6ea renamed the
  // local, and with only unread rows it stayed green.
  it.each([
    ['clean', 'unread', {}],
    ['unstable', 'unread', {}],
    ['has_hooks', 'unread', {}],
    ['clean', 'ready', READY],
    ['unstable', 'ready', READY],
    ['has_hooks', 'ready', READY],
  ] as const)(
    'NOT-DENIED: "%s" (preconditions %s) while a required check has failed — the gate did not hold',
    (mergeableState, _label, preconditions) => {
      const result = judgeDenial({ mergeableState, requiredContexts: REQUIRED, checkRuns: verifyFails, ...preconditions })
      expect(result.verdict).toBe('NOT-DENIED')
      expect(result.detail).toContain(REQUIRED[0])
    }
  )

  it('NOT-DENIED: mergeable with no required context at all', () => {
    expect(judgeDenial({ mergeableState: 'clean', requiredContexts: [], checkRuns: verifyFails })).toMatchObject({
      verdict: 'NOT-DENIED',
      reason: 'no-required-contexts',
    })
  })

  it.each([null, undefined, 'unknown'])('unevaluable: mergeability %s is not computed yet', (mergeableState) => {
    // GitHub computes it lazily. "Not yet known" is not "allowed".
    const result = judgeDenial({ mergeableState, requiredContexts: REQUIRED, checkRuns: verifyFails })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('mergeability-not-computed')
  })

  it('unevaluable: the rules could not be read (a 401/403 is never a verdict)', () => {
    const result = judgeDenial({ mergeableState: 'blocked', requiredContexts: null, checkRuns: verifyFails })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('rules-unreadable')
  })

  it('unevaluable: blocked, but every required check passed — the block is something else', () => {
    const result = judgeDenial({ mergeableState: 'blocked', requiredContexts: REQUIRED, checkRuns: allPassing })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('blocked-for-another-reason')
  })

  it('unevaluable: mergeable and every required check passed — the canary is not bad', () => {
    expect(
      judgeDenial({ mergeableState: 'clean', requiredContexts: REQUIRED, checkRuns: allPassing }).reason
    ).toBe('canary-not-failing')
  })

  it.each([
    ['behind', 'state-behind'],
    ['dirty', 'state-dirty'],
    ['draft', 'state-draft'],
    ['something-new', 'state-unrecognised'],
  ])('unevaluable: "%s" blocks for a reason that is not the checks', (mergeableState, reason) => {
    const result = judgeDenial({ mergeableState, requiredContexts: REQUIRED, checkRuns: verifyFails })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe(reason)
  })

  it('emits only the declared verdicts', () => {
    expect([...DENIAL_VERDICTS].sort()).toEqual(['NOT-DENIED', 'denied', 'unevaluable'])
  })
})

describe('judgeDenial — a block is pinned on the check only when nothing else explains it', () => {
  const blocked = { mergeableState: 'blocked', requiredContexts: REQUIRED, checkRuns: verifyFails }

  it.each([
    [{ draft: true, mergeable: true, behindBy: 0 }, 'draft'],
    [{ draft: false, mergeable: false, behindBy: 0 }, 'conflicts'],
    [{ draft: false, mergeable: true, behindBy: 3 }, 'behind-base'],
    [{ draft: null, mergeable: true, behindBy: 0 }, 'precondition-unknown:draft'],
    [{ draft: false, mergeable: null, behindBy: 0 }, 'precondition-unknown:mergeable'],
    [{ draft: false, mergeable: true, behindBy: null }, 'precondition-unknown:behindBy'],
  ])('%o → unevaluable (%s), never denied', (readings, reason) => {
    expect(judgeDenial({ ...blocked, ...readings })).toMatchObject({ verdict: 'unevaluable', reason })
  })

  it('behind its base is no reason to withhold a denial when the rules do not require up to date', () => {
    expect(judgeDenial({ ...blocked, draft: false, mergeable: true, behindBy: 1, requireUpToDate: false }).verdict).toBe('denied')
    expect(judgeDenial({ ...blocked, draft: false, mergeable: true, behindBy: null, requireUpToDate: false }).verdict).toBe('denied')
    // Strict, or strictness unknown: behind may be the reason, so it is ruled out first.
    expect(judgeDenial({ ...blocked, draft: false, mergeable: true, behindBy: 1, requireUpToDate: true }).reason).toBe('behind-base')
    expect(judgeDenial({ ...blocked, draft: false, mergeable: true, behindBy: 1 }).reason).toBe('behind-base')
  })

  it('NOT-DENIED is never held back by an unknown precondition — a gate that did not hold is reportable', () => {
    expect(judgeDenial({ mergeableState: 'clean', requiredContexts: REQUIRED, checkRuns: verifyFails })).toMatchObject({
      verdict: 'NOT-DENIED',
    })
  })

  it('head failing and the test merge commit passing the same context → unevaluable, not denied', () => {
    const result = judgeDenial({ ...blocked, ...READY, mergeCommitRuns: allPassing, mergeCommitStatuses: [] })
    expect(result).toMatchObject({ verdict: 'unevaluable', reason: 'head-merge-attribution-disagrees' })
    expect(result.detail).toContain(REQUIRED[0])
  })

  it('and the other direction: head passing, merge commit failing', () => {
    const result = judgeDenial({
      mergeableState: 'blocked',
      requiredContexts: REQUIRED,
      checkRuns: [run(REQUIRED[0], 'success'), run(REQUIRED[1], 'failure'), run(REQUIRED[2], 'success')],
      ...READY,
      mergeCommitRuns: allPassing.map((r) => (r.name === REQUIRED[1] ? { ...r, conclusion: 'success' } : r)).map((r) =>
        r.name === REQUIRED[0] ? { ...r, conclusion: 'failure' } : r
      ),
      mergeCommitStatuses: [],
    })
    expect(result.reason).toBe('head-merge-attribution-disagrees')
  })

  it('nothing reported on the merge commit is not a disagreement: the head decides', () => {
    const result = judgeDenial({ ...blocked, ...READY, mergeCommitRuns: [], mergeCommitStatuses: [] })
    expect(result.verdict).toBe('denied')
    expect(result.mergeContexts).toEqual(Object.fromEntries(REQUIRED.map((c) => [c, 'missing'])))
  })

  it('agreeing head and merge commit still deny, and both readings are kept', () => {
    const result = judgeDenial({ ...blocked, ...READY, mergeCommitRuns: verifyFails, mergeCommitStatuses: [] })
    expect(result.verdict).toBe('denied')
    expect(result.mergeContexts?.[REQUIRED[0]]).toBe('failing')
  })
})

describe('contextState — which run speaks for a required context', () => {
  it('treats success, neutral and skipped as passing, as GitHub does', () => {
    // `skipped` passing is the hole the dependency-scope comment in ci.yml documents.
    for (const conclusion of ['success', 'neutral', 'skipped']) {
      expect(contextState('x', [run('x', conclusion)])).toBe('passing')
    }
  })

  it.each(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'])(
    'treats %s as failing',
    (conclusion) => {
      expect(contextState('x', [run('x', conclusion)])).toBe('failing')
    }
  )

  it('lets the newest run win, so a re-run supersedes the failure before it', () => {
    const runs = [run('x', 'failure', 'completed', '2026-09-26T10:00:00Z'), run('x', 'success', 'completed', '2026-09-26T11:00:00Z')]
    expect(contextState('x', runs)).toBe('passing')
    expect(contextState('x', [...runs].reverse())).toBe('passing')
  })

  it('falls back to a commit status, then to missing', () => {
    expect(contextState('x', [], [{ context: 'x', state: 'failure' }])).toBe('failing')
    expect(contextState('x', [], [{ context: 'x', state: 'pending' }])).toBe('pending')
    expect(contextState('x', [], [{ context: 'x', state: 'success' }])).toBe('passing')
    expect(contextState('x', [], [])).toBe('missing')
  })
})

describe('pollMergeable waits out GitHub computing mergeability lazily', () => {
  it('re-reads until the state is known, with backoff', async () => {
    const answers = [{ mergeable_state: 'unknown' }, { mergeable_state: null }, { mergeable_state: 'blocked' }]
    const slept: number[] = []
    const { pr, attempts } = await pollMergeable(async () => answers.shift() ?? {}, {
      delaysMs: [1, 2, 3],
      sleep: async (ms: number) => void slept.push(ms),
    })
    expect(pr?.mergeable_state).toBe('blocked')
    expect(attempts).toBe(3)
    expect(slept).toEqual([1, 2])
  })

  it('gives up after the last delay and returns what it has', async () => {
    const { pr, attempts } = await pollMergeable(async () => ({ mergeable_state: 'unknown' }), {
      delaysMs: [1, 1],
      sleep: async () => {},
    })
    expect(attempts).toBe(3)
    expect(judgeDenial({ mergeableState: pr?.mergeable_state, requiredContexts: REQUIRED }).verdict).toBe('unevaluable')
  })

  it('asks once and never sleeps when the first answer is already known, or when there is no backoff', async () => {
    // The two edges of the loop's exit condition: a known state on the first read, and an
    // empty schedule, where the only read is also the last.
    for (const [delaysMs, state] of [
      [[1, 2], 'blocked'],
      [[], 'unknown'],
    ] as const) {
      const slept: number[] = []
      const { pr, attempts } = await pollMergeable(async () => ({ mergeable_state: state }), {
        delaysMs: [...delaysMs],
        sleep: async (ms: number) => void slept.push(ms),
      })
      expect(attempts).toBe(1)
      expect(pr?.mergeable_state).toBe(state)
      expect(slept).toEqual([])
    }
  })
})

describe('the evidence record', () => {
  it('carries every field the canary procedure asks to be recorded, dated and attributed', () => {
    const judgement = judgeDenial({
      mergeableState: 'blocked',
      requiredContexts: REQUIRED,
      checkRuns: verifyFails,
      ...READY,
      mergeCommitRuns: [],
      mergeCommitStatuses: [],
    })
    const record = evidenceRecord({
      now: new Date('2026-09-26T12:00:00Z'),
      repo: 'sannguyen01/healthy-jewelry',
      prNumber: 90,
      headSha: 'a'.repeat(40),
      baseRef: 'main',
      attempts: 2,
      mergeableState: 'blocked',
      protection: { state: 'protected' },
      judgement,
      mergeCommitSha: 'b'.repeat(40),
      ...READY,
      rulesetIds: ['4242'],
      observer: 'sannguyen01',
    })
    // The owner's list: PR number, head SHA, ruleset ID, required-context states, mergeability
    // result, timestamp, observer — plus the merge commit and the three preconditions.
    expect(record).toMatchObject({
      recordedAt: '2026-09-26T12:00:00.000Z',
      observer: 'sannguyen01',
      pullRequest: 90,
      headSha: 'a'.repeat(40),
      mergeCommitSha: 'b'.repeat(40),
      rulesetIds: ['4242'],
      mergeableState: 'blocked',
      draft: false,
      mergeable: true,
      behindBy: 0,
      verdict: 'denied',
      requiredContexts: REQUIRED,
    })
    expect(record.contextStates[REQUIRED[0]]).toBe('failing')
    expect(record.mergeCommitContextStates).toEqual(Object.fromEntries(REQUIRED.map((c) => [c, 'missing'])))
    expect(record.note).toMatch(/skipped/)
    expect(record.method).toMatch(/read-only/)
  })

  it('records an unattributed run as unattributed, never a guessed name', () => {
    const judgement = judgeDenial({ mergeableState: 'blocked', requiredContexts: REQUIRED, checkRuns: verifyFails, ...READY })
    const record = evidenceRecord({
      now: new Date(), repo: 'r', prNumber: 1, headSha: 'a', baseRef: 'main', attempts: 1,
      mergeableState: 'blocked', protection: {}, judgement,
    })
    expect(record.observer).toBeNull()
    expect(record.rulesetIds).toEqual([])
  })
})

describe('parseArgs', () => {
  it('reads --pr and --out, and refuses a non-numeric pull request', () => {
    expect(parseArgs(['--pr', '90', '--out', 'e.json'])).toEqual({ pr: 90, out: 'e.json', observer: null })
    expect(parseArgs(['--pr', '90; rm -rf /'])).toEqual({ pr: null, out: null, observer: null })
    expect(parseArgs([])).toEqual({ pr: null, out: null, observer: null })
    // Recorded as given, trimmed and bounded; never inferred from a token.
    expect(parseArgs(['--pr', '7', '--observer', '  sannguyen01  ']).observer).toBe('sannguyen01')
    expect(parseArgs(['--pr', '7', '--observer', '   ']).observer).toBeNull()
  })
})

/**
 * **Defence in depth: the probe cannot merge, by construction.**
 *
 * A read-only proof is only read-only while nobody adds a write. These assert it on the
 * source, so a future edit that adds a merge call fails the merge gate — the one place such
 * an edit can be stopped before it runs against a real pull request.
 */
describe('the probe contains no path to a merge', () => {
  const sources = ['scripts/probe-merge-denial.mjs', 'scripts/lib/merge-denial.mjs'].map((p) => ({
    path: p,
    code: readFileSync(join(ROOT, p), 'utf8')
      // Comments may *talk about* merging; only code can do it.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }))

  it.each(sources.map((s) => [s.path, s] as const))('%s never references a /merge endpoint', (_p, s) => {
    // Not followed by a word character or a hyphen: the import path `./lib/merge-denial.mjs` is
    // a module, not an endpoint, and `/pulls/{n}/merge` is the endpoint this refuses.
    expect(s.code).not.toMatch(/\/merge(?![\w-])/)
    expect(s.code).not.toMatch(/merges\b/)
  })

  it.each(sources.map((s) => [s.path, s] as const))('%s never uses a writing HTTP method', (_p, s) => {
    expect(s.code).not.toMatch(/['"`](PUT|POST|PATCH|DELETE)['"`]/i)
    for (const method of s.code.matchAll(/method:\s*['"`](\w+)['"`]/g)) expect(method[1]).toBe('GET')
  })

  it('routes every request through the GET-only helper', () => {
    const probe = sources[0].code
    expect(probe).toContain("method: 'GET'")
    // One fetch call site: the helper. A second would be a request the helper does not govern.
    expect(probe.match(/\bfetch\(/g)).toHaveLength(1)
  })
})
