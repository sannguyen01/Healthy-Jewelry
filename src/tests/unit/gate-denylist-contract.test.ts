import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * **The machine-readable safety policy and the prose one describe the same paths.**
 *
 * `gate.yaml` is what an unattended loop reads. `loop-constraints.md` is what a person
 * reads, and what the `loop-constraints` skill loads at the start of every run. Its own
 * header says it "Mirrors loop-constraints.md" — and a mirror nobody looks into drifts.
 *
 * It had. `vercel.json` was added to `gate.yaml`'s denylist by
 * [ADR 015](../../../docs/adr/015-a-gate-that-was-only-ever-documented.md), which found
 * it was "the one file in that neighbourhood an unattended loop could rewrite" while
 * `.vercel/**`, `.github/workflows/**` and `next.config.ts` were all covered. The prose
 * list was never updated, so the two documents disagreed about what a loop may touch,
 * and whichever a reader found first was the answer they got.
 *
 * Neither list is wrong in a way anything could detect, which is the whole problem: a
 * denylist that omits a path does not error, it simply permits. See
 * [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 *
 * The `denylist-paths` fence is the same convention
 * `required-checks-contract.test.ts` uses for check names — structural rather than
 * prose-parsed, because a guardrail that guesses at grammar has unknown coverage
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 */

const ROOT = resolve(__dirname, '../../..')

/** The denylist as `gate.yaml` declares it. */
function policyDenylist(): string[] {
  const source = readFileSync(join(ROOT, 'gate.yaml'), 'utf8')
  const block = source.split(/^denylist:\s*$/m)[1]
  if (block === undefined) return []
  const entries: string[] = []
  for (const line of block.split('\n')) {
    if (/^[A-Za-z_]/.test(line)) break // next top-level key ends the list
    const item = line.match(/^\s*-\s*"([^"]+)"\s*$/) ?? line.match(/^\s*-\s*'([^']+)'\s*$/)
    if (item) entries.push(item[1])
  }
  return entries
}

/** The denylist as `loop-constraints.md` states it to a human. */
function proseDenylist(): string[] {
  const source = readFileSync(join(ROOT, 'loop-constraints.md'), 'utf8')
  const match = source.match(/^([ \t]*)```denylist-paths\n([\s\S]*?)^\1```$/m)
  if (!match) return []
  return match[2]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const policy = policyDenylist()
const prose = proseDenylist()

describe('both lists were found', () => {
  it('gate.yaml declares a denylist', () => {
    // An empty parse makes the comparison below vacuously true — and a vacuous safety
    // policy is the one kind this repository has already shipped twice.
    expect(policy.length).toBeGreaterThan(0)
  })

  it('loop-constraints.md declares one too', () => {
    expect(
      prose.length,
      'loop-constraints.md has no ```denylist-paths block. If the constraint moved, ' +
        'update this test to follow it — do not delete the check because the block went ' +
        'missing.'
    ).toBeGreaterThan(0)
  })
})

describe('the two lists agree', () => {
  it('every path the policy denies is one the prose names', () => {
    for (const path of policy) {
      expect(
        prose,
        `gate.yaml denies ${path}, and loop-constraints.md does not mention it. A loop ` +
          `reads the policy; a person reads the prose. They must not disagree about what ` +
          `is off limits.`
      ).toContain(path)
    }
  })

  it('every path the prose names is one the policy denies', () => {
    // The dangerous direction. A path a human believes is protected, that the machine
    // policy does not cover, is protected by nothing at all.
    for (const path of prose) {
      expect(
        policy,
        `loop-constraints.md tells a reader ${path} is escalate-not-edit, but gate.yaml ` +
          `does not deny it. An unattended run would rewrite it and violate no policy.`
      ).toContain(path)
    }
  })

  it('the paths ADR 015 named are all covered', () => {
    // Pinned explicitly, not left to the comparison above: these four are the ones the
    // record says were reasoned about, and a future edit that drops one from *both*
    // lists would satisfy the agreement checks while quietly removing the protection.
    for (const path of ['.vercel/**', '.github/workflows/**', 'next.config.ts', 'vercel.json']) {
      expect(policy, `gate.yaml no longer denies ${path} — see ADR 015`).toContain(path)
    }
  })
})
