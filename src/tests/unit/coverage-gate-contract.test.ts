import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **A threshold declared in config and invoked by no runner is not a threshold.**
 *
 * ## The gap this closes
 *
 * `vitest.config.ts` has declared `thresholds: { lines: 80, functions: 80, branches: 80,
 * statements: 80 }` for as long as coverage has been configured. `CLAUDE.md` asserts the
 * standard twice — *"Testing: Vitest + Testing Library (80%+ coverage required)"* and
 * *"Run `pnpm test` — maintain 80%+ coverage"*. `docs/testing-strategy.md` explains at
 * length which directories the scope deliberately excludes and why.
 *
 * `grep -rn "coverage" .github/workflows/` returned **zero matches**.
 *
 * The merge gate ran `pnpm exec vitest run` — no `--coverage` — so the thresholds never
 * evaluated. `package.json`'s `test:coverage` script had no callers anywhere in the
 * repository. And `CLAUDE.md`'s own instruction, `pnpm test`, maps to `vitest` in watch
 * mode, which does not compute coverage either. A regression that took coverage to 40%
 * would have passed `verify`, passed `e2e`, and merged.
 *
 * ## Why this is the same defect as five ADRs, not a new one
 *
 * [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md): *a document
 * may not assert that a control is configured unless a probe reads that configuration from
 * its own source of truth.* `docs/controls.json` registers sixteen controls under that
 * rule. It did not register the repository's own coverage gate, so the one control living
 * inside the test configuration was the one the control registry could not see.
 *
 * [ADR 010](../../../docs/adr/010-a-control-that-cannot-fail.md) is the same shape in
 * shell: a step that asks "did the script pass?" and evaluates something else. Here the
 * config asks "is coverage above 80?" and nothing evaluates it at all.
 *
 * ## What this asserts, and why each one
 *
 * The config is read through the **TypeScript AST**, never regex-matched and never
 * imported. A guardrail that matches source with a pattern has unknown coverage
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)) — it would
 * be asserting the presence of a string rather than the value of a setting, which is
 * exactly the difference between a claim and a control.
 *
 * Importing it was the first attempt and does not work: `vitest.config.ts` pulls in
 * `@vitejs/plugin-react`, which loads esbuild, which refuses to initialise inside the
 * jsdom environment this suite runs in. `src/lib/analysis/tsAstScan.ts` is the tool this
 * repository already built for exactly this problem, and it gives an exact answer where a
 * regex would give a plausible one.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

/** The merge gate. A threshold enforced anywhere else blocks nothing. */
const MERGE_GATE = 'ci.yml'

type Step = { run?: unknown; name?: unknown; uses?: unknown }
type Job = { steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

/** Every `run:` script in a workflow, flattened. */
function runScripts(file: string): string[] {
  const doc = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
  return Object.values(doc?.jobs ?? {})
    .flatMap((job) => job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run): run is string => typeof run === 'string')
}

/**
 * Whether a shell command computes coverage.
 *
 * Both spellings, because both are legitimate and a check that knew only one would go
 * quiet the day somebody switched. `pnpm test:coverage` is the documented local command;
 * `--coverage` is what a workflow is likely to write inline.
 */
function computesCoverage(script: string): boolean {
  return /--coverage\b/.test(script) || /\btest:coverage\b/.test(script)
}

/**
 * The `coverage: { … }` object literal in `vitest.config.ts`, as AST.
 *
 * Located by name rather than by position, so reordering the config cannot silently make
 * this read a different object.
 */
function coverageObject(): ts.ObjectLiteralExpression | null {
  const source = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
  let found: ts.ObjectLiteralExpression | null = null

  walk(parseSource('vitest.config.ts', source), (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'coverage' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found = node.initializer
    }
  })

  return found
}

/** One named property of the coverage object, as AST. */
function coverageProperty(name: string): ts.Expression | null {
  const coverage = coverageObject()
  if (!coverage) return null

  for (const prop of coverage.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === name) {
      return prop.initializer
    }
  }
  return null
}

/** The declared thresholds, as real numbers. */
function declaredThresholds(): Record<string, number> | null {
  const node = coverageProperty('thresholds')
  if (!node || !ts.isObjectLiteralExpression(node)) return null

  const out: Record<string, number> = {}
  for (const prop of node.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      ts.isNumericLiteral(prop.initializer)
    ) {
      out[prop.name.text] = Number(prop.initializer.text)
    }
  }
  return out
}

const thresholds = declaredThresholds()

describe('the coverage threshold is declared', () => {
  it('vitest.config.ts sets thresholds at all', () => {
    expect(
      thresholds,
      'vitest.config.ts declares no coverage thresholds. If that is deliberate, delete ' +
        'the 80%+ claims from CLAUDE.md and docs/testing-strategy.md in the same commit — ' +
        'a standard asserted in prose and set nowhere is the shape ADR 018 forbids.'
    ).toBeTruthy()
  })

  it.each(['lines', 'functions', 'branches', 'statements'])(
    'the %s threshold is a number above zero',
    (metric) => {
      const value = thresholds?.[metric]
      expect(typeof value, `coverage threshold "${metric}" is not a number`).toBe('number')
      // Zero is not a floor, it is the absence of one wearing a floor's name — and it
      // passes every run, forever, while reading as configured.
      expect(value as number, `coverage threshold "${metric}" is 0, which cannot fail`)
        .toBeGreaterThan(0)
    }
  )
})

describe('something actually runs it', () => {
  const workflows = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))

  it('at least one workflow computes coverage', () => {
    const invoking = workflows.filter((file) => runScripts(file).some(computesCoverage))

    expect(
      invoking,
      'No workflow runs vitest with coverage, so the thresholds in vitest.config.ts are ' +
        'evaluated by nothing. This was the state of the repository until 2026-09-15: ' +
        'four thresholds declared, three prose claims asserting them, and zero matches ' +
        'for "coverage" across .github/workflows/.'
    ).not.toHaveLength(0)
  })

  it(`${MERGE_GATE} is one of them — a threshold enforced elsewhere blocks nothing`, () => {
    expect(
      runScripts(MERGE_GATE).some(computesCoverage),
      `${MERGE_GATE} is the merge gate (docs/testing-strategy.md). A coverage threshold ` +
        `computed only on a schedule reports a regression after it has already landed, ` +
        `which is a different and much weaker control than refusing it.`
    ).toBe(true)
  })

  it('the documented local command computes it too', () => {
    // CLAUDE.md tells a contributor to "maintain 80%+ coverage" and points at `pnpm test`.
    // If the script it names does not measure coverage, the instruction is unfollowable —
    // which is how a standard becomes folklore.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const script = pkg.scripts?.['test:coverage']

    expect(script, 'package.json has no test:coverage script').toBeTruthy()
    expect(
      computesCoverage(script ?? ''),
      `package.json's test:coverage script ("${script}") does not compute coverage.`
    ).toBe(true)
  })
})

describe('the scope is stated, not accidental', () => {
  it('coverage is scoped to an explicit include list', () => {
    // The scope is a deliberate decision — `docs/testing-strategy.md` argues it at length,
    // and `e2e/COVERAGE.md` is the compensating control for the UI layer it excludes. An
    // absent `include` would silently widen it to everything, which would make the
    // threshold trivially unmeetable and get it lowered rather than get code tested.
    const include = coverageProperty('include')
    expect(
      include !== null && ts.isArrayLiteralExpression(include) && include.elements.length > 0,
      'vitest.config.ts declares coverage thresholds with no `include` list. The scope ' +
        'would then be every file vitest touches, the threshold would fail on arrival, ' +
        'and the fix under time pressure is always to lower the number.'
    ).toBe(true)
  })
})
