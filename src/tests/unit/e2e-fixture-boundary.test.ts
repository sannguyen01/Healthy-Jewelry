import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { importsFrom, parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **Every E2E spec runs inside the egress boundary, or this fails.**
 *
 * `e2e/support/test.ts` extends Playwright's `test` with an automatic fixture that records
 * every browser request and every CSP violation and fails the test on anything contract §12
 * does not approve. It protects exactly the specs that import `test` from it. A spec that
 * imports `test` from `@playwright/test` directly runs with no boundary at all — and looks,
 * in review and in the report, identical to one that does.
 *
 * So the import is the control, and it is checked through the compiler rather than by a
 * grep ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)): an
 * aliased `import { test as it }`, a namespace import and a second import statement are
 * all distinct AST forms that a line match gets wrong in one direction or the other.
 *
 * `import type { Page } from '@playwright/test'` stays legal. A type is erased before the
 * spec runs and cannot carry a fixture, so forbidding it would be a rule with a cost and no
 * yield ([ADR 021](../../../docs/adr/021-a-metric-with-only-one-direction.md)'s point about
 * lint rules whose whole output is noise).
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const E2E = path.join(ROOT, 'e2e')
const SUPPORT_TEST = './support/test'

const specs = readdirSync(E2E)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort()
  .map((f) => ({ file: f, source: parseSource(f, readFileSync(path.join(E2E, f), 'utf8')) }))

/** Value (non-type) bindings a file imports from one module. */
function valueImports(sf: ts.SourceFile, module: string): string[] {
  const out: string[] = []
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== module) continue
    const clause = st.importClause
    if (!clause) {
      out.push('(side effect)')
      continue
    }
    if (clause.isTypeOnly) continue
    if (clause.name) out.push('default')
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) out.push('*')
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) if (!el.isTypeOnly) out.push((el.propertyName ?? el.name).text)
    }
  }
  return out
}

describe('the scan found the suite', () => {
  it('reads every spec', () => {
    // Without this, an empty directory listing would make every assertion below vacuous.
    expect(specs.length).toBeGreaterThan(10)
  })
})

describe('every spec takes test and expect from the boundary', () => {
  it.each(specs.map((s) => [s.file, s] as const))('%s', (_file, { source }) => {
    const fromBoundary = importsFrom(source, SUPPORT_TEST).map((b) => b.imported)
    expect(
      fromBoundary,
      `imports nothing called \`test\` from '${SUPPORT_TEST}', so no egress or CSP check runs ` +
        `on any test in it — and the report cannot tell.`
    ).toContain('test')

    const direct = valueImports(source, '@playwright/test')
    expect(
      direct,
      `imports ${direct.join(', ')} from '@playwright/test' directly. \`test\` from there has ` +
        `no boundary fixture. Import \`test\` and \`expect\` from '${SUPPORT_TEST}'; types may ` +
        `still come from '@playwright/test' with \`import type\`.`
    ).toEqual([])
  })
})

describe('the boundary is automatic, not opt-in', () => {
  const source = parseSource('test.ts', readFileSync(path.join(E2E, 'support/test.ts'), 'utf8'))

  it('extends the base test with a fixture declared { auto: true }', () => {
    // A fixture a spec must request by name is a fixture the next spec does not request.
    let extendCalls = 0
    let auto = false
    walk(source, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'extend'
      ) {
        extendCalls += 1
        walk(node, (inner) => {
          if (
            ts.isPropertyAssignment(inner) &&
            ts.isIdentifier(inner.name) &&
            inner.name.text === 'auto' &&
            inner.initializer.kind === ts.SyntaxKind.TrueKeyword
          ) {
            auto = true
          }
        })
      }
    })
    expect(extendCalls, 'e2e/support/test.ts no longer calls test.extend').toBe(1)
    expect(auto, 'the boundary fixture is no longer { auto: true }').toBe(true)
  })

  it('re-exports expect, so no spec needs @playwright/test for it', () => {
    const reexported = source.statements.some(
      (s) =>
        ts.isExportDeclaration(s) &&
        !s.moduleSpecifier &&
        !!s.exportClause &&
        ts.isNamedExports(s.exportClause) &&
        s.exportClause.elements.some((e) => e.name.text === 'expect')
    )
    expect(reexported).toBe(true)
  })

  it('has a canary that proves it can fail', () => {
    // The fixture never fires on a correct site. Without a spec that makes it fire, it is a
    // check that has only ever been observed passing (ADR 020).
    const canary = specs.find((s) => s.file === 'egress-canary.spec.ts')
    expect(canary, 'e2e/egress-canary.spec.ts is gone').toBeTruthy()
    const text = canary!.source.getFullText()
    expect(text).toMatch(/expectFinding\('forbidden-origin'\)/)
    expect(text).toMatch(/test\.fail\(\)/)
  })
})

describe('the rule itself, on inputs with known answers', () => {
  const check = (src: string) => ({
    boundary: importsFrom(parseSource('x.spec.ts', src), SUPPORT_TEST).map((b) => b.imported),
    direct: valueImports(parseSource('x.spec.ts', src), '@playwright/test'),
  })

  it('accepts the canonical form and a type-only direct import', () => {
    expect(check(`import { test, expect, type Page } from './support/test'`)).toEqual({
      boundary: ['test', 'expect', 'Page'],
      direct: [],
    })
    expect(check(`import { test } from './support/test'\nimport type { Page } from '@playwright/test'`).direct).toEqual([])
  })

  it('refuses a direct test, however it is spelled', () => {
    expect(check(`import { test } from '@playwright/test'`).direct).toEqual(['test'])
    expect(check(`import { test as it } from '@playwright/test'`).direct).toEqual(['test'])
    expect(check(`import * as pw from '@playwright/test'`).direct).toEqual(['*'])
    expect(check(`import pw from '@playwright/test'`).direct).toEqual(['default'])
    expect(check(`import { type Page, expect } from '@playwright/test'`).direct).toEqual(['expect'])
  })

  it('does not mistake a comment for an import', () => {
    expect(check(`// import { test } from '@playwright/test'\nimport { test } from './support/test'`).direct).toEqual([])
  })
})
