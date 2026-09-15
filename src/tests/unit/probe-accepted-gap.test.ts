import { describe, it, expect } from 'vitest'

const { acceptedControls, ageAcceptances, escalationDecision, composeBody, ISSUE_LABEL } =
  await import('../../../scripts/probe-accepted-gap.mjs')
const { ACCEPTED_GAP_MAX_AGE_DAYS } = await import('../../../scripts/lib/accepted-gap.mjs')

/**
 * The decision that decides whether a person hears about a forgotten acceptance.
 *
 * ## Why this file exists at all
 *
 * The check it covers used to be an assertion inside the merge gate, comparing
 * `acceptedSince` against `Date.now()`. That version had exactly one way to be exercised:
 * wait thirty-one days. On 2026-09-15 it was exercised, and it turned every pull request
 * in the repository red over a GitHub Settings action no diff can affect — including two
 * dependabot PRs. See [ADR 029](../../../docs/adr/029-a-governance-clock-is-not-a-merge-gate.md).
 *
 * Moving it into a probe is only an improvement if the probe's decision is reachable
 * without waiting. So every case below injects its own clock, and the boundary is asserted
 * from both sides — because the interesting bugs in a threshold check are all at the
 * boundary, and none of them is reachable from a calendar.
 *
 * ## The two failure modes this is really guarding
 *
 * **Speaking when it should not.** An alarm that fires on a fresh acceptance is an alarm
 * that gets muted, and a muted alarm is the state `merge-gate` was already in
 * ([ADR 011](../../../docs/adr/011-repeated-identical-failures-must-escalate.md)).
 *
 * **Staying quiet when it should speak.** Subtler, and the one the old assertion actually
 * had: a malformed `acceptedSince` produces `NaN`, `NaN > 30` is `false`, and the gap reads
 * as permanently fresh. `control-registry.test.ts` now rejects that shape in the gate, and
 * the probe is asserted here to treat a missing date as maximally stale rather than as
 * nothing to say.
 */

const DAY = 86_400_000

/**
 * A control the registry would count as an accepted gap.
 *
 * Typed rather than `Record<string, unknown>`: the probe's JSDoc signature takes a control
 * shape, and a loosely-typed fixture makes every assertion about `.id` a cast. A fixture
 * that has to be cast to be read is a fixture that can drift from the thing it stands for
 * (ADR 028).
 */
type AcceptedFixture = {
  id: string
  status: string
  acceptedSince?: string
  acceptedWhy: string
  humanAction: string | null
}

function accepted(overrides: Partial<AcceptedFixture> = {}): AcceptedFixture {
  return {
    id: 'a-gap',
    status: 'not-configured',
    acceptedSince: '2026-09-01',
    acceptedWhy: 'A reason long enough that the registry test would accept it as one.',
    humanAction: 'GitHub → Settings → Branches.',
    ...overrides,
  }
}

/** `acceptedSince` as an ISO date `days` before `now`. */
function daysAgo(days: number, now = Date.UTC(2026, 8, 15)): string {
  return new Date(now - days * DAY).toISOString().slice(0, 10)
}

const NOW = new Date(Date.UTC(2026, 8, 15))

describe('acceptedControls selects exactly what the registry test calls accepted', () => {
  it('takes not-configured controls', () => {
    const registry = { controls: [accepted({ id: 'x' })] }
    expect(acceptedControls(registry).map((c) => c.id)).toEqual(['x'])
  })

  it('ignores configured ones — a closed gap has nothing to restate', () => {
    const registry = { controls: [{ id: 'done', status: 'configured' }] }
    expect(acceptedControls(registry)).toEqual([])
  })

  it('survives a registry with no controls array rather than throwing', () => {
    // The probe is the thing that reports problems; it must not become one. A registry
    // this malformed is caught by control-registry.test.ts in the gate, and this probe's
    // job on a schedule is to say nothing rather than to crash the audit job it shares.
    expect(acceptedControls({})).toEqual([])
    expect(acceptedControls(null as never)).toEqual([])
  })
})

describe('ageAcceptances measures against an injected clock', () => {
  it('reports whole days since the acceptance', () => {
    const [entry] = ageAcceptances([accepted({ acceptedSince: daysAgo(7) })], NOW)
    expect(entry.days).toBe(7)
    expect(entry.stale).toBe(false)
  })

  it('sorts the stalest first, so the issue body leads with the worst', () => {
    const aged = ageAcceptances(
      [
        accepted({ id: 'young', acceptedSince: daysAgo(2) }),
        accepted({ id: 'old', acceptedSince: daysAgo(99) }),
        accepted({ id: 'middle', acceptedSince: daysAgo(40) }),
      ],
      NOW
    )
    expect(aged.map((e) => e.id)).toEqual(['old', 'middle', 'young'])
  })

  it('treats a missing acceptedSince as maximally stale, never as nothing to say', () => {
    // "Nobody wrote down when this was accepted" is a worse state than "this was accepted
    // a long time ago". Skipping it is how an unclassified entry becomes an unverified one
    // (ADR 019).
    const [entry] = ageAcceptances([accepted({ acceptedSince: undefined })], NOW)
    expect(entry.acceptedSince).toBeNull()
    expect(entry.stale).toBe(true)
    expect(entry.days).toBeGreaterThan(ACCEPTED_GAP_MAX_AGE_DAYS)
  })
})

describe('the boundary, from both sides', () => {
  it(`is fresh at exactly ${ACCEPTED_GAP_MAX_AGE_DAYS} days`, () => {
    const decision = escalationDecision({
      controls: [accepted({ acceptedSince: daysAgo(ACCEPTED_GAP_MAX_AGE_DAYS) })],
      now: NOW,
    })
    expect(decision.escalate).toBe(false)
    expect(decision.body).toBeNull()
  })

  it(`is stale at ${ACCEPTED_GAP_MAX_AGE_DAYS + 1} days — the day main actually went red`, () => {
    const decision = escalationDecision({
      controls: [accepted({ acceptedSince: daysAgo(ACCEPTED_GAP_MAX_AGE_DAYS + 1) })],
      now: NOW,
    })
    expect(decision.escalate).toBe(true)
    expect(decision.stale).toHaveLength(1)
    expect(decision.body).toContain('31')
  })
})

describe('what the decision says when it says nothing', () => {
  it('stays quiet while every gap is inside the window', () => {
    const decision = escalationDecision({
      controls: [accepted({ id: 'a', acceptedSince: daysAgo(1) }), accepted({ id: 'b', acceptedSince: daysAgo(29) })],
      now: NOW,
    })
    expect(decision.escalate).toBe(false)
    // Names the oldest anyway. A probe that reports "nothing to say" and nothing else
    // cannot be told apart from one that looked at an empty list.
    expect(decision.detail).toContain('b')
    expect(decision.detail).toContain('29')
  })

  it('distinguishes an empty registry from a healthy one', () => {
    const decision = escalationDecision({ controls: [], now: NOW })
    expect(decision.escalate).toBe(false)
    expect(decision.aged).toEqual([])
    // The close-on-recovery step keys on this: `escalate: false` with an empty `aged`
    // list must NOT close an open issue, because it is a registry problem rather than a
    // recovery. Reporting an all-clear the probe never gave is ADR 010's shape.
    expect(decision.detail).toContain('No control')
  })
})

describe('escalating on several gaps at once', () => {
  const decision = escalationDecision({
    controls: [
      accepted({ id: 'merge-gate', acceptedSince: daysAgo(45), humanAction: 'Settings → Branches.' }),
      accepted({ id: 'fresh-one', acceptedSince: daysAgo(3) }),
      accepted({ id: 'smoke-secret-isolation', acceptedSince: daysAgo(31), humanAction: 'Settings → Environments.' }),
    ],
    now: NOW,
  })

  it('escalates only the stale ones', () => {
    expect(decision.escalate).toBe(true)
    expect(decision.stale.map((e) => e.id)).toEqual([
      'merge-gate',
      'smoke-secret-isolation',
    ])
  })

  it('never names a fresh gap in the body — that is how an alarm gets muted', () => {
    expect(decision.body).not.toContain('fresh-one')
  })

  it('carries each stale gap’s own human action, because they are different consoles', () => {
    expect(decision.body).toContain('Settings → Branches.')
    expect(decision.body).toContain('Settings → Environments.')
  })
})

describe('composeBody is where the sentences live', () => {
  // The workflow step that posts this reads a file and calls the GitHub API. It contains
  // no sentence of its own, deliberately: a sentence inside a YAML string literal is a
  // sentence no test can read, and that is how production-smoke.yml shipped a comparison
  // that could not match for 124 consecutive runs. See ADR 030.
  const body = composeBody([
    { id: 'a-gap', days: 40, acceptedSince: '2026-08-06', humanAction: 'Do the console thing.' },
  ])

  it('says what is wrong, with the numbers in it', () => {
    expect(body).toContain('`a-gap`')
    expect(body).toContain('2026-08-06')
    expect(body).toContain('40')
    expect(body).toContain(String(ACCEPTED_GAP_MAX_AGE_DAYS))
  })

  it('says the threshold is a deadline for deciding, not for fixing', () => {
    // The single most important sentence in the whole mechanism: read the other way, this
    // becomes a countdown to an obligation nobody agreed to, and it gets ignored.
    expect(body).toContain('deadline for deciding again')
  })

  it('marks an unrecorded date as unrecorded rather than printing "null"', () => {
    const missing = composeBody([
      { id: 'b-gap', days: 20000, acceptedSince: null, humanAction: null },
    ])
    expect(missing).toContain('**never recorded**')
    expect(missing).not.toContain('null')
  })
})

describe('the label is one fact', () => {
  it('is not merge-gate-unenforced', () => {
    // Branch protection being absent and an acceptance being forgotten are different
    // facts. Both are true of `merge-gate` today; only the second can ever be true of
    // `smoke-secret-isolation`. Two facts down one channel is a channel people mute.
    expect(ISSUE_LABEL).toBe('control-acceptance-stale')
    expect(ISSUE_LABEL).not.toBe('merge-gate-unenforced')
  })
})
