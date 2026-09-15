import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const {
  classifyManifestChange,
  escalationMajors,
  isEscalated,
  majorOf,
  hasWrittenRationale,
  requiresRationale,
  unusedDependencies,
  importedSpecifiersUnder,
  NOT_IMPORTED_BY_DESIGN,
} = await import('../../../scripts/audit-dependency-scope.mjs')

/**
 * **The judgement PR #61 made once, made repeatable.**
 *
 * PR #60 proposed `next` 15.5.24 → 16.3.3 to close two Critical RCEs. The advisory was
 * real; riding along with it was a framework major this repository had never compiled,
 * linted or tested against — the same class of change as the `eslint-config-next` 16.x and
 * `@vitejs/plugin-react` 6.x bumps that landed unverified on 2026-08-29 and left `main`
 * unbuildable for a day.
 *
 * PR #61 patched the CVE *inside* `next@15` and declined the major. That was right, and it
 * depended on a person reading a diff carefully while a Critical advisory was applying
 * pressure to merge fast. `loop-constraints.md` had required exactly this in prose for
 * weeks, addressed to a loop, read by nobody with the power to stop a merge.
 *
 * The two real pull requests are the fixtures, per
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): a tool that
 * has never been pointed at a known answer is a first draft. The version strings below are
 * verbatim from those manifests.
 */

const ROOT = resolve(__dirname, '../../..')
const constraints = readFileSync(join(ROOT, 'loop-constraints.md'), 'utf8')
const majors = escalationMajors(constraints)

/** The manifests either side of PR #61 — a patch bump inside the current major. */
const PR61_BASE = { dependencies: { next: '^15.5.23' } }
const PR61_HEAD = { dependencies: { next: '^15.5.24' } }

/** The manifests either side of PR #60 — the same advisory, with a major attached. */
const PR60_BASE = { dependencies: { next: '^15.5.24' } }
const PR60_HEAD = { dependencies: { next: '^16.3.3' } }

const RATIONALE = [
  '## Rationale',
  '',
  'Next 16 is required for the App Router change described in the linked issue, and the',
  'full E2E suite has been run against it on this branch.',
].join('\n')

describe('the escalation list was found', () => {
  it('reads the fence from loop-constraints.md', () => {
    // An empty list makes every assertion below vacuously true and, worse, makes the real
    // script pass everything while reporting green. The script exits 2 on this; here it is
    // the first thing asserted.
    expect(majors.length, 'no ```escalation-majors``` fence in loop-constraints.md').toBeGreaterThan(0)
  })

  it('carries the four names the rule has always named', () => {
    expect(majors).toEqual(['next', 'react', 'react-dom', '@shopify/*'])
  })

  it('the prose above the fence still describes what the fence does', () => {
    // The fence and the sentence introducing it are two statements of one rule, and the
    // `gate.yaml` mirror drifted from its prose for exactly as long as nothing compared
    // them. See ADR 019.
    expect(constraints).toMatch(/major-version bumps in the packages below/i)
    expect(constraints).toMatch(/written rationale/i)
  })
})

describe('a scope pattern matches what it says it matches', () => {
  it('matches an exact name', () => {
    expect(isEscalated('next', majors)).toBe(true)
    expect(isEscalated('nextjs-fake', majors)).toBe(false)
  })

  it('matches a whole scope through the trailing star', () => {
    expect(isEscalated('@shopify/hydrogen-react', majors)).toBe(true)
  })

  it('does not match an unlisted package', () => {
    // framer-motion 11 → 13 landed unverified during the blackout and was genuinely not on
    // this list. The rule names four packages; widening it silently would be a different
    // decision, taken by a test.
    //
    // It is no longer a dependency at all — `unusedDependencies` below is what removed it,
    // and the two facts are worth holding apart. The escalation list was never wrong about
    // framer-motion; it simply had nothing to say about a package that should not have been
    // installed. A second question, not a correction to this one.
    expect(isEscalated('framer-motion', majors)).toBe(false)
  })
})

/**
 * **A dependency's cost is not only what it ships.**
 *
 * `framer-motion` sat in `dependencies` with zero import sites under `src/`, in either of
 * its package names. It contributed **0 bytes** to the client bundle — Next tree-shakes an
 * unimported package entirely, and the build's 103 kB shared chunk was identical before and
 * after removal. Every cost it had was somewhere the bundle does not measure:
 *
 * | Cost | Measured |
 * |---|---|
 * | node_modules | 5.9 MB, 3 transitive packages |
 * | dependabot pull requests | 2 (#53, #67) |
 * | major-version decisions | 1 — a **two-major** jump merged unverified during the 2026-08-29 blackout |
 * | CVE surface | permanent, for code that never executes |
 *
 * That is why the check is here rather than in a bundle analyser: the bundle was the one
 * place this was invisible.
 */
describe('unusedDependencies finds what the bundle cannot', () => {
  it('flags a production dependency nothing imports', () => {
    const result = unusedDependencies({ 'ghost-lib': '^1.0.0' }, ['react', 'next'], {})
    expect(result.ok).toBe(false)
    expect(result.unused).toEqual(['ghost-lib'])
    expect(result.summary).toContain('ghost-lib')
  })

  it('passes a dependency that is imported', () => {
    const result = unusedDependencies({ zustand: '^5.0.0' }, ['zustand'], {})
    expect(result.ok).toBe(true)
    expect(result.unused).toEqual([])
  })

  it('counts a subpath import as a use of the package', () => {
    // `next/font/google` is how this repository imports `next` most often. Matching the
    // full specifier would flag `next` itself as unused, which is the false positive that
    // kills a checker on its first run.
    const result = unusedDependencies({ next: '^15.5.24' }, ['next/font/google'], {})
    expect(result.ok).toBe(true)
  })

  it('keeps both segments of a scoped package', () => {
    const result = unusedDependencies(
      { '@upstash/redis': '^1.38.3' },
      ['@upstash/redis/cloudflare'],
      {}
    )
    expect(result.ok).toBe(true)
  })

  it('does not let one scoped package vouch for another in the same scope', () => {
    // `@upstash/ratelimit` being imported says nothing about `@upstash/redis`. Truncating
    // to the scope would have made every package under a scope mutually exempt.
    const result = unusedDependencies(
      { '@upstash/redis': '^1.38.3' },
      ['@upstash/ratelimit'],
      {}
    )
    expect(result.ok).toBe(false)
    expect(result.unused).toEqual(['@upstash/redis'])
  })

  it('exempts an allowlisted package, and the allowlist carries reasons', () => {
    const result = unusedDependencies({ 'react-dom': '^19.2.8' }, [], NOT_IMPORTED_BY_DESIGN)
    expect(result.ok).toBe(true)

    // A bare list would be a list nobody could audit. Every exemption states why, or it is
    // indistinguishable from an oversight (ADR 019).
    for (const [name, reason] of Object.entries(NOT_IMPORTED_BY_DESIGN)) {
      expect((reason as string).length, `${name} is exempt with no stated reason`).toBeGreaterThan(30)
    }
  })

  it('reports cleanly when there is nothing to report', () => {
    const result = unusedDependencies({}, [], {})
    expect(result.ok).toBe(true)
    expect(result.summary).toContain('0 production dependencies')
  })
})

describe('the real manifest has no unused production dependency', () => {
  it('every dependency in package.json is imported or exempt', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const result = unusedDependencies(
      pkg.dependencies ?? {},
      importedSpecifiersUnder(join(ROOT, 'src'))
    )
    expect(result.ok, result.summary).toBe(true)
  })
})

describe('majorOf reads a range, or admits it cannot', () => {
  it.each([
    ['^15.5.24', 15],
    ['~16.0.0', 16],
    ['16.3.3', 16],
    ['>=22.0.0', 22],
    ['v4.7.0', 4],
  ])('%s → %i', (range, expected) => {
    expect(majorOf(range as string)).toBe(expected)
  })

  it.each(['workspace:*', 'latest', 'github:org/repo', '*'])('%s is unreadable, not zero', (range) => {
    // Returning 0 would make every subsequent change to such a range look like a major
    // bump, and a check that cries wolf on `workspace:*` is a check people turn off.
    expect(majorOf(range)).toBe(null)
  })
})

describe('PR #61 — the CVE patched inside the current major', () => {
  const changes = classifyManifestChange(PR61_BASE, PR61_HEAD)

  it('classifies the bump as within-major', () => {
    expect(changes).toEqual([
      { name: 'next', field: 'dependencies', from: '^15.5.23', to: '^15.5.24', bump: 'within-major' },
    ])
  })

  it('passes with no rationale at all', () => {
    // The whole point. A security patch inside the current major must not need a ceremony
    // to land — making it harder is how the bundled major starts looking attractive.
    const result = requiresRationale({ changes, majors, prBody: '' })
    expect(result.ok).toBe(true)
    expect(result.flagged).toEqual([])
  })
})

describe('PR #60 — the same advisory with a framework major attached', () => {
  const changes = classifyManifestChange(PR60_BASE, PR60_HEAD)

  it('classifies the bump as major', () => {
    expect(changes[0]).toMatchObject({ name: 'next', from: '^15.5.24', to: '^16.3.3', bump: 'major' })
  })

  it('is blocked when the description says nothing', () => {
    const result = requiresRationale({ changes, majors, prBody: '' })
    expect(result.ok).toBe(false)
    expect(result.flagged).toHaveLength(1)
    expect(result.summary).toContain('next ^15.5.24 → ^16.3.3')
  })

  it('is blocked by a dependabot changelog, which is not a rationale', () => {
    // Dependabot writes a long, entirely accurate body. Length is not the signal — a
    // deliberate statement under a heading is, because that is the thing that did not
    // happen on the eleven bumps merged during the blackout.
    const result = requiresRationale({
      changes,
      majors,
      prBody: 'Bumps [next](https://github.com/vercel/next.js) from 15.5.24 to 16.3.3.\n\n<details>\n<summary>Release notes</summary>\n\nLots of accurate detail about what changed upstream, none of it about this repository.\n</details>',
    })
    expect(result.ok).toBe(false)
  })

  it('passes when somebody writes the rationale down', () => {
    const result = requiresRationale({ changes, majors, prBody: RATIONALE })
    expect(result.ok).toBe(true)
    expect(result.justified).toBe(true)
  })

  it('is not satisfied by an empty heading', () => {
    // A box to tick is worse than no box: it launders the absence of a decision into the
    // appearance of one.
    expect(hasWrittenRationale('## Rationale\n\n')).toBe(false)
    expect(hasWrittenRationale('## Rationale\n\nyes\n')).toBe(false)
  })
})

describe('changes this check deliberately lets through', () => {
  it('a major bump on an unlisted package', () => {
    const changes = classifyManifestChange(
      { devDependencies: { jsdom: '^25.0.1' } },
      { devDependencies: { jsdom: '^30.0.1' } }
    )
    expect(changes[0].bump).toBe('major')
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('a patch bump across every field', () => {
    const changes = classifyManifestChange(
      { dependencies: { next: '^15.5.23' }, devDependencies: { typescript: '^5.9.3' } },
      { dependencies: { next: '^15.5.24' }, devDependencies: { typescript: '^5.9.4' } }
    )
    expect(changes.every((c) => c.bump === 'within-major')).toBe(true)
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('an identical manifest produces no changes at all', () => {
    expect(classifyManifestChange(PR60_HEAD, PR60_HEAD)).toEqual([])
  })
})

describe('additions and removals are named, not classified as bumps', () => {
  it('a newly added escalation-listed package is reported as added', () => {
    // Adding `react` at 19 is not a major *bump*, and calling it one would be a claim the
    // manifest does not support. It is still reported, because a reviewer should see it.
    const changes = classifyManifestChange({}, { dependencies: { react: '^19.2.8' } })
    expect(changes[0]).toMatchObject({ name: 'react', bump: 'added' })
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('a removal is reported as removed', () => {
    const changes = classifyManifestChange({ dependencies: { react: '^19.2.8' } }, {})
    expect(changes[0]).toMatchObject({ name: 'react', bump: 'removed' })
  })
})
