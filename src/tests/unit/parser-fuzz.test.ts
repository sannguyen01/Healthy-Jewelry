import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { preflightArguments, commandArguments, conditions, pageRoutes } from '../support/parsers'
import { shellRenderings, workflowsWithCondition, treeReader, type Tree } from '../support/generate'

/**
 * **The readers, against inputs nobody wrote by hand.**
 *
 * ## Why the parsers and not the lists
 *
 * `sitemap-completeness`, `preflight-enumeration` and `workflow-condition-contract` get
 * described as three hand-maintained enumerations waiting to drift. They are not: each
 * already reconciles its list against a real source — the filesystem, the workflow YAML,
 * the parsed document — and generating more list entries would find nothing.
 *
 * The unexamined layer is the reader underneath. Every one of those checks is exactly as
 * wide as the function that feeds it, and **a reader that returns less than it should does
 * not fail; it narrows the question and passes.** Each file carries a hand-written "the
 * parse found something" anchor, which catches a reader returning *nothing* and is
 * completely blind to one returning *half*.
 *
 * Fuzzing the credential classifier found three crash paths before any reached production,
 * against a track record of finding the first three by incident. These are the same shape
 * of function — total, pure, fed by input the author does not control — so they get the
 * same treatment.
 *
 * ## The two properties
 *
 * 1. **Equivalence.** A rendering a maintainer would call identical must parse identically.
 *    This is what catches the silent narrowing.
 * 2. **Loud emptiness.** Given input the reader genuinely cannot handle, it must return
 *    *nothing* rather than something plausible. Empty trips each consumer's liveness
 *    anchor; a wrong-but-non-empty answer is the one that sails through.
 *
 * Neither property is randomised. Randomness finds crashes, and a crash here would be the
 * good outcome — the failure this repository actually keeps shipping is a check that
 * quietly stops covering what it was written for.
 */

const ROOT = resolve(__dirname, '../../..')
const SCRIPT = 'scripts/preflight-secrets.mjs'
const SECRETS = [
  'PRODUCTION_SITE_URL',
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_ADMIN_ACCESS_TOKEN',
  'SHOPIFY_WEBHOOK_SECRET',
]

/** Wraps a `run:` body into a workflow the parser can be pointed at. */
function workflowWithRun(run: string): string {
  const indented = run
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n')
  return ['name: Generated', 'on: push', 'jobs:', '  smoke:', '    runs-on: ubuntu-latest', '    steps:', '      - name: Preflight', '        run: |', indented, ''].join('\n')
}

describe('preflightArguments reads the command, not its formatting', () => {
  it.each(shellRenderings(SCRIPT, SECRETS))('%s', (_label, run) => {
    // The failure this replaces was not the reformat that returns nothing — the liveness
    // anchor in preflight-enumeration.test.ts already catches that. It was the reformat
    // that returns *four of five* names, leaving one secret unchecked while every
    // assertion downstream passes over the shortened list.
    expect(preflightArguments(workflowWithRun(run))).toEqual(SECRETS)
  })

  it.each([1, 2, 3, 4, 5, 6])('reads a list of %i arguments', (n) => {
    const args = SECRETS.slice(0, n).concat(Array.from({ length: Math.max(0, n - 5) }, (_, i) => `EXTRA_${i}`))
    for (const [, run] of shellRenderings(SCRIPT, args)) {
      expect(preflightArguments(workflowWithRun(run))).toEqual(args)
    }
  })

  it('finds the invocation whichever step carries it', () => {
    const doc = [
      'name: Generated',
      'on: push',
      'jobs:',
      '  smoke:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo first',
      '      - run: echo second',
      `      - run: node ${SCRIPT} ${SECRETS.join(' ')}`,
      '',
    ].join('\n')
    expect(preflightArguments(doc)).toEqual(SECRETS)
  })
})

describe('preflightArguments returns nothing rather than something plausible', () => {
  it.each([
    ['the script is not invoked anywhere', workflowWithRun('node scripts/other.mjs A B C')],
    ['the workflow has no jobs', 'name: Generated\non: push\n'],
    ['the document is not YAML at all', 'node ' + SCRIPT + ' A B C'],
    ['the document is malformed YAML', 'jobs:\n  - [unclosed\n'],
    ['the file is empty', ''],
  ])('%s', (_label, source) => {
    // Empty is the honest answer, and it is the one the consumer's liveness assertion is
    // watching for. Returning a partial list here would be worse than throwing.
    expect(preflightArguments(source)).toEqual([])
  })

  it('stops at a redirect rather than swallowing it as an argument', () => {
    expect(commandArguments(`node ${SCRIPT} A B 2>&1 | tee out.log`, SCRIPT)).toEqual(['A', 'B'])
  })

  it('stops at a pipe, a flag and a separator', () => {
    expect(commandArguments(`node ${SCRIPT} A | grep x`, SCRIPT)).toEqual(['A'])
    expect(commandArguments(`node ${SCRIPT} A --json`, SCRIPT)).toEqual(['A'])
    expect(commandArguments(`node ${SCRIPT} A; echo done`, SCRIPT)).toEqual(['A'])
  })
})

describe('conditions reads a condition through every YAML rendering', () => {
  const CONDITION = "always() && steps.merge-gate.outcome == 'failure'"

  it.each(workflowsWithCondition(CONDITION))('%s', (_label, source) => {
    // A folded scalar joins its lines with spaces and a literal one keeps the newline. If
    // either produced a different string, `workflow-condition-contract.test.ts` would stop
    // recognising the very `always() &&` it exists to require — and would report the
    // condition as compliant, because its check is a substring match.
    const found = conditions(source)
    expect(found).toHaveLength(1)
    expect(found[0].condition).toBe(CONDITION)
  })

  it.each(workflowsWithCondition("steps.probe.outcome == 'failure'"))(
    'still sees a bare decoupled reference in %s form',
    (_label, source) => {
      // The one that must never be missed: no status function named, so `success()` is
      // silently ANDed on. Three separate recurrences of this bug in this repository's
      // history, in three different syntaxes (ADR 027).
      expect(conditions(source)[0].condition).toBe("steps.probe.outcome == 'failure'")
    }
  )

  it('reads job-level and step-level conditions together', () => {
    const source = [
      'name: Generated',
      'on: push',
      'jobs:',
      '  audit:',
      '    runs-on: ubuntu-latest',
      "    if: always() && needs.build.result == 'success'",
      '    steps:',
      "      - if: failure()",
      '        run: echo hi',
      '',
    ].join('\n')
    expect(conditions(source).map((c) => c.condition)).toEqual([
      "always() && needs.build.result == 'success'",
      'failure()',
    ])
  })

  it.each([
    ['malformed YAML', 'jobs:\n  - [unclosed\n'],
    ['no jobs', 'name: x\non: push\n'],
    ['empty', ''],
  ])('returns nothing on %s', (_label, source) => {
    expect(conditions(source)).toEqual([])
  })

  it('ignores a non-string condition rather than stringifying it', () => {
    // `if: true` parses as a boolean. Coercing it would put "true" into a list of
    // conditions to audit and produce a finding about a condition nobody wrote.
    const source = 'name: x\non: push\njobs:\n  a:\n    steps:\n      - if: true\n        run: echo hi\n'
    expect(conditions(source)).toEqual([])
  })
})

describe('pageRoutes derives the URL, not the directory listing', () => {
  it('walks a plain tree', () => {
    const tree: Tree = {
      'page.tsx': null,
      shop: { 'page.tsx': null, '[collection]': { 'page.tsx': null } },
      about: { 'page.tsx': null },
    }
    expect(pageRoutes(treeReader(tree)).sort()).toEqual(['/', '/about', '/shop', '/shop/[collection]'])
  })

  it('drops a route group from the path, because the browser never sees it', () => {
    // `(marketing)/deals/page.tsx` serves `/deals`. The previous walk emitted
    // `/(marketing)/deals` — a string no browser requests. `sitemap-completeness` would
    // then demand that non-route be classified *and* never notice that the real `/deals`
    // was absent from the sitemap: a false finding standing in for a true one.
    const tree: Tree = { '(marketing)': { deals: { 'page.tsx': null } } }
    expect(pageRoutes(treeReader(tree))).toEqual(['/deals'])
  })

  it('handles nested and sibling groups', () => {
    const tree: Tree = {
      '(shop)': { deals: { 'page.tsx': null }, '(seasonal)': { summer: { 'page.tsx': null } } },
      '(legal)': { terms: { 'page.tsx': null } },
    }
    expect(pageRoutes(treeReader(tree)).sort()).toEqual(['/deals', '/summer', '/terms'])
  })

  it('a group holding the root page still serves the root', () => {
    expect(pageRoutes(treeReader({ '(home)': { 'page.tsx': null } }))).toEqual(['/'])
  })

  it('skips a parallel-route slot, which is not a navigable page', () => {
    // `@modal/page.tsx` renders inside another route's layout. Emitting it would classify
    // a route that does not exist — the same error as the group, in the other direction.
    const tree: Tree = { '@modal': { 'page.tsx': null }, shop: { 'page.tsx': null } }
    expect(pageRoutes(treeReader(tree))).toEqual(['/shop'])
  })

  it.each([
    ['api handlers', { api: { health: { 'route.ts': null } } } as Tree],
    ['private folders', { _components: { 'page.tsx': null } } as Tree],
    ['a directory with no page', { shop: { 'layout.tsx': null } } as Tree],
    ['an empty tree', {} as Tree],
  ])('returns nothing for %s', (_label, tree) => {
    expect(pageRoutes(treeReader(tree))).toEqual([])
  })
})

describe('the generated inputs still describe the real ones', () => {
  it('the real production-smoke workflow parses to the same list', () => {
    // A generator that has drifted from the file it models tests a world that does not
    // exist. This pins the two together.
    const real = preflightArguments(
      readFileSync(join(ROOT, '.github/workflows/production-smoke.yml'), 'utf8')
    )
    expect(real).toEqual(SECRETS)
  })
})
