import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **`docs/safety.md` says it is the prose mirror of `gate.yaml`. Now something checks.**
 *
 * `gate.yaml` is what an unattended loop reads; `docs/safety.md` is what a person reads when
 * deciding whether a loop may touch a path. Its first line calls it a mirror, and nothing had
 * ever looked into it: `vercel.json` was added to the machine policy by ADR 015 and never
 * reached this document, so for a month the two disagreed about what a loop may rewrite.
 * `gate-denylist-contract.test.ts` holds `loop-constraints.md` to the same list for the same
 * reason; this is the second mirror, held the same way.
 *
 * `gate.yaml` is read with a YAML parser, not a line regex, because a guardrail that guesses
 * at grammar has unknown coverage
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)). The prose side
 * is structural too: a `denylist-paths` fence, one path per line — the convention
 * `loop-constraints.md` already uses.
 */

const ROOT = resolve(__dirname, '../../..')

/** Every `denylist-paths` fence in a markdown document, flattened. */
function fencedPaths(markdown: string): string[] {
  const paths: string[] = []
  for (const match of markdown.matchAll(/^([ \t]*)```denylist-paths\n([\s\S]*?)^\1```$/gm)) {
    paths.push(
      ...match[2]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  }
  return paths
}

const policy: string[] = (parse(readFileSync(join(ROOT, 'gate.yaml'), 'utf8')) as { denylist?: string[] })
  .denylist ?? []
const safetySource = readFileSync(join(ROOT, 'docs/safety.md'), 'utf8')
const prose = fencedPaths(safetySource)

describe('both lists were found', () => {
  it('gate.yaml declares a denylist', () => {
    // An empty parse makes both comparisons below vacuously true.
    expect(policy.length).toBeGreaterThan(0)
  })

  it('docs/safety.md declares exactly one denylist-paths block, and it is not empty', () => {
    expect(
      [...safetySource.matchAll(/```denylist-paths/g)].length,
      'docs/safety.md must carry one ```denylist-paths fence. If the list moved, follow it here ' +
        'rather than deleting this check because the block went missing.'
    ).toBe(1)
    expect(prose.length).toBeGreaterThan(0)
  })
})

describe('docs/safety.md and gate.yaml agree, in both directions', () => {
  it('every path the policy denies is one the prose names', () => {
    for (const path of policy) {
      expect(
        prose,
        `gate.yaml denies ${path} and docs/safety.md does not list it. A person reading the ` +
          `prose would believe a loop may rewrite it.`
      ).toContain(path)
    }
  })

  it('every path the prose names is one the policy denies', () => {
    // The dangerous direction: a path a human believes is protected, that the machine policy
    // does not cover, is protected by nothing.
    for (const path of prose) {
      expect(
        policy,
        `docs/safety.md lists ${path}, and gate.yaml does not deny it. An unattended run would ` +
          `rewrite it and violate no policy.`
      ).toContain(path)
    }
  })

  it('names each path once', () => {
    expect(new Set(prose).size).toBe(prose.length)
  })

  it('includes vercel.json, the path this mirror had lost', () => {
    expect(prose).toContain('vercel.json')
  })
})

describe('the fence reader', () => {
  it('reads an indented fence and ignores other fences', () => {
    const md = 'x\n\n  ```denylist-paths\n  a\n  b/**\n  ```\n\n```\nnot-this\n```\n'
    expect(fencedPaths(md)).toEqual(['a', 'b/**'])
  })

  it('reads nothing from a document with no fence', () => {
    expect(fencedPaths('```\n.env\n```')).toEqual([])
  })
})
