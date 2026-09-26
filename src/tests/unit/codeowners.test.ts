import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * **Every CODEOWNERS rule has a subject.**
 *
 * GitHub does not warn about a CODEOWNERS pattern that matches nothing. A typo'd path simply
 * owns nothing, and the file keeps reading as though the boundary it names were covered —
 * [ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)'s rule that outlived its
 * subject, arriving through a file nothing parses. So this parses it: every rule is
 * root-anchored, owned by the maintainer, and matches at least one tracked file.
 *
 * One exception, by name and with a reason: a directory a sibling branch creates. It may be
 * listed before it exists, and the moment it does exist its pending entry must be removed —
 * a pending list that only grows is an exemption list.
 */

const ROOT = resolve(__dirname, '../../..')

/**
 * Patterns allowed to match nothing yet, each with the reason it is allowed to.
 *
 * **This list may only shrink.** When the path exists, the assertion below fails and says to
 * delete the entry here — the rule in CODEOWNERS stays.
 */
const PENDING: Record<string, string> = {
  // The claims registry (S11) is created by the content workstream's branch (WS-B). CODEOWNERS
  // names it so the boundary is owned from the first commit that adds a claim.
  '/src/content/claims/': 'created by WS-B (claims registry) on a sibling branch',
}

/** The boundary-defining paths the decommission plan names. Pinned, so none can drop out. */
const REQUIRED = [
  '/COMMERCE-ELIMINATION-CONTRACT.md',
  '/docs/commerce-dependency-register.md',
  '/docs/controls.json',
  '/.github/',
  '/scripts/lib/commerce-contract.mjs',
  '/scripts/verify-commerce-contract.mjs',
  '/src/tests/unit/commerce-contract.test.ts',
  '/gate.yaml',
  '/vercel.json',
  '/next.config.ts',
  '/src/content/claims/',
  '/.github/CODEOWNERS',
]

interface Rule {
  line: number
  pattern: string
  owners: string[]
}

function parseCodeowners(source: string): Rule[] {
  return source
    .split('\n')
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter(({ text }) => text !== '' && !text.startsWith('#'))
    .map(({ text, line }) => {
      const [pattern, ...owners] = text.split(/\s+/)
      return { line, pattern, owners }
    })
}

/** Root-anchored, glob-free matching: an exact file, or everything under a `dir/`. */
function matches(pattern: string, path: string): boolean {
  const target = pattern.slice(1)
  return target.endsWith('/') ? path.startsWith(target) : path === target
}

const rules = parseCodeowners(readFileSync(join(ROOT, '.github/CODEOWNERS'), 'utf8'))
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

describe('CODEOWNERS parses to rules', () => {
  it('has rules to check', () => {
    // An empty parse makes every per-rule assertion below vacuously true.
    expect(rules.length).toBeGreaterThanOrEqual(REQUIRED.length)
  })

  it('found tracked files to match against', () => {
    expect(tracked.length).toBeGreaterThan(100)
  })
})

describe('every rule is well-formed', () => {
  it.each(rules.map((r) => [r.pattern, r] as const))('%s', (_p, rule) => {
    // Root-anchored and glob-free, so "what does this match" has one answer. An unanchored
    // pattern matches at any depth, which is how a rule meant for one file owns ten.
    expect(rule.pattern, `line ${rule.line} is not root-anchored`).toMatch(/^\//)
    expect(rule.pattern, `line ${rule.line} uses a glob; name the path`).not.toMatch(/[*?[\]!]/)
    expect(rule.owners, `line ${rule.line} names no owner — GitHub reads that as "unowned"`).toEqual([
      '@sannguyen01',
    ])
  })

  it('names each pattern once', () => {
    const patterns = rules.map((r) => r.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
  })
})

describe('every rule has a subject', () => {
  it.each(rules.filter((r) => !(r.pattern in PENDING)).map((r) => [r.pattern, r] as const))(
    '%s matches at least one tracked file',
    (_p, rule) => {
      expect(
        tracked.some((path) => matches(rule.pattern, path)),
        `${rule.pattern} (CODEOWNERS line ${rule.line}) matches no tracked file. A typo owns ` +
          `nothing and GitHub says nothing about it; a path that was deleted leaves a rule ` +
          `that outlived its subject (ADR 035).`
      ).toBe(true)
    }
  )

  it.each(Object.entries(PENDING))('pending %s still matches nothing', (pattern) => {
    expect(
      tracked.some((path) => matches(pattern, path)),
      `${pattern} now exists. Delete its entry from PENDING in this file — the CODEOWNERS rule ` +
        `stays. A pending list that only grows is an exemption list.`
    ).toBe(false)
  })

  it('every pending entry is a real CODEOWNERS rule', () => {
    for (const pattern of Object.keys(PENDING)) {
      expect(rules.map((r) => r.pattern)).toContain(pattern)
    }
  })
})

describe('the boundary-defining paths are all owned', () => {
  it.each(REQUIRED)('%s', (pattern) => {
    expect(rules.map((r) => r.pattern)).toContain(pattern)
  })

  it('CODEOWNERS owns itself, last, so nothing can shadow it', () => {
    // GitHub applies the last matching rule. Ownership of the ownership file is the one rule
    // that must never be overridden by a broader pattern below it.
    expect(rules[rules.length - 1].pattern).toBe('/.github/CODEOWNERS')
  })
})

describe('the matcher', () => {
  it('matches an exact file and a directory prefix, and nothing looser', () => {
    expect(matches('/gate.yaml', 'gate.yaml')).toBe(true)
    expect(matches('/gate.yaml', 'docs/gate.yaml')).toBe(false)
    expect(matches('/.github/', '.github/workflows/ci.yml')).toBe(true)
    expect(matches('/.github/', '.githubx/file')).toBe(false)
  })
})
