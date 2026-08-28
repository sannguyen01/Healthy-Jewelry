import ts from 'typescript'
import { walk } from './tsAstScan'

/**
 * What a Playwright spec navigates to, resolved from source.
 *
 * ## Why this exists
 *
 * `e2e/contact.spec.ts` asserted a `{ success: true }` contract that PR #32 had deleted
 * 17 days earlier. It kept passing — for the wrong reason — so the contact form's actual
 * success path had zero real coverage for that entire window, invisible because the test
 * looked green.
 *
 * The cheapest structural tell of a fossilised spec is that it navigates somewhere that
 * no longer exists. A spec pointing at a deleted route does not fail loudly in this
 * suite: Playwright will happily `goto` a 404 and every assertion phrased as "a heading
 * is visible" or "the status is not 500" still passes on the error page.
 *
 * ## Why it reports what it could not resolve
 *
 * A scan that silently skips what it does not understand has unknown coverage, which is
 * what [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) is
 * about. Half the `goto` calls in this suite are template literals, loop variables
 * destructured from a local array, or module constants — a literal-only regex would
 * quietly cover a third of the file and report success.
 *
 * So `collectGotoAnchors` returns three sets: paths it resolved, dynamic prefixes it
 * resolved (a `goto(\`/products/${handle}\`)` proves the *route* is exercised without
 * naming a handle), and the expressions it could not resolve at all. The caller asserts
 * on the third one, so the scan's blind spot is a number a test can watch rather than a
 * silence.
 */
export interface GotoAnchors {
  /** Fully-resolved literal paths, e.g. `/shop/rings`. */
  paths: string[]
  /** Static prefixes of interpolated paths, e.g. `/products/` from a template literal. */
  prefixes: string[]
  /** Source text of every `goto` argument this could not resolve. */
  unresolved: string[]
}

/** String-literal values of `const NAME = '…'` declarations anywhere in the file. */
function stringConstants(sourceFile: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>()
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (!ts.isIdentifier(node.name)) return
    if (node.initializer && ts.isStringLiteralLike(node.initializer)) {
      constants.set(node.name.text, node.initializer.text)
    }
  })
  return constants
}

/**
 * Values reachable through `for (const { path } of SOME_ARRAY)`.
 *
 * `a11y.spec.ts` and `legal-pages.spec.ts` both drive their navigation from a local table
 * of `{ name, path }` objects, which is good practice and completely opaque to a literal
 * scan. Keyed by the destructured property name, since that is what the loop body then
 * passes to `goto`.
 */
function destructuredArrayValues(sourceFile: ts.SourceFile): Map<string, string[]> {
  const byProperty = new Map<string, string[]>()

  const arrays = new Map<string, ts.ArrayLiteralExpression>()
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (!ts.isIdentifier(node.name)) return
    if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      arrays.set(node.name.text, node.initializer)
    }
  })

  walk(sourceFile, (node) => {
    if (!ts.isForOfStatement(node)) return
    const declarations = ts.isVariableDeclarationList(node.initializer)
      ? node.initializer.declarations
      : []
    const source = ts.isIdentifier(node.expression) ? arrays.get(node.expression.text) : undefined
    if (!source) return

    for (const declaration of declarations) {
      if (!ts.isObjectBindingPattern(declaration.name)) continue
      for (const element of declaration.name.elements) {
        if (!ts.isIdentifier(element.name)) continue
        const key = (element.propertyName ?? element.name).getText(sourceFile)
        const values: string[] = []
        for (const item of source.elements) {
          if (!ts.isObjectLiteralExpression(item)) continue
          for (const property of item.properties) {
            if (!ts.isPropertyAssignment(property)) continue
            if (property.name.getText(sourceFile) !== key) continue
            if (ts.isStringLiteralLike(property.initializer)) values.push(property.initializer.text)
          }
        }
        if (values.length > 0) {
          byProperty.set(element.name.text, [...(byProperty.get(element.name.text) ?? []), ...values])
        }
      }
    }
  })

  return byProperty
}

/**
 * Values reachable through `for (const item of SOME_ARRAY)` followed by `item.prop`.
 *
 * The non-destructured sibling of the case above, and the one `visual-assets.spec.ts`
 * uses: it drives five product surfaces from a table of `{ name, url, selector }`. Keyed
 * `variable.property`, which is exactly what the `goto` call site writes.
 */
function loopMemberValues(sourceFile: ts.SourceFile): Map<string, string[]> {
  const byAccess = new Map<string, string[]>()

  const arrays = new Map<string, ts.ArrayLiteralExpression>()
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (!ts.isIdentifier(node.name)) return
    if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      arrays.set(node.name.text, node.initializer)
    }
  })

  walk(sourceFile, (node) => {
    if (!ts.isForOfStatement(node)) return
    if (!ts.isVariableDeclarationList(node.initializer)) return
    const source = ts.isIdentifier(node.expression) ? arrays.get(node.expression.text) : undefined
    if (!source) return

    for (const declaration of node.initializer.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue
      const variable = declaration.name.text
      for (const item of source.elements) {
        if (!ts.isObjectLiteralExpression(item)) continue
        for (const property of item.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          if (!ts.isStringLiteralLike(property.initializer)) continue
          const key = `${variable}.${property.name.getText(sourceFile)}`
          byAccess.set(key, [...(byAccess.get(key) ?? []), property.initializer.text])
        }
      }
    }
  })

  return byAccess
}

/**
 * Every `page.goto(...)` / `goto(...)` argument in a spec, resolved as far as the source
 * allows.
 */
export function collectGotoAnchors(sourceFile: ts.SourceFile): GotoAnchors {
  const constants = stringConstants(sourceFile)
  const loopValues = destructuredArrayValues(sourceFile)
  const memberValues = loopMemberValues(sourceFile)

  const paths = new Set<string>()
  const prefixes = new Set<string>()
  const unresolved = new Set<string>()

  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined
    if (name !== 'goto') return

    const argument = node.arguments[0]
    if (!argument) return

    if (ts.isStringLiteralLike(argument)) {
      paths.add(argument.text)
      return
    }

    if (ts.isTemplateExpression(argument)) {
      // The static head is the part that identifies the route. `/products/${handle}`
      // proves /products/[handle] is exercised; which handle is not this scan's question.
      prefixes.add(argument.head.text)
      return
    }

    if (ts.isIdentifier(argument)) {
      const constant = constants.get(argument.text)
      if (constant !== undefined) {
        paths.add(constant)
        return
      }
      const fromLoop = loopValues.get(argument.text)
      if (fromLoop) {
        for (const value of fromLoop) paths.add(value)
        return
      }
    }

    if (ts.isPropertyAccessExpression(argument)) {
      const fromMember = memberValues.get(argument.getText(sourceFile))
      if (fromMember) {
        for (const value of fromMember) paths.add(value)
        return
      }
    }

    unresolved.add(argument.getText(sourceFile))
  })

  return {
    paths: [...paths].sort(),
    prefixes: [...prefixes].sort(),
    unresolved: [...unresolved].sort(),
  }
}

/**
 * Strips a query string and hash, leaving the path a route must serve.
 *
 * `goto('/search?q=titanium')` exercises `/search`; the query is the test's input, not a
 * different route.
 */
export function routeOf(anchor: string): string {
  return anchor.split('?')[0].split('#')[0].replace(/\/$/, '') || '/'
}
