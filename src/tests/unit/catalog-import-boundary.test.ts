import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseSource, moduleSpecifiers } from '@/lib/analysis/tsAstScan'

/**
 * **`src/content/catalog/**` has exactly one reader, and this is what makes that true.**
 *
 * [ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md) inverts ADR 004. The
 * static catalogue stops being a fallback behind `@/lib/shopify` and becomes the source;
 * `src/lib/catalog/**` becomes the only layer allowed to read it. That rule is worth
 * exactly as much as its enforcement, and the repository has a documented opinion about
 * what enforcement means here.
 *
 * ## Why the compiler and not a grep
 *
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) is blunt that
 * a text scan has unknown coverage. The three cases that decide it:
 *
 * | written as | a grep for `content/catalog` says | the truth |
 * |---|---|---|
 * | `// import x from '@/content/catalog/…'` | violation | a comment — no import exists |
 * | `` const p = `@/content/catalog/${h}.json` `` | violation | a string, not a module edge |
 * | `await import('@/content/catalog/a.json')` | violation, if you thought to match it | a real one |
 *
 * The first two are false alarms that get the check muted; the third is the one that
 * matters and is the easiest to miss, because moving an import inside an `await import()`
 * reads as a lazy-loading tweak rather than as breaching a wall. `moduleSpecifiers` walks
 * the AST, so a comment is not a node and a template literal is not an import.
 *
 * ## What counts as inside
 *
 * `src/lib/catalog/manifest.ts` imports all 22 JSON files and is *supposed* to. The rule is
 * about the directory, not the file: anything under `src/lib/catalog/` may read content,
 * nothing else may.
 */

const ROOT = resolve(__dirname, '../../..')
const READER_DIR = 'src/lib/catalog'
const CONTENT_DIR = 'src/content/catalog'

/** Every TypeScript source file in the repository, excluding build output and deps. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const rel = join(dir, entry)
    if (statSync(join(ROOT, rel)).isDirectory()) {
      sourceFiles(rel, found)
    } else if (/\.tsx?$/.test(entry)) {
      found.push(rel)
    }
  }
  return found
}

const ALL_SOURCES = [...sourceFiles('src'), ...sourceFiles('e2e')].sort()

/** Does this specifier reach into the content directory, however it is spelled? */
function reachesContent(specifier: string, fromFile: string): boolean {
  if (specifier.startsWith('@/content/catalog')) return true
  if (!specifier.startsWith('.')) return false
  // A relative specifier has to be resolved against its own file before it means anything:
  // `../../content/catalog/x.json` and `@/content/catalog/x.json` are the same edge.
  const resolved = relative(ROOT, resolve(ROOT, fromFile, '..', specifier))
  return resolved.startsWith(CONTENT_DIR)
}

function contentImportsIn(file: string): string[] {
  const source = parseSource(file, readFileSync(join(ROOT, file), 'utf-8'))
  return moduleSpecifiers(source).filter((s) => reachesContent(s, file))
}

describe('the sweep has something to sweep', () => {
  it('finds the repository’s TypeScript sources', () => {
    // A walk that silently returned nothing would make every assertion below trivially
    // true, which is the failure this repository has recorded seven times.
    expect(ALL_SOURCES.length).toBeGreaterThan(100)
  })

  it('the reader directory exists and is the one named in the rule', () => {
    expect(ALL_SOURCES.some((f) => f.startsWith(`${READER_DIR}/`))).toBe(true)
  })

  it('the content directory holds catalogue records', () => {
    const products = readdirSync(join(ROOT, CONTENT_DIR, 'products'))
    expect(products.filter((f) => f.endsWith('.json')).length).toBeGreaterThan(0)
  })
})

describe('only the reader may import catalogue content', () => {
  const outsiders = ALL_SOURCES.filter((f) => !f.startsWith(`${READER_DIR}/`))

  it('at least one module inside the reader does import content', () => {
    // Otherwise the rule below is satisfied by a boundary around an empty room: if nothing
    // reads the content at all, "nothing outside reads it" is true and meaningless.
    const insiders = ALL_SOURCES.filter((f) => f.startsWith(`${READER_DIR}/`))
    expect(insiders.some((f) => contentImportsIn(f).length > 0)).toBe(true)
  })

  it.each(outsiders)('%s does not reach past @/lib/catalog', (file) => {
    const violations = contentImportsIn(file)
    expect(
      violations,
      `${file} imports catalogue content directly:\n\n` +
        `${violations.map((v) => `  ${v}`).join('\n')}\n\n` +
        `Only ${READER_DIR}/** may read ${CONTENT_DIR}/**. Import the accessor you need ` +
        `from '@/lib/catalog' instead — getAllProducts, getProductByHandle, ` +
        `getProductsByCollection, getBestsellers, getNewArrivals, getAllCollections.\n\n` +
        `Reading a raw record skips Zod validation, so a malformed product renders a page ` +
        `with a hole in it instead of failing the build. ADR 004 lists five defects that ` +
        `were all one module reading product data from somewhere its neighbours did not.`
    ).toEqual([])
  })
})

describe('the boundary detects the forms a grep would miss', () => {
  // Driven through the real `moduleSpecifiers`, against sources written here rather than
  // read from disk — the point is coverage of *syntax*, and the repository contains only
  // the shapes somebody happened to write. ADR 028: a fixture is the input you thought of,
  // so these are the inputs deliberately thought of.
  const detect = (source: string): string[] =>
    moduleSpecifiers(parseSource('src/app/probe.ts', source)).filter((s) =>
      reachesContent(s, 'src/app/probe.ts')
    )

  it('catches a static import', () => {
    expect(detect(`import p from '@/content/catalog/products/a.json'`)).toHaveLength(1)
  })

  it('catches a relative import that climbs out of its directory', () => {
    const source = `import p from '../../content/catalog/products/a.json'`
    expect(
      moduleSpecifiers(parseSource('src/app/shop/page.tsx', source)).filter((s) =>
        reachesContent(s, 'src/app/shop/page.tsx')
      )
    ).toHaveLength(1)
  })

  it('catches a dynamic import, wherever it hides', () => {
    // The refactor that looks like lazy-loading and is actually a breach.
    expect(
      detect(`export async function f() { return (await import('@/content/catalog/products/a.json')).default }`)
    ).toHaveLength(1)
  })

  it('catches a re-export', () => {
    expect(detect(`export { default } from '@/content/catalog/products/a.json'`)).toHaveLength(1)
  })

  it('catches require()', () => {
    expect(detect(`const p = require('@/content/catalog/products/a.json')`)).toHaveLength(1)
  })

  it('does not fire on a comment', () => {
    expect(detect(`// import p from '@/content/catalog/products/a.json'\nexport const x = 1`)).toEqual([])
  })

  it('does not fire on a string that merely looks like a path', () => {
    expect(detect("export const dir = '@/content/catalog/products'")).toEqual([])
  })

  it('does not fire on a template literal built at runtime', () => {
    expect(
      detect('export const p = (h: string) => `@/content/catalog/products/${h}.json`')
    ).toEqual([])
  })

  it('leaves imports of the reader itself alone', () => {
    expect(detect(`import { getAllProducts } from '@/lib/catalog'`)).toEqual([])
  })
})
