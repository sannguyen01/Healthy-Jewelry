import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { SMOKE_CRON_INTERVAL_HOURS, ABSOLUTE_MAX_WINDOW_HOURS, MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS } =
  await import('../../../scripts/lib/smoke-schedule.mjs')
const { DEFAULT_WINDOW_HOURS } = await import('../../../scripts/probe-smoke-liveness.mjs')

/**
 * **A monitor's window must fit the schedule it monitors.**
 *
 * Too short and it alarms on every ordinary gap, which trains people to mute the one
 * channel that will later carry a real outage — [ADR 011](../../../docs/adr/011-repeated-identical-failures-must-escalate.md)
 * exactly. Too long and it sleeps through a stopped tier, which is the failure it exists
 * to prevent.
 *
 * Neither is visible from the monitor's own output: a heartbeat with a window ten times
 * its interval reports "lit" forever and looks identical to a healthy one. That is this
 * repository's signature bug, and it must not be reintroduced by the fix for it — so the
 * cron is parsed out of the workflow rather than restated, and held against the constant
 * the probe actually uses.
 */

const ROOT = resolve(__dirname, '../../..')

/** The `schedule.cron` of production-smoke.yml, read from the workflow. */
function smokeCron(): string | null {
  const source = readFileSync(join(ROOT, '.github/workflows/production-smoke.yml'), 'utf8')
  const match = source.match(/^\s*-\s*cron:\s*'([^']+)'/m)
  return match ? match[1] : null
}

/** Hours between fires for an `every N hours` cron. */
function intervalHours(cron: string): number | null {
  const [, hour] = cron.split(/\s+/)
  if (hour === '*') return 1
  const every = hour.match(/^\*\/(\d+)$/)
  return every ? Number.parseInt(every[1], 10) : null
}

describe('the smoke schedule is readable', () => {
  it('production-smoke.yml declares a cron', () => {
    expect(smokeCron()).toBeTruthy()
  })

  it('it is an every-N-hours schedule this test can reason about', () => {
    const interval = intervalHours(smokeCron()!)
    expect(
      interval,
      `The cron "${smokeCron()}" is not an every-N-hours schedule. The heartbeat window ` +
        `below is derived from that assumption — update this test rather than deleting it.`
    ).not.toBeNull()
  })
})

describe('the constant matches the workflow', () => {
  it('SMOKE_CRON_INTERVAL_HOURS is what the cron actually says', () => {
    // The constant exists so the probe's prose and the schedule cannot disagree. If the
    // cron changes and this does not, the summary a human reads names the wrong cadence.
    expect(SMOKE_CRON_INTERVAL_HOURS).toBe(intervalHours(smokeCron()!))
  })
})

describe('the window fits the interval', () => {
  const interval = SMOKE_CRON_INTERVAL_HOURS

  it('spans at least two scheduled fires', () => {
    // One missed or delayed run must not raise an alarm. A window narrower than two
    // intervals guarantees false positives, and a channel that cries wolf is one people
    // stop reading — the exact dynamic that produced 24 identical comments on issue #24.
    expect(
      DEFAULT_WINDOW_HOURS,
      `A ${DEFAULT_WINDOW_HOURS}h window over a ${interval}h schedule leaves no margin.`
    ).toBeGreaterThanOrEqual(interval * 2)
  })

  it('spans at most six, so a stopped tier is noticed the same day', () => {
    expect(
      DEFAULT_WINDOW_HOURS,
      `A ${DEFAULT_WINDOW_HOURS}h window over a ${interval}h schedule would let the ` +
        `verification tier stop for most of a day before anything said so. The point of ` +
        `this probe is that silence gets loud quickly.`
    ).toBeLessThanOrEqual(interval * 6)
  })

  it('is not an exact multiple of the interval', () => {
    // A window of exactly 4 fires races the scheduler: a run that lands a minute late
    // falls outside a window measured from the previous one, and the alarm fires on
    // punctuality rather than on absence.
    expect(DEFAULT_WINDOW_HOURS % interval).not.toBe(0)
  })
})

describe('the window has an anchor the workflow cannot move', () => {
  /**
   * Every assertion in the block above is a multiple of `interval`, which is asserted
   * equal to the cron in the very file being watched. That made the whole heartbeat
   * self-referential: widen the cron, widen the window to match, and every check still
   * passes while production goes unverified for days.
   *
   * A monitor calibrated entirely against its subject cannot distinguish "the patient is
   * fine" from "the patient's own pulse-reader broke", because the subject is what moved.
   * These two assertions are the fixed reference that restores the difference.
   */
  it('never allows silence beyond the absolute maximum', () => {
    expect(
      DEFAULT_WINDOW_HOURS,
      `A ${DEFAULT_WINDOW_HOURS}h window exceeds the ${ABSOLUTE_MAX_WINDOW_HOURS}h policy ` +
        `maximum. That limit does not derive from the schedule: production may not go ` +
        `unverified for longer than this no matter what the cron says.`
    ).toBeLessThanOrEqual(ABSOLUTE_MAX_WINDOW_HOURS)
  })

  it('never allows the schedule itself to slow past policy', () => {
    // The assertion that closes the loop. Without it, a one-character cron edit widens
    // the definition of healthy along with the schedule and nothing objects.
    expect(
      SMOKE_CRON_INTERVAL_HOURS,
      `production-smoke runs every ${SMOKE_CRON_INTERVAL_HOURS}h, slower than the ` +
        `${MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS}h policy. That is not a slower heartbeat, ` +
        `it is a different decision about how often production must be verified — argue ` +
        `for it by changing MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS, where a reviewer sees it.`
    ).toBeLessThanOrEqual(MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS)
  })

  it('the policy bounds are mutually satisfiable', () => {
    // A floor of two intervals and a ceiling of 48h must leave room for a real value, or
    // the pair is unsatisfiable and the next person to touch the cron is stuck.
    expect(MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS * 2).toBeLessThanOrEqual(ABSOLUTE_MAX_WINDOW_HOURS)
  })
})

describe('the audit runs often enough to be the monitor', () => {
  it('control-audit.yml is scheduled at least as often as the window', () => {
    // A monitor that checks a 26h window once a week reports a stopped tier up to six
    // days late. The window bounds how stale the answer may be; the schedule bounds how
    // stale the *question* is, and only both together make the alarm timely.
    const audit = readFileSync(join(ROOT, '.github/workflows/control-audit.yml'), 'utf8')
    const cron = audit.match(/^\s*-\s*cron:\s*'([^']+)'/m)?.[1]
    expect(cron, 'control-audit.yml has no schedule').toBeTruthy()
    const auditInterval = intervalHours(cron!)
    expect(auditInterval).not.toBeNull()
    expect(auditInterval!).toBeLessThanOrEqual(DEFAULT_WINDOW_HOURS)
  })
})
