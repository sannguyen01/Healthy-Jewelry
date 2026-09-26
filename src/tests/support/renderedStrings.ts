import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'
import { CLAIM_IDS } from '@/lib/catalog/claims-schema'

/**
 * **The words a source file can put on a page — and only those.**
 *
 * Shared by `claim-lexicon.test.tsx` and `legal-review-inventory.test.ts`, which ask two
 * different questions of the same text: does it make a claim, and does it state a
 * commercial term.
 *
 * Parsed, not regexed ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 * Comments are never nodes, so the dense comments across this codebase that *quote* a
 * retired claim in order to explain its removal are invisible by construction rather than
 * by an exemption — a scan that counted them would make the record of the fix the offence.
 * And code is never a string, so `return (` in a component is not a returns policy.
 *
 * What counts as text:
 *
 * - string literals and no-substitution templates;
 * - the literal parts of a template expression (`${…}` holes are code);
 * - JSX text.
 *
 * A literal that is exactly a claim id (`'mri-safe'`) is a **reference** to a registry
 * record, not wording, and is skipped: `hj-data.ts` names its proposed claims that way.
 */

const ROOT = join(__dirname, '../../..')
const CLAIM_ID_SET = new Set<string>(CLAIM_IDS)

export function repoRoot(): string {
  return ROOT
}

/** The handful of named entities this codebase writes in JSX text, decoded as a browser would. */
const ENTITIES: Record<string, string> = {
  '&ldquo;': '\u201c',
  '&rdquo;': '\u201d',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
  '&nbsp;': ' ',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
}

function decodeEntities(text: string): string {
  return text.replace(/&[a-z]+;/g, (entity) => ENTITIES[entity] ?? entity)
}

/**
 * Every text-bearing string in a TS/TSX source, in source order.
 *
 * Module specifiers are skipped by position (the only string an import or export
 * declaration holds is its specifier), claim-id literals by value.
 */
export function sourceStrings(path: string, source: string): string[] {
  const found: string[] = []
  const specifiers = new Set<ts.Node>()
  walk(parseSource(path, source), (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifiers.add(node.moduleSpecifier)
      return
    }
    if (specifiers.has(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (CLAIM_ID_SET.has(node.text)) return
      found.push(node.text)
    } else if (ts.isTemplateExpression(node)) {
      found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text))
    } else if (ts.isJsxText(node)) {
      const text = decodeEntities(node.text).replace(/\s+/g, ' ').trim()
      if (text) found.push(text)
    }
  })
  return found.filter((s) => s.trim().length > 0)
}

/** Every string value in a JSON document, at any depth, with the key path that holds it. */
export function jsonStrings(value: unknown, path: string[] = []): Array<{ path: string[]; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonStrings(v, [...path, String(i)]))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => jsonStrings(v, [...path, k]))
  }
  return []
}

/**
 * Files under `dirs`, relative to the repository root, with the given extensions.
 * Sorted, so a failure lists files in a stable order.
 */
export function filesUnder(dirs: readonly string[], extensions: RegExp): string[] {
  const found: string[] = []
  const visit = (rel: string) => {
    const full = join(ROOT, rel)
    if (statSync(full).isDirectory()) {
      for (const entry of readdirSync(full)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        visit(join(rel, entry))
      }
    } else if (extensions.test(rel)) {
      found.push(relative(ROOT, full))
    }
  }
  dirs.forEach(visit)
  return found.sort()
}

export function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}
