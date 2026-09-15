import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **A decision may not live inside a YAML string.**
 *
 * ## The defect
 *
 * `.github/workflows/production-smoke.yml` carried ~110 lines of JavaScript in a
 * `github-script` `script:` block. Those lines decided whether a production failure
 * reached a person, and they were wrong for a month in three independent ways — a
 * comparison against a per-run wall-clock figure that could never match, a streak counter
 * that counted the comments it was suppressing, and an unpaginated `listComments` whose
 * "last comment" was the hundredth-oldest. Issue #24 took **100 comments across ~124
 * runs** and escalated zero times.
 *
 * None of that was a hard bug to see. It was a hard bug to *look at*: a function inside a
 * string literal cannot be imported, so no test could reach it, and the only way to
 * exercise it was to break production and wait six hours. The repository's own rule for
 * this already existed —
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): a verdict
 * that cannot be pointed at a known answer is a first draft. It simply had no way of
 * applying to code that was not in a file.
 *
 * So this is the ratchet. Extraction fixed one block; a budget is what stops the next one
 * from being written. See
 * [ADR 030](../../../docs/adr/030-an-equivalence-relation-is-the-control.md).
 *
 * ## Why 45, and why measured this way
 *
 * The extracted transport — read three logs, list the issue, page the comments, call the
 * decision, apply what it returns — is **32 lines**. That is what a real I/O shim for the
 * most involved reporting step in this repository costs. 45 leaves half again as much room
 * for a step that has to do more plumbing, and is still far below the ~60 that every block
 * holding a *decision* currently measures. A number chosen to fit today's worst case would
 * ratchet nothing; a number below today's shim would be a rule nobody could follow.
 *
 * Blank lines and `//` comments do not count. This repository asks for an exceptional
 * comment standard, and a budget that taxed explanation would be answered by deleting the
 * explanation — which is the opposite of the change being made here. Per
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) the
 * comment test is a prefix match with unknown coverage: a `//` inside a template literal
 * would be undercounted. It errs toward leniency in a case that has never occurred in
 * these files, and the `GRANDFATHERED` table below is asserted from both sides so drift in
 * the metric shows up as a failing expectation rather than as a silently looser budget.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

/** Lines of actual logic one `script:` block may hold before it needs a module. */
const BUDGET = 45

/**
 * **Blocks that exceed the budget today, frozen at their current size.**
 *
 * Every one of these still holds a decision in YAML, and every one is the same latent
 * defect as the smoke escalation: unimportable, untestable, exercised only in production.
 * They are listed rather than exempted by a looser number, because a list has to be read
 * by whoever shortens it and a number does not.
 *
 * **This table may shrink. It may never grow.** A new oversized block has nowhere to be
 * added except here, and adding it is a visible act. An entry whose block has dropped to
 * the budget fails below — delete the entry rather than leaving a stale licence behind,
 * which is the `--sage` third state
 * ([ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)) in
 * miniature.
 */
const GRANDFATHERED: Record<string, number> = {
  'control-audit.yml :: Report an unenforced merge gate': 78,
  'control-audit.yml :: Report a dark verification tier': 61,
  'control-audit.yml :: Report a dark merge gate': 60,
  'production-smoke.yml :: Report premise drift': 60,
}

interface Step {
  name?: string
  uses?: string
  with?: Record<string, unknown>
}
interface Workflow {
  jobs?: Record<string, { steps?: Step[] }>
}

/** Lines of logic: neither blank nor a `//` comment. */
function codeLines(script: string): number {
  return script.split('\n').filter((line) => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('//')
  }).length
}

const blocks = readdirSync(WORKFLOWS)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) => {
    const parsed = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
    return Object.values(parsed?.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses?.includes('github-script'))
      .map((step) => ({
        id: `${file} :: ${step.name ?? '(unnamed step)'}`,
        lines: codeLines(String(step.with?.script ?? '')),
      }))
      .filter((block) => block.lines > 0)
  })

describe('there are inline scripts to measure', () => {
  it('found github-script blocks', () => {
    // Without this every `it.each` below iterates an empty list and the file reports green
    // over nothing — the shape of pass this repository refuses on principle.
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('and the budget is below what a decision-bearing block costs', () => {
    // If the budget ever rose above the blocks it is meant to catch, it would pass
    // everything while looking like a control. Pinned against the grandfathered sizes,
    // which are exactly the blocks that still hold decisions.
    for (const size of Object.values(GRANDFATHERED)) expect(size).toBeGreaterThan(BUDGET)
  })
})

describe('every github-script block is within budget', () => {
  it.each(blocks.map((b) => [b.id, b] as const))('%s', (_id, block) => {
    const allowance = GRANDFATHERED[block.id]
    if (allowance !== undefined) {
      expect(
        block.lines,
        `${block.id} is grandfathered at ${allowance} lines and is now ${block.lines}. ` +
          `The list may shrink, never grow: extract the decision into scripts/lib and ` +
          `leave a transport behind, as "Report failure as an issue" now is.`
      ).toBeLessThanOrEqual(allowance)
      return
    }

    expect(
      block.lines,
      `${block.id} holds ${block.lines} lines of logic, over the ${BUDGET}-line budget.\n\n` +
        `A github-script block is a transport: read inputs, call a decision, apply the ` +
        `result. Past this size it is holding the decision itself — and a decision inside ` +
        `a YAML string cannot be imported, so no test can reach it. That is how the ` +
        `production-smoke escalation shipped three bugs and posted 100 comments without ` +
        `ever escalating.\n\n` +
        `Move it to scripts/lib/<name>.mjs as a pure exported function, point a test ` +
        `under src/tests/unit at it, and register the control in docs/controls.json.`
    ).toBeLessThanOrEqual(BUDGET)
  })
})

describe('the grandfathered list stays honest', () => {
  it('names only blocks that still exist', () => {
    const ids = new Set(blocks.map((b) => b.id))
    for (const id of Object.keys(GRANDFATHERED)) {
      expect(ids.has(id), `${id} is grandfathered but no longer exists — delete the entry`).toBe(
        true
      )
    }
  })

  it('and only blocks that still need it', () => {
    // A licence nobody needs is a licence nobody notices is spent. When a block comes
    // under budget its entry must go, or the next edit to it is silently unbounded again.
    for (const [id, allowance] of Object.entries(GRANDFATHERED)) {
      const block = blocks.find((b) => b.id === id)
      expect(
        block?.lines,
        `${id} is now ${block?.lines} lines, within the ${BUDGET}-line budget. ` +
          `Remove its grandfathered entry.`
      ).toBeGreaterThan(BUDGET)
      expect(allowance).toBeGreaterThan(BUDGET)
    }
  })

  it('does not cover the step this ratchet was built for', () => {
    // The extraction has to be real. If "Report failure as an issue" ever appears in the
    // table above, the decision has moved back into YAML and this whole file is decoration.
    expect(Object.keys(GRANDFATHERED)).not.toContain(
      'production-smoke.yml :: Report failure as an issue'
    )
    const shim = blocks.find((b) => b.id === 'production-smoke.yml :: Report failure as an issue')
    expect(shim, 'the failure-reporting step was renamed or removed').toBeTruthy()
    expect(shim!.lines).toBeLessThanOrEqual(BUDGET)
  })
})
