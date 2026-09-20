import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **`docs/failure-modes.md`, held against the types it describes.**
 *
 * ## Why a failure-mode document is the most tempting place to write fiction
 *
 * It reads as diligence whether or not it is true. A table of degradations with
 * tidy rows looks like evidence of care, and nothing about it changes when a new
 * variant is added to a union somewhere and the table is not. That is
 * [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)'s
 * shape — a claim about a control, written where a control should be — and this
 * repository has shipped it before: `--titanium-text` carried a documented
 * contrast ratio measured against a colour that had been rejected, because
 * somebody updated the number and not the swatch and nothing compared the two.
 *
 * So the table is reconciled, in **both** directions:
 *
 *   · every string-literal member of every registered union must appear in the
 *     document, so adding a failure mode without deciding how it surfaces fails
 *     the gate;
 *   · every mode the document claims for a union must still exist in it, so a
 *     row describing a variant that was deleted fails too. A stale row is worse
 *     than a missing one: it is an assurance nobody re-examined.
 *
 * ## Why the AST, and why literals rather than names
 *
 * Read through the TypeScript AST because a regex over source would count a
 * variant named in a comment and miss one written across a line break
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 * Collected as *every string literal anywhere in the alias* rather than by
 * matching a union shape, because the registered types are not all the same
 * shape: `FallbackReason` is a flat union of strings, `IdTokenVerdict` and
 * `HandoffVerdict` are discriminated unions whose literals live inside a
 * `reason` property. Over-collecting is the safe direction — it can only demand
 * that more be documented.
 */

const ROOT = resolve(__dirname, '../../..')
const REGISTRY = join(ROOT, 'docs/failure-modes.md')

/**
 * The unions this document is responsible for.
 *
 * A type added here with no rows fails immediately, which is the intended way to
 * register a new one: write the entry, watch it fail, then document the modes.
 */
const REGISTERED: { file: string; type: string }[] = [
  { file: 'src/lib/shopify/index.ts', type: 'FallbackReason' },
  { file: 'src/lib/utils/rateLimit.ts', type: 'RateLimitFailurePosture' },
  { file: 'src/lib/utils/rateLimit.ts', type: 'RateLimiterHealth' },
  { file: 'src/lib/http/readBoundedBody.ts', type: 'BoundedFailure' },
]

/** Every string literal appearing anywhere inside one type alias. */
function literalsOf(file: string, typeName: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const ast = parseSource(file, source)

  let alias: ts.TypeNode | null = null
  walk(ast, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) alias = node.type
  })
  if (!alias) return []

  const out: string[] = []
  const collect = (node: ts.Node): void => {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) out.push(node.literal.text)
    ts.forEachChild(node, collect)
  }
  collect(alias)
  return [...new Set(out)]
}

const markdown = readFileSync(REGISTRY, 'utf8')

/** Rows of every table, as raw cell arrays. */
function tableRows(): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|') && !/^\s*\|[\s|:-]+\|\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length >= 2 && cells[0] !== 'mode')
}

const rows = tableRows()
/** The `mode` cell of every row, with its backticks stripped. */
const documentedModes = new Set(rows.map((cells) => cells[0].replace(/`/g, '')))

describe('the registry parses', () => {
  it('finds tables with rows in them', () => {
    // Guards the parser. A change to the document's table syntax silently empties
    // this set, and every "is it documented?" assertion below would then fail
    // loudly rather than pass vacuously — but the reverse direction would pass,
    // so this is asserted rather than assumed.
    expect(
      rows.length,
      'No table rows parsed out of docs/failure-modes.md. The table syntax changed and ' +
        'this reconciliation is reading nothing.'
    ).toBeGreaterThan(15)
  })

  it('names every registered type in the prose, so a reader can find the source', () => {
    for (const { type, file } of REGISTERED) {
      expect(markdown, `docs/failure-modes.md never mentions ${type}`).toContain(type)
      expect(markdown, `docs/failure-modes.md never names ${file}`).toContain(file)
    }
  })
})

describe('every declared failure mode is documented', () => {
  it.each(REGISTERED.map((r) => [`${r.type} (${r.file})`, r] as const))(
    '%s',
    (_label, { file, type }) => {
      const declared = literalsOf(file, type)

      expect(
        declared.length,
        `${type} in ${file} declares no string-literal members. Either it was renamed or ` +
          `removed, or it stopped being a union of literals — in which case take it out of ` +
          `REGISTERED rather than leaving a check that reconciles an empty set.`
      ).toBeGreaterThan(0)

      const undocumented = declared.filter((mode) => !documentedModes.has(mode))
      expect(
        undocumented,
        `${type} declares ${undocumented.join(', ')}, which docs/failure-modes.md does not ` +
          `list. A failure mode added without deciding how it surfaces is how ` +
          `getProducts came to serve the bundled catalogue on a TypeError and log nothing.`
      ).toEqual([])
    }
  )
})

describe('the document does not describe modes that no longer exist', () => {
  it('every documented mode is still declared somewhere', () => {
    const declared = new Set(REGISTERED.flatMap(({ file, type }) => literalsOf(file, type)))

    // Rows in the trailing "no enumeration" table describe modes with no type by
    // design, and their `mode` cell is a sentence rather than an identifier.
    // Identifier-shaped cells are the ones claiming to name a variant.
    const identifierLike = [...documentedModes].filter((mode) => /^[a-z][a-z0-9-]*$/.test(mode))
    const stale = identifierLike.filter((mode) => !declared.has(mode))

    expect(
      stale,
      `docs/failure-modes.md documents ${stale.join(', ')}, which no registered union ` +
        `declares any more. A row describing a variant that was deleted is an assurance ` +
        `nobody re-examined — the same thing as a coverage exception naming a test that ` +
        `no longer exists.`
    ).toEqual([])
  })
})

describe('every mode names a test that would notice', () => {
  it('each row cites at least one existing spec file', () => {
    // The `covered by` column is the whole value of the table. Without it the
    // document says "this failure is handled", which is a description of
    // intention; with it, it says "and here is what fails when it stops being".
    const problems: string[] = []

    for (const cells of rows) {
      const covered = cells[cells.length - 1]
      const cited = [...covered.matchAll(/[\w-]+\.(?:test\.tsx?|spec\.ts)/g)].map((m) => m[0])

      if (cited.length === 0) {
        problems.push(`${cells[0]}: no test named in its "covered by" cell`)
        continue
      }
      for (const name of cited) {
        const candidates = [
          join(ROOT, 'src/tests/unit', name),
          join(ROOT, 'e2e', name),
          join(ROOT, 'src/tests/unit/components', name),
        ]
        if (!candidates.some(existsSync)) {
          problems.push(`${cells[0]}: cites ${name}, which does not exist`)
        }
      }
    }

    expect(problems).toEqual([])
  })
})
