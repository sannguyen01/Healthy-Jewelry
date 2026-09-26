import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { ENFORCEABLE_SET, evaluateProtection, verdict } = await import(
  '../../../scripts/probe-branch-protection.mjs'
)

/**
 * **The ruleset a human will paste is the ruleset the probe will accept.**
 *
 * `docs/runbooks/main-ruleset.md` carries the exact JSON for `POST /repos/…/rulesets`. If it
 * drifted from `docs/controls.json` or from the probe's enforceable set, the owner would
 * create a ruleset the scheduled audit then reports as `mismatched` — or worse, one missing a
 * context, which the probe catches only after it has let a pull request through. So the JSON
 * is parsed here and fed to the probe's own decision as a known answer (ADR 024): the rules
 * GitHub would derive from it must read back as `enforced`.
 */

const ROOT = resolve(__dirname, '../../..')
const RUNBOOK = readFileSync(join(ROOT, 'docs/runbooks/main-ruleset.md'), 'utf8')
const registry = JSON.parse(readFileSync(join(ROOT, 'docs/controls.json'), 'utf8'))
const claimed: string[] = registry.controls.find((c: { id: string }) => c.id === 'merge-gate').requiredContexts

const block = RUNBOOK.match(/^```json ruleset\n([\s\S]*?)^```$/m)
const ruleset = JSON.parse(block?.[1] ?? 'null')

interface Rule {
  type: string
  parameters?: Record<string, unknown> & {
    required_status_checks?: Array<{ context: string; integration_id?: number }>
  }
}
const rule = (type: string): Rule | undefined => ruleset?.rules?.find((r: Rule) => r.type === type)

describe('the runbook carries one parseable ruleset', () => {
  it('has a ```json ruleset block that parses', () => {
    expect(block, 'docs/runbooks/main-ruleset.md has no ```json ruleset block').not.toBeNull()
    expect(ruleset).toBeTypeOf('object')
  })

  it('targets main, active', () => {
    expect(ruleset.target).toBe('branch')
    expect(ruleset.enforcement).toBe('active')
    expect(ruleset.conditions.ref_name.include).toEqual(['refs/heads/main'])
  })
})

describe('the ruleset is the enforceable set', () => {
  it('requires exactly the registry contexts', () => {
    const contexts = (rule('required_status_checks')?.parameters?.required_status_checks ?? []).map((c) => c.context)
    expect([...contexts].sort()).toEqual([...claimed].sort())
  })

  it('pins every context to one integration, so a posted status cannot satisfy it', () => {
    const ids = new Set(
      (rule('required_status_checks')?.parameters?.required_status_checks ?? []).map((c) => c.integration_id)
    )
    expect([...ids]).toEqual([15368])
  })

  it('is strict, requires a pull request, and has no bypass actors', () => {
    expect(rule('required_status_checks')?.parameters?.strict_required_status_checks_policy).toBe(
      ENFORCEABLE_SET.strict
    )
    expect(Boolean(rule('pull_request'))).toBe(ENFORCEABLE_SET.pullRequest)
    expect(ruleset.bypass_actors).toHaveLength(ENFORCEABLE_SET.bypassActors)
  })

  it('blocks force pushes and deletion', () => {
    expect(rule('non_fast_forward')).toBeDefined()
    expect(rule('deletion')).toBeDefined()
  })

  it('leaves code-owner review off, and approvals at zero, while one human maintains this', () => {
    // On, with one maintainer, it deadlocks every merge: GitHub blocks self-approval.
    expect(rule('pull_request')?.parameters?.require_code_owner_review).toBe(false)
    expect(rule('pull_request')?.parameters?.required_approving_review_count).toBe(0)
  })

  it('reads back as `enforced` through the probe that will audit it', () => {
    // The rules GitHub's effective-rules endpoint would list for this ruleset, id 1.
    const rules = ruleset.rules.map((r: Rule) => ({ ...r, ruleset_id: 1, ruleset_source_type: 'Repository' }))
    const observed = evaluateProtection(
      {
        classic: { status: 404, body: { message: 'Branch not protected' } },
        rules: { status: 200, body: rules },
        rulesets: { '1': { status: 200, body: { bypass_actors: ruleset.bypass_actors } } },
      },
      { requiredContexts: claimed }
    )
    const judged = verdict({ requiredContexts: claimed, status: 'configured' }, observed)
    expect(judged.verdict).toBe('enforced')
  })
})

describe('the canary procedure never presses merge', () => {
  it('uses the read-only denial probe', () => {
    expect(RUNBOOK).toContain('node scripts/probe-merge-denial.mjs --pr')
  })

  it('says so, in the words a hurried reader will see', () => {
    expect(RUNBOOK).toContain('Never press merge on the canary')
    expect(RUNBOOK).toContain('Close the pull request **without merging**')
  })
})
