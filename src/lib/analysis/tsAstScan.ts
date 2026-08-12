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
 * Every environment variable read by name.
 *
 * Recognises `process.env.NAME` and `process.env['NAME']`, and deliberately **not**
 * `process.env[someVariable]` — a computed key has no statically knowable name, and
 * inventing one would be a guess reported as a fact. `/api/version/route.ts` reads
 * exactly that way on purpose (to dodge Next's build-time inliner), and it is right
 * that this returns nothing for it.
 *
 * The regex version of this scan read `process.env.NEXT_PUBLIC_FOO` out of a *code
 * comment explaining the inliner* and reported it as an undocumented variable. That is
 * the same false positive ADR 007 was written about, in a third guardrail the ADR did
 * not convert — comments are never nodes, so through the parser it cannot happen.
 */
export function envReads(sourceFile: ts.SourceFile): string[] {
  const names: string[] = []

  const isProcessEnv = (node: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'env' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'

  walk(sourceFile, (node) => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      names.push(node.name.text)
    } else if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      names.push(node.argumentExpression.text)
    }
  })

  return names
}

function propertyKey(node: ts.PropertyAssignment): string | null {
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
}

/**
 * The elements of an array assigned to a named property, as source text.
 *
 * `requireSibling` narrows the match to arrays inside an object literal that *also* declares
 * that sibling property. Without it, a property name alone is a poor identifier: scanning
 * the whole tree for `tags: [...]` matches Next's fetch-cache options **and** the `tags`
 * field on every product in `hj-data.ts`, which reported `rings`, `titanium` and
 * `bestseller` as cache tags.
 *
 * That false positive appeared the moment the cache-tag contract widened from two named
 * files to every module — a reminder that broadening a scan changes what "the same query"
 * means. Requiring `revalidate` as a sibling identifies a Next cache-options object
 * structurally rather than by hoping the name is unique.
 */
export function arrayPropertyValues(
  sourceFile: ts.SourceFile,
  propertyName: string,
  requireSibling?: string,
): string[][] {
  const found: string[][] = []

  walk(sourceFile, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return

    const assignments = node.properties.filter(ts.isPropertyAssignment)
    if (requireSibling && !assignments.some((p) => propertyKey(p) === requireSibling)) return

    for (const property of assignments) {
      if (propertyKey(property) !== propertyName) continue
      if (ts.isArrayLiteralExpression(property.initializer)) {
        found.push(property.initializer.elements.map((el) => el.getText(sourceFile)))
      }
    }
  })

  return found
}
