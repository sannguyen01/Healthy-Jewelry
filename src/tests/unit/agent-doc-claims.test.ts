import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * **Instructions to the agent are claims like any other.**
 *
 * ## The defect this exists because of
 *
 * `.claude/skills/project-conventions/SKILL.md` told every reader:
 *
 * > CI is two jobs … **Both are required checks on `main`.**
 *
 * They were not. `docs/controls.json` has recorded `merge-gate` as `not-configured` since
 * the registry existed, and the 2026-08-29 blackout — eleven commits merged by hand against
 * a gate that never ran — happened *because* nothing required them. The file also carried
 * "443 unit tests and 11 E2E spec files" from 2026-08-01, by which point the real numbers
 * were 1913 and 17.
 *
 * That is [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md) and
 * [ADR 025](../../../docs/adr/025-a-number-in-prose-is-a-claim.md) exactly, in the one place
 * neither rule reached:
 *
 * - `required-checks-contract.test.ts` walked every markdown file in the repository and
 *   **excluded `.claude` by name**, alongside `node_modules` and `.next` — vendored and
 *   generated trees, which `.claude/skills` is not.
 * - `doc-numeric-claims.test.ts` scans a two-item allowlist: `CLAUDE.md` and
 *   `docs/testing-strategy.md`.
 *
 * So the document an agent reads *before* judging this repository was the only one nothing
 * checked, and it asserted a control that does not exist. An agent acting on it would have
 * concluded the merge gate was protecting `main` throughout the day it was dark.
 *
 * ## What this file adds that the others do not
 *
 * The `.claude` exclusion is now gone, so a ` ```required-checks ` fence in a skill file is
 * held against the names `ci.yml` publishes like any other document. That covers the context
 * *names*. It does not cover the *status* claim — "these are required" is a statement about
 * GitHub's branch-protection settings, which only `docs/controls.json` and
 * `probe-branch-protection.mjs` are authorised to make.
 *
 * This test closes that half, driven by the registry rather than by a hardcoded expectation,
 * so it inverts itself the moment protection is actually enabled: flip `merge-gate` to
 * `configured` and these documents become free to say so.
 *
 * ## Known limit, stated rather than papered over
 *
 * The assertive phrasings below are a **written list, not a parse**, so per
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) this has
 * unknown coverage: a sentence claiming protection in wording nobody anticipated passes.
 * That is why it is the second half of the fix and not the whole of it — the structural half
 * is the fence, which cannot be worded around because the contract reads it as data.
 *
 * A test with acknowledged partial coverage is worth more than no test, and much more than
 * one that claims to be exhaustive. The rule this repository keeps rediscovering is that the
 * unwritten case is the one the system is in; saying so here is cheaper than learning it
 * again.
 */

const ROOT = resolve(__dirname, '../../..')

type Registry = { controls: Array<{ id: string; status: string }> }

const registry: Registry = JSON.parse(readFileSync(join(ROOT, 'docs/controls.json'), 'utf8'))
const mergeGate = registry.controls.find((c) => c.id === 'merge-gate')

/**
 * Documents written to steer an agent or a contributor's judgement, as opposed to the
 * product itself. These are the ones whose errors propagate into decisions.
 */
function agentFacingDocuments(): string[] {
  const explicit = ['CLAUDE.md', 'AGENTS.md', 'LOOP.md', 'loop-constraints.md', 'CONTRIBUTING.md']
  const found = explicit.filter((f) => existsSync(join(ROOT, f)))

  const skills = join(ROOT, '.claude/skills')
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills)) {
      const skillFile = join(skills, entry, 'SKILL.md')
      if (statSync(join(skills, entry)).isDirectory() && existsSync(skillFile)) {
        found.push(relative(ROOT, skillFile))
      }
    }
  }
  return found
}

/**
 * Phrasings that assert branch protection is in force.
 *
 * Deliberately narrow. Each one states the control as fact; none of them matches a sentence
 * that describes what protection *would* require, or that names the registry as the
 * authority — because those are the correct way to write about a control that is off, and a
 * check that punished them would push authors toward saying nothing at all.
 */
const ASSERTS_PROTECTION_IS_ON: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /both\s+are\s+required\s+checks/i,
    why: 'the exact sentence that sat in project-conventions while main was unprotected',
  },
  { pattern: /are\s+required\s+checks\s+on\s+`?main`?/i, why: 'states the gate as configured' },
  {
    pattern: /branch\s+protection\s+is\s+(?:enabled|on|configured|active)/i,
    why: 'states the setting as enabled',
  },
  {
    pattern: /`?main`?\s+is\s+protected\b/i,
    why: 'states the branch as protected',
  },
  {
    pattern: /required\s+status\s+checks\s+are\s+(?:enabled|configured|in\s+place)/i,
    why: 'states the setting as enabled',
  },
]

describe('the registry is readable', () => {
  it('docs/controls.json declares a merge-gate control', () => {
    // Without this the sweep below passes vacuously on a renamed control — ADR 020.
    expect(mergeGate, 'no control with id "merge-gate" in docs/controls.json').toBeTruthy()
  })

  it('finds agent-facing documents to check', () => {
    expect(agentFacingDocuments().length).toBeGreaterThan(0)
  })

  it('reaches into .claude/skills, which is where the defect was', () => {
    expect(agentFacingDocuments().some((f) => f.startsWith('.claude/skills/'))).toBe(true)
  })
})

describe('no document asserts a merge gate the registry does not have', () => {
  it.each(agentFacingDocuments())('%s', (file) => {
    if (mergeGate?.status === 'configured') return // protection is on; saying so is now true

    const source = readFileSync(join(ROOT, file), 'utf8')
    const offenders = ASSERTS_PROTECTION_IS_ON.filter(({ pattern }) => pattern.test(source)).map(
      ({ pattern, why }) => `${pattern} — ${why}`
    )

    expect(
      offenders,
      `${file} states that branch protection is in force, but docs/controls.json records ` +
        `merge-gate as "${mergeGate?.status}".\n\n  ` +
        offenders.join('\n  ') +
        '\n\nA document may not assert a control that no probe reads (ADR 018). This is not ' +
        'pedantry: eleven commits reached main unverified on 2026-08-29 while this exact ' +
        'claim sat in the file an agent reads before judging the repository.\n\n' +
        'Either describe what protection *would* require and name docs/controls.json as the ' +
        'authority, or — if protection has actually been enabled — flip the registry entry ' +
        'to "configured" and let probe-branch-protection.mjs reconcile the claim against ' +
        'GitHub. This assertion disappears on its own once that is true.'
    ).toEqual([])
  })
})
