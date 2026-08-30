import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const { parseWorkflowJobs, countJobKeys } = await import('../../../scripts/lib/workflow-jobs.mjs')

/**
 * **The strings a human will type into branch protection must be the strings GitHub
 * publishes.**
 *
 * ## The trap this exists to disarm
 *
 * Branch protection matches on the check-run *name*. GitHub names a check run after its
 * job's `name:` key, so `ci.yml`'s jobs report as `Lint · Type-check · Unit tests · Build`
 * and `E2E tests (Playwright)`. `verify` and `e2e` are the job IDs and appear nowhere in
 * the checks API.
 *
 * Five documents in this repository asserted that `verify` and `e2e` were the required
 * checks. Requiring a context nothing reports does not error — the pull request simply
 * waits forever, on a check that will never arrive, with no message saying why. So the
 * repair everyone reaches for first, executed faithfully using the repository's own
 * written instructions, is the one that bricks the repository permanently. See
 * [ADR 015](../../../docs/adr/015-a-gate-that-was-only-ever-documented.md).
 *
 * That is a booby trap with a two-line disarm: read the names out of the workflow, read
 * the names out of the documents, and compare them. It costs milliseconds and it runs in
 * the fast gate, which is the whole argument for doing it here rather than trusting the
 * next reader to notice.
 *
 * ## Why documents declare contexts in a fenced block
 *
 * Prose cannot be checked without guessing at its grammar, and a guardrail that guesses
 * has unknown coverage ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 * So the convention is structural instead: a document that states the required contexts
 * states them inside a ```required-checks fence, one per line. The fence is exact, the
 * lines are literal, and this test reads every one of them in the repository.
 *
 * The convention's own coverage is asserted below — `MINIMUM_DECLARING_DOCUMENTS` fails
 * if the blocks quietly disappear, because a completeness check over an empty set is the
 * shape of green that proves nothing.
 */

const ROOT = resolve(__dirname, '../../..')
const CI_WORKFLOW = join(ROOT, '.github/workflows/ci.yml')

/**
 * Documents that must carry a `required-checks` block. Named rather than counted, so a
 * document dropping its block fails by name instead of by arithmetic.
 */
const MINIMUM_DECLARING_DOCUMENTS = [
  'CONTRIBUTING.md',
  'docs/testing-strategy.md',
  'docs/adr/015-a-gate-that-was-only-ever-documented.md',
]

interface Registry {
  controls: Array<{
    id: string
    requiredContexts?: string[]
    contextSource?: string
  }>
}

const registry: Registry = JSON.parse(readFileSync(join(ROOT, 'docs/controls.json'), 'utf8'))

const mergeGate = registry.controls.find((c) => c.id === 'merge-gate')

/**
 * Every markdown file in the repo, excluding vendored and generated trees.
 *
 * `.claude` used to be excluded here alongside them, and it does not belong in that company:
 * `node_modules`, `.next`, `.git` and `playwright-report` are vendored or generated, while
 * `.claude/skills/**` is hand-written guidance an agent reads *before* judging this
 * repository. Excluding it meant the one document that told a reader "both are required
 * checks on `main`" was the one document this contract could not see — while
 * `docs/controls.json` recorded `merge-gate` as `not-configured` and eleven commits reached
 * `main` unverified. Instructions to the thing doing the work are the last place a stale
 * claim should be allowed to sit.
 */
function markdownFiles(dir: string = ROOT): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'playwright-report'].includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full))
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}

/**
 * Every ```required-checks fence in a document, as its list of declared context names.
 *
 * Indentation-aware, because a fence nested inside a list item is ordinary markdown and
 * ADR 015 uses one. A convention that broke on valid markdown would be worked around
 * rather than followed, and a convention nobody follows checks nothing.
 */
function declaredContexts(source: string): string[][] {
  const blocks: string[][] = []
  for (const match of source.matchAll(/^([ \t]*)```required-checks\n([\s\S]*?)^\1```$/gm)) {
    blocks.push(
      match[2]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  }
  return blocks
}

const ciSource = readFileSync(CI_WORKFLOW, 'utf8')
const jobs = parseWorkflowJobs(ciSource)
const publishedNames = jobs.map((j: { checkName: string }) => j.checkName)

describe('the workflow parse is complete', () => {
  it('finds jobs at all', () => {
    // A parser that returns nothing makes every assertion below vacuously true.
    expect(jobs.length).toBeGreaterThan(0)
  })

  it('finds every job the jobs: block declares', () => {
    // Counted independently of the parse, so a change in indentation style fails here
    // rather than silently shrinking the set this test compares against.
    expect(jobs.length).toBe(countJobKeys(ciSource))
  })

  it('every job resolves to a non-empty published check name', () => {
    for (const job of jobs) {
      expect(job.checkName, `job ${job.id} has no usable check name`).toBeTruthy()
    }
  })
})

describe('the registry names the contexts ci.yml actually publishes', () => {
  it('declares a merge-gate control with required contexts', () => {
    expect(mergeGate, 'docs/controls.json has no merge-gate entry').toBeDefined()
    expect(mergeGate?.requiredContexts?.length).toBeGreaterThan(0)
  })

  it('points at the workflow those contexts come from', () => {
    expect(mergeGate?.contextSource).toBe('.github/workflows/ci.yml')
  })

  it('every required context is a name ci.yml publishes', () => {
    for (const context of mergeGate?.requiredContexts ?? []) {
      expect(
        publishedNames,
        `docs/controls.json requires the context "${context}", which no job in ci.yml ` +
          `publishes. GitHub names a check run after its job's \`name:\`, so the ` +
          `contexts available today are:\n  ${publishedNames.join('\n  ')}\n\n` +
          `Requiring a context nothing reports blocks every pull request permanently ` +
          `and silently. See docs/adr/015-a-gate-that-was-only-ever-documented.md.`
      ).toContain(context)
    }
  })

  it('requires every job ci.yml runs, not a subset', () => {
    // A gate that requires one of two jobs is a gate with a hole in it, and the hole is
    // invisible: the PR goes green on the half that is enforced.
    expect([...(mergeGate?.requiredContexts ?? [])].sort()).toEqual([...publishedNames].sort())
  })

  it('names no job ID — the specific string that would brick the repository', () => {
    const jobIds = jobs.map((j: { id: string }) => j.id)
    for (const context of mergeGate?.requiredContexts ?? []) {
      expect(
        jobIds,
        `"${context}" is a job ID, not a published check name. This is the exact ` +
          `mistake ADR 015 documents: nothing ever reports it, so every PR waits forever.`
      ).not.toContain(context)
    }
  })
})

describe('every document that states the required contexts states them correctly', () => {
  const documents = markdownFiles()
    .map((path) => ({ path, blocks: declaredContexts(readFileSync(path, 'utf8')) }))
    .filter((doc) => doc.blocks.length > 0)

  it('the convention has not quietly evaporated', () => {
    const declaring = documents.map((d) => relative(ROOT, d.path))
    for (const required of MINIMUM_DECLARING_DOCUMENTS) {
      expect(
        declaring,
        `${required} no longer declares a \`\`\`required-checks block. If it stopped ` +
          `discussing branch protection that is fine — remove it from ` +
          `MINIMUM_DECLARING_DOCUMENTS here and say so. If it still states the contexts ` +
          `in prose, this test can no longer check them.`
      ).toContain(required)
    }
  })

  it('every declared context is one ci.yml publishes', () => {
    for (const { path, blocks } of documents) {
      for (const block of blocks) {
        for (const context of block) {
          expect(
            publishedNames,
            `${relative(ROOT, path)} tells a reader to require the context ` +
              `"${context}", which ci.yml does not publish. Typing it into branch ` +
              `protection blocks every pull request forever.`
          ).toContain(context)
        }
      }
    }
  })

  it('every document agrees with the registry, in both directions', () => {
    const expected = [...(mergeGate?.requiredContexts ?? [])].sort()
    for (const { path, blocks } of documents) {
      for (const block of blocks) {
        expect([...block].sort(), `${relative(ROOT, path)} disagrees with docs/controls.json`).toEqual(
          expected
        )
      }
    }
  })
})
