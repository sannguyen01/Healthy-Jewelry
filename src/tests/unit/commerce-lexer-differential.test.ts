import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { parseSource } from '../../lib/analysis/tsAstScan'

const { languageOf, linesFromMask, occurrences, parseContract, splitPositions } = await import(
  '../../../scripts/lib/commerce-contract.mjs'
)

/**
 * **Two lexers, one answer — or the build fails.**
 *
 * ## Why this exists
 *
 * The commerce scanner decides whether a token is `code` or `prose`, and a comment is free:
 * a token the lexer misreads as a comment is a finding that silently does not exist. Its
 * first lexer split lines at the first `//` and opened a block comment at the first `/*`,
 * with no idea whether either sat inside a string. A `'e2e/**'` glob turned the next thirty
 * lines of `vitest.config.ts` into prose; 661 lines across 67 files were misread, and one
 * misread was hiding an absolute `graphql.json` finding no register row can excuse. It was
 * documented as a known limit "in the safe direction". It was not.
 *
 * The replacement is a hand-written lexer, and a hand-written recogniser has unknown
 * coverage until something measures it
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)). The
 * scanner cannot use the TypeScript compiler itself — it runs in CI as a dependency-free
 * script — so the compiler is the **second implementation** instead: this file derives every
 * comment range from the compiler's AST, splits each tracked JavaScript and TypeScript file
 * both ways, and fails on any disagreement.
 *
 * ## What is compared, and why both
 *
 * - **Identifier occurrences** — every contract identifier, with the position (`code` or
 *   `prose`) and line each lexer puts it on. This is the gate the scanner's findings depend
 *   on, and a disagreement names `file:line:identifier`.
 * - **Every line's split** — whether or not an identifier sits on it today. A line the two
 *   lexers disagree about is a hidden finding waiting for the first identifier to land on
 *   it; catching it while it is still harmless is the point of running both.
 *
 * ## Why the compiler's comments are collected this way
 *
 * The compiler has no "list every comment" call: comments are trivia attached to tokens.
 * Every comment is leading or trailing trivia of *some* token, so walking every token
 * (`getChildren`, which includes punctuation that `forEachChild` skips) and collecting both
 * ranges gets all of them. JSX text is the exception: `getTrailingCommentRanges` at the end
 * of `<a>` would scan `<a>// not a comment</a>` as if the text were trivia, so ranges that
 * start inside a `JsxText` node are dropped — which is the compiler's own view, since a
 * `JsxText` node is text. A shebang is trivia the compiler skips; the scanner calls it prose,
 * and the oracle is told the same.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const contract = parseContract(readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8'))

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs)$/

type File = { path: string; source: string }
type Occurrence = { id: string; position: string; line: number }
type Scanner = (file: File, c: typeof contract) => Occurrence[]

/** The compiler's parse. `tsAstScan.parseSource` where its script kind is right. */
function compilerParse(filePath: string, source: string): ts.SourceFile {
  if (/\.tsx?$/.test(filePath)) return parseSource(filePath, source)
  // `parseSource` parses everything else as TypeScript. JavaScript files are parsed as
  // JavaScript, which (as the compiler does) admits JSX in `.js`, `.mjs` and `.cjs`.
  const kind = filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, kind)
}

/** 1 for every character the compiler places inside a comment. */
export function compilerProseMask(filePath: string, source: string): Uint8Array {
  const sf = compilerParse(filePath, source)
  const text = sf.text
  const mask = new Uint8Array(text.length)
  const jsxText: [number, number][] = []
  const ranges: ts.CommentRange[] = []

  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end])
      return
    }
    ranges.push(...(ts.getLeadingCommentRanges(text, node.pos) ?? []))
    ranges.push(...(ts.getTrailingCommentRanges(text, node.end) ?? []))
    for (const child of node.getChildren(sf)) visit(child)
  }
  visit(sf)

  const shebang = ts.getShebang(text)
  if (shebang) mask.fill(1, 0, shebang.length)
  for (const r of ranges) {
    if (jsxText.some(([from, to]) => r.pos >= from && r.pos < to)) continue
    mask.fill(1, r.pos, r.end)
  }
  return mask
}

/** `occurrences()`, re-derived from the compiler's comment ranges instead of the scanner's. */
export const compilerOccurrences: Scanner = (file, c) => {
  const { code, prose } = linesFromMask(file.source, compilerProseMask(file.path, file.source))
  const found: Occurrence[] = []
  for (const ident of c.identifiers as { id: string; pattern: RegExp }[]) {
    for (const [position, lines] of [
      ['code', code],
      ['prose', prose],
    ] as const) {
      lines.forEach((l: string, i: number) => {
        if (ident.pattern.test(l)) found.push({ id: ident.id, position, line: i + 1 })
      })
    }
  }
  return found
}

/** Every identifier occurrence the two implementations do not agree on, as `file:line:id`. */
export function identifierDisagreements(file: File, scanner: Scanner = occurrences): string[] {
  const key = (o: Occurrence) => `${o.line}\0${o.id}\0${o.position}`
  const ours = new Set(scanner(file, contract).map(key))
  const theirs = new Set(compilerOccurrences(file, contract).map(key))
  const out: string[] = []
  for (const k of new Set([...ours, ...theirs])) {
    if (ours.has(k) && theirs.has(k)) continue
    const [line, id, position] = k.split('\0')
    out.push(
      `${file.path}:${line}:${id} — the scanner says ${ours.has(k) ? position : `not ${position}`}, ` +
        `the compiler says ${theirs.has(k) ? position : `not ${position}`}`
    )
  }
  return out.sort()
}

/** Every line whose code/prose split differs between the two implementations. */
export function lineDisagreements(file: File): string[] {
  const language = languageOf(file.path)
  const ours = splitPositions(file.source, language)
  const theirs = linesFromMask(file.source, compilerProseMask(file.path, file.source))
  const out: string[] = []
  ours.code.forEach((l: string, i: number) => {
    if (l !== theirs.code[i]) {
      out.push(`${file.path}:${i + 1} — scanner code ${JSON.stringify(l)}, compiler code ${JSON.stringify(theirs.code[i])}`)
    }
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. Identifiers are assembled at runtime: this file is executable-class to the
// scanner, and an identifier literal in its code would need a register row of its own.
const NAME = ['shop', 'ify'].join('')
const ENV = `${NAME.toUpperCase()}_STORE_DOMAIN`
const HOST = `mock.my${NAME}.com`

/**
 * The lexer this replaced, reconstructed so the comparator can be shown to catch it.
 * Line-at-a-time, first `//` or `/*` wins, no idea what a string is.
 */
const naiveScanner: Scanner = (file, c) => {
  let inBlock = false
  const code: string[] = []
  const prose: string[] = []
  for (const line of file.source.split('\n')) {
    let co = ''
    let pr = ''
    for (let j = 0; j < line.length; j += 1) {
      const two = line.slice(j, j + 2)
      if (inBlock) {
        pr += line[j]
        if (two === '*/') {
          pr += '/'
          j += 1
          inBlock = false
        }
      } else if (two === '/*') {
        inBlock = true
        pr += two
        j += 1
      } else if (two === '//') {
        pr += line.slice(j)
        break
      } else {
        co += line[j]
      }
    }
    code.push(co)
    prose.push(pr)
  }
  const found: Occurrence[] = []
  for (const ident of c.identifiers as { id: string; pattern: RegExp }[]) {
    for (const [position, lines] of [
      ['code', code],
      ['prose', prose],
    ] as const) {
      lines.forEach((l, i) => {
        if (ident.pattern.test(l)) found.push({ id: ident.id, position, line: i + 1 })
      })
    }
  }
  return found
}

/** Inputs the naive lexer gets wrong. Each must produce a disagreement against it. */
const TRICKY: File[] = [
  { path: 'fx/slash-slash-in-string.ts', source: `const u = 'https://${HOST}'\n` },
  { path: 'fx/block-open-in-string.ts', source: `const g = 'e2e/**'\nconst d = process.env.${ENV}\n` },
  { path: 'fx/template-with-block-open.ts', source: `const t = \`a\${'/*'}b\`\nconst d = '${NAME}'\n` },
  { path: 'fx/regex-class-with-block-open.ts', source: `const r = /[/*]/\nconst d = '${NAME}'\n` },
  { path: 'fx/jsx-text-url.tsx', source: `const a = <a>https://${HOST}</a>\n` },
]

/** Inputs both old and new agree on, which the scanner must still get right. */
const AGREED: File[] = [
  { path: 'fx/jsx-comment.tsx', source: `const a = <p>{/* ${NAME} */}</p>\n` },
  { path: 'fx/regex-escaped-slashes.ts', source: `const r = /\\/\\*/ // ${NAME}\nconst d = '${NAME}'\n` },
  { path: 'fx/comment-after-string.ts', source: `const u = 'x' // ${NAME}\n` },
  { path: 'fx/shebang.mjs', source: `#!/usr/bin/env node\nconst d = process.env.${ENV}\n` },
  { path: 'fx/comment-in-template-expression.ts', source: `const v = \`x\${ /* ${NAME} */ y }\`\n` },
]

describe('the comparator can fail', () => {
  /*
   * A differential test that has never disagreed with anything is a claim about a
   * comparator nobody has watched work ([ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).
   * So it is pointed at the lexer it replaced, on the inputs that lexer got wrong, and must
   * name each disagreement by file, line and identifier.
   */
  it.each(TRICKY.map((f) => [f.path, f] as const))('names the naive lexer\'s misread of %s', (_, file) => {
    const found = identifierDisagreements(file, naiveScanner)
    expect(found.length, 'the comparator saw no disagreement on an input built to cause one').toBeGreaterThan(0)
    expect(found[0]).toMatch(new RegExp(`^${file.path.replace(/[.*]/g, '\\$&')}:\\d+:[a-z-]+ — `))
  })

  it.each([...TRICKY, ...AGREED].map((f) => [f.path, f] as const))(
    'the scanner and the compiler agree on %s',
    (_, file) => {
      expect(identifierDisagreements(file)).toEqual([])
      expect(lineDisagreements(file)).toEqual([])
    }
  )

  it('each fixture really does carry an identifier, so agreement is not vacuous', () => {
    for (const file of [...TRICKY, ...AGREED]) {
      expect(compilerOccurrences(file, contract).length, file.path).toBeGreaterThan(0)
    }
  })
})

describe('every tracked script, lexed twice', () => {
  const files: File[] = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter((p) => SCRIPT.test(p))
    .map((p) => ({ path: p, source: readFileSync(path.join(ROOT, p), 'utf8') }))

  it('compares a real tree rather than an empty one', () => {
    // 245 files on 2026-09-25. A floor, not an equality: this counts the *input*, which grows
    // and shrinks with ordinary work, and exists only to catch `git ls-files` returning
    // nothing and every assertion below passing over an empty list.
    expect(files.length).toBeGreaterThan(200)
    expect(files.filter((f) => f.path.endsWith('.tsx')).length, 'no .tsx files — JSX is unexercised').toBeGreaterThan(20)
    expect(files.filter((f) => f.path.endsWith('.mjs')).length, 'no .mjs files').toBeGreaterThan(10)
  })

  it('agrees on the position of every contract identifier in every file', () => {
    const found = files.flatMap((f) => identifierDisagreements(f))
    expect(
      found,
      'the scanner and the TypeScript compiler disagree about whether these identifiers are ' +
        'code or comment. Where the scanner says prose and the compiler says code, a finding is ' +
        'being hidden. Fix the lexer in scripts/lib/commerce-contract.mjs, never the file.'
    ).toEqual([])
  })

  it('agrees on the split of every line, identifier or not', () => {
    const found = files.flatMap((f) => lineDisagreements(f))
    expect(
      found.slice(0, 20),
      `${found.length} line(s) split differently. None carries an identifier today — the ` +
        `check above would say so — but each is a finding that will be hidden or invented the ` +
        `day one lands there.`
    ).toEqual([])
  })
})
