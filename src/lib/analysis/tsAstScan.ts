import ts from 'typescript'

/**
 * Shared TypeScript AST scanning for the source-analysis guardrails.
 *
 * ## Why this replaced regex
 *
 * `metadata-data-source.test.ts` and `cache-tag-contract.test.ts` both used to match
 * patterns against raw source text. Both were measurably incomplete, and — this is the
 * part worth remembering — **the intuitions about which patterns evaded them were wrong in
 * both directions**:
 *
 * | Pattern | Regex behaviour |
 * |---|---|
 * | `revalidateTag(\n  expr\n)` across lines | already caught |
 * | `import { x as y }` | already handled |
 * | a call written inside a comment | **false positive** |
 * | `import * as hj from '…'` | **missed entirely** |
 * | a second import of the same module in one file | **missed** (`.match`, not `.matchAll`) |
 *
 * A guardrail whose coverage nobody can enumerate is a guardrail trusted more than it
 * deserves. The parser removes the guesswork: comments are never emitted as nodes, every
 * import form is a distinct node type, and every call is a `CallExpression` regardless of
 * how it is formatted.
 *
 * ## Test-only
 *
 * Imported exclusively by tests, which keeps `typescript` a devDependency and out of the
 * app bundle. It lives under `src/lib` rather than `src/tests` so it can be reused, not
 * because the application may import it.
 */

/** Parse one file. `setParentNodes: false` — nothing here walks upward. */
export function parseSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, scriptKind(filePath))
}

function scriptKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

/** Depth-first visit of every node. */
export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/** One binding brought into scope from a module. */
export interface ImportBinding {
  /** The name as exported by the module. `*` for a namespace import. */
  imported: string
  /** The local name. Differs from `imported` when aliased. */
  local: string
  /** True for `import * as ns from '…'`. */
  namespace: boolean
}

/**
 * Every binding a file imports from one module specifier.
 *
 * Handles all the forms the regex did not:
 *
 *   - `import { a, b as c } from 'm'`
 *   - `import * as ns from 'm'`          ← previously invisible
 *   - `import d from 'm'`
 *   - two or more separate `import … from 'm'` statements  ← previously only the first
 *   - `export { a } from 'm'` re-exports
 */
export function importsFrom(sourceFile: ts.SourceFile, moduleSpecifier: string): ImportBinding[] {
  const bindings: ImportBinding[] = []

  const matchesModule = (node: ts.Expression | undefined): boolean =>
    !!node && ts.isStringLiteral(node) && node.text === moduleSpecifier

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && matchesModule(statement.moduleSpecifier)) {
      const clause = statement.importClause
      if (!clause) continue // `import 'm'` — side effect only, binds nothing.

      if (clause.name) {
        bindings.push({ imported: 'default', local: clause.name.text, namespace: false })
      }

      const named = clause.namedBindings
      if (named && ts.isNamespaceImport(named)) {
        bindings.push({ imported: '*', local: named.name.text, namespace: true })
      } else if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          bindings.push({
            // `propertyName` is set only when aliased: `{ a as b }` → propertyName a, name b.
            imported: (element.propertyName ?? element.name).text,
            local: element.name.text,
            namespace: false,
          })
        }
      }
    }

    // `export { a } from 'm'` re-exports the binding without importing it locally — still a
    // way for a module's surface to reach code that is supposed to be walled off.
    if (ts.isExportDeclaration(statement) && matchesModule(statement.moduleSpecifier)) {
      const clause = statement.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          bindings.push({
            imported: (element.propertyName ?? element.name).text,
            local: element.name.text,
            namespace: false,
          })
        }
      } else if (clause && ts.isNamespaceExport(clause)) {
        bindings.push({ imported: '*', local: clause.name.text, namespace: true })
      } else if (!clause) {
        bindings.push({ imported: '*', local: '*', namespace: true }) // `export * from 'm'`
      }
    }
  }

  return bindings
}

/**
 * Every call to a named function, with each argument as source text.
 *
 * Formatting is irrelevant — a call split across lines is the same `CallExpression` — and
 * a call written inside a comment does not exist as a node at all, which is what makes the
 * false positive structurally impossible rather than filtered out afterwards.
 */
export function callsTo(sourceFile: ts.SourceFile, functionName: string): string[][] {
  const calls: string[][] = []

  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return

    const callee = node.expression
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null

    if (name === functionName) {
      calls.push(node.arguments.map((arg) => arg.getText(sourceFile)))
    }
  })

  return calls
}

/**
 * The elements of an array assigned to a named property, as source text.
 *
 * Used for the `tags: [...]` option on Shopify fetches. Returns one entry per occurrence,
 * so a file with several fetches yields several arrays.
 */
export function arrayPropertyValues(sourceFile: ts.SourceFile, propertyName: string): string[][] {
  const found: string[][] = []

  walk(sourceFile, (node) => {
    if (!ts.isPropertyAssignment(node)) return

    const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
    if (key !== propertyName) return

    if (ts.isArrayLiteralExpression(node.initializer)) {
      found.push(node.initializer.elements.map((el) => el.getText(sourceFile)))
    }
  })

  return found
}
