import { describe, it, expect } from 'vitest'

const {
  ACK_WINDOW_HOURS,
  LIVE_SURFACE_LABEL,
  LIVE_SURFACE_OVERDUE_LABEL,
  fingerprintOf,
  liveSurfaceIssuePlan,
  ownersFromCodeowners,
} = await import('../../../scripts/lib/live-surface-issue.mjs')
const { classifyDiscrepancy } = await import('../../../scripts/lib/live-surface.mjs')

/**
 * **The live-surface report has a person attached to it.**
 *
 * Until 2026-09-27 a non-clean classification became a job summary and a 30-day artifact and
 * nothing else. These cases are the lifecycle of the one issue that replaces that: opened,
 * updated in place, acknowledged by someone with standing, escalated once if nobody does,
 * re-armed when the finding changes, closed when the site is clean.
 */

const APEX = 'healthyjewellery.com'
const RUN = 'https://github.com/o/r/actions/runs/1'
const OWNERS = ['@sannguyen01']
const T0 = new Date('2026-09-27T00:00:00Z')
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000)

const host = (role: string, name: string, o: Record<string, unknown> = {}) => ({
  role,
  host: name,
  reachable: true,
  commit: 'c0ffee',
  commerce: false,
  digests: { '/': 'aaa' },
  ...o,
})
// The libraries are typed in JSDoc; these fixtures are deliberately partial, so they cross
// that boundary as `never` rather than restating every field the probe records.
const evidenceOf = (hosts: object[]) => ({ classification: classifyDiscrepancy({ hosts: hosts as never }) })
const mismatch = evidenceOf([host('apex', APEX, { commit: 'old1234' }), host('www', `www.${APEX}`)])
const unevaluable = evidenceOf([host('apex', APEX, { reachable: false })])
const clean = evidenceOf([host('apex', APEX), host('www', `www.${APEX}`)])

const plan = (o: Record<string, unknown>) =>
  liveSurfaceIssuePlan({ evidence: null, runUrl: RUN, owners: OWNERS, now: T0, openIssues: [], comments: [], ...o } as never)

/** The issue as the workflow would have created it from a plan. */
const opened = (body: string) => [{ number: 7, body }]

describe('liveSurfaceIssuePlan', () => {
  it('opens one labelled issue for a non-clean report, with the deadline in it', () => {
    const p = plan({ evidence: mismatch })
    expect(p).toMatchObject({ create: true, update: null, labels: [LIVE_SURFACE_LABEL], escalationComment: null })
    expect(p.body).toContain('host-identity-mismatch')
    expect(p.body).toContain(`Acknowledge by ${hours(ACK_WINDOW_HOURS).toISOString()}`)
    expect(p.body).toMatch(/\/ack/)
  })

  it('opens one for an unevaluable report too — not seeing is not clean', () => {
    expect(plan({ evidence: unevaluable }).create).toBe(true)
  })

  it('says nothing when the probe produced no verdict', () => {
    expect(plan({ evidence: null })).toMatchObject({ create: false, update: null, close: [] })
  })

  it('updates the same issue in place on the next run, keeping the original clock', () => {
    const first = plan({ evidence: mismatch })
    const next = plan({ evidence: mismatch, now: hours(6), openIssues: opened(first.body) })
    expect(next).toMatchObject({ create: false, update: 7, escalationComment: null })
    expect(next.body).toContain(`Acknowledge by ${hours(ACK_WINDOW_HOURS).toISOString()}`)
  })

  it('escalates exactly once after the window, naming the CODEOWNERS humans', () => {
    const first = plan({ evidence: mismatch })
    const late = plan({ evidence: mismatch, now: hours(ACK_WINDOW_HOURS + 1), openIssues: opened(first.body) })
    expect(late.escalationComment).toContain('@sannguyen01')
    expect(late.addLabels).toEqual([LIVE_SURFACE_OVERDUE_LABEL])

    const again = plan({
      evidence: mismatch,
      now: hours(ACK_WINDOW_HOURS + 7),
      openIssues: opened(first.body),
      comments: [{ body: late.escalationComment, created_at: hours(ACK_WINDOW_HOURS + 1).toISOString(), author_association: 'NONE' }],
    })
    expect(again.escalationComment, 'escalated twice for one finding').toBeNull()
  })

  it('an /ack from an owner, member or collaborator stops the escalation and clears overdue', () => {
    const first = plan({ evidence: mismatch })
    for (const author_association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
      const p = plan({
        evidence: mismatch,
        now: hours(ACK_WINDOW_HOURS + 1),
        openIssues: opened(first.body),
        comments: [{ body: '/ack reassigning www in Vercel', created_at: hours(2).toISOString(), author_association, user: { login: 'sannguyen01' } }],
      })
      expect(p.escalationComment, author_association).toBeNull()
      expect(p.acknowledged).toEqual({ by: '@sannguyen01', at: hours(2).toISOString() })
      expect(p.removeLabels).toEqual([LIVE_SURFACE_OVERDUE_LABEL])
      expect(p.body).toContain('Acknowledged')
    }
  })

  it('an /ack from someone without standing does not count', () => {
    const first = plan({ evidence: mismatch })
    for (const author_association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR']) {
      const p = plan({
        evidence: mismatch,
        now: hours(ACK_WINDOW_HOURS + 1),
        openIssues: opened(first.body),
        comments: [{ body: '/ack', created_at: hours(1).toISOString(), author_association }],
      })
      expect(p.acknowledged, author_association).toBeNull()
      expect(p.escalationComment, author_association).not.toBeNull()
    }
  })

  it('a changed finding restarts the clock, and an earlier /ack no longer covers it', () => {
    const first = plan({ evidence: mismatch })
    const ackedEarlier = [{ body: '/ack', created_at: hours(1).toISOString(), author_association: 'OWNER' }]
    const changed = plan({ evidence: unevaluable, now: hours(50), openIssues: opened(first.body), comments: ackedEarlier })
    expect(fingerprintOf(unevaluable.classification)).not.toBe(fingerprintOf(mismatch.classification))
    expect(changed.acknowledged).toBeNull()
    expect(changed.body).toContain(`Acknowledge by ${hours(50 + ACK_WINDOW_HOURS).toISOString()}`)
  })

  it('closes every open report when the site is clean again', () => {
    const p = plan({ evidence: clean, openIssues: [{ number: 7, body: 'x' }, { number: 9, body: 'y' }] })
    expect(p).toMatchObject({ close: [7, 9], create: false, update: null })
    expect(p.closeComment).toMatch(/clean again/)
  })

  it('keeps the purchase-era copy out of the finding, in words', () => {
    expect(plan({ evidence: mismatch }).body).toMatch(/not\*\* part of this finding/)
  })
})

describe('fingerprintOf', () => {
  it('is stable when only the details of a persisting problem fluctuate', () => {
    // A new deploy on the wrong alias, or a different path varying on the next run, is the same
    // finding: restarting its clock every six hours would mean it never escalates.
    const a = fingerprintOf(mismatch.classification)
    const newCommit = evidenceOf([host('apex', APEX, { commit: 'old9999' }), host('www', `www.${APEX}`)])
    expect(fingerprintOf(newCommit.classification)).toBe(a)
    const variance = (path: string) =>
      evidenceOf([host('apex', APEX, { digests: { [path]: 'a' }, warmDigests: { [path]: 'b' } }), host('www', `www.${APEX}`)])
    expect(fingerprintOf(variance('/shop').classification)).toBe(fingerprintOf(variance('/materials').classification))
  })

  it('moves when the kind of problem moves, and ignores hosts that are not edge', () => {
    const a = fingerprintOf(mismatch.classification)
    expect(fingerprintOf(unevaluable.classification)).not.toBe(a)
    const onWwwToo = evidenceOf([
      host('apex', APEX, { commit: 'old1234' }),
      host('www', `www.${APEX}`),
      host('preview', 'preview.example', { commit: 'zzz' }),
    ])
    // A preview host is not edge, so it does not change who is involved: same finding.
    expect(fingerprintOf(onWwwToo.classification)).toBe(a)
  })
})

describe('the overdue label follows the current finding', () => {
  it('comes off when the finding changes and its clock restarts', () => {
    const first = plan({ evidence: mismatch })
    const changed = plan({ evidence: unevaluable, now: hours(ACK_WINDOW_HOURS + 5), openIssues: opened(first.body) })
    expect(changed.escalationComment).toBeNull()
    expect(changed.addLabels).toEqual([])
    expect(changed.removeLabels).toEqual([LIVE_SURFACE_OVERDUE_LABEL])
  })

  it('stays on while the same finding is overdue and unacknowledged', () => {
    const first = plan({ evidence: mismatch })
    const late = plan({ evidence: mismatch, now: hours(ACK_WINDOW_HOURS + 5), openIssues: opened(first.body) })
    expect(late.addLabels).toEqual([LIVE_SURFACE_OVERDUE_LABEL])
    expect(late.removeLabels).toEqual([])
  })
})

describe('the workflow reads every comment', () => {
  it('paginates the comments an /ack or an escalation marker may be in', async () => {
    const { readFileSync } = await import('node:fs')
    const workflow = readFileSync('.github/workflows/control-audit.yml', 'utf8')
    const step = workflow.slice(workflow.indexOf('Report a live surface that needs a person'))
    expect(step).toContain('github.paginate(github.rest.issues.listComments')
  })
})

describe('ownersFromCodeowners', () => {
  it('collects every distinct owner, ignoring comments and blank lines', () => {
    const text = '# owners\n/docs/controls.json @sannguyen01\n\n/scripts/x.mjs @sannguyen01 @someone-else # note\n'
    expect(ownersFromCodeowners(text)).toEqual(['@sannguyen01', '@someone-else'])
  })

  it('reads the real file and finds the one human it names today', async () => {
    const { readFileSync } = await import('node:fs')
    expect(ownersFromCodeowners(readFileSync('.github/CODEOWNERS', 'utf8'))).toEqual(['@sannguyen01'])
  })
})
