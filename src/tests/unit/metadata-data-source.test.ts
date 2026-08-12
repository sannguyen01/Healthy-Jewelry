import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'

/**
 * The catalogue has exactly one entry point: `@/lib/shopify`.
 *
 * `@/lib/data/hj-data.ts` is the **fallback**, and it is reachable only from
 * behind that entry point — `getProduct()` and friends already return static
 * data when Shopify is unconfigured, unreachable, or empty. A route that
 * imports a product lookup from `hj-data` directly is not "using the fallback";
 * it is bypassing Shopify permanently, on every request, in production.
 *
 * That is not hypothetical. `products/[handle]/page.tsx` read Shopify in its
 * body and `hj-data` in its `generateMetadata`, and the two catalogues are
 * nearly disjoint — so 20 of the 22 live products served
 * `title: 'Product Not Found'` from a page that rendered perfectly. The OG
 * image had the same split, and `/search` searched the static catalogue
 * exclusively, so site search could not find a single real product.
 *
 * None of it was visible to the rest of the suite: every unit and E2E test runs
 * without Shopify credentials, which is precisely the condition under which
 * both sources return the same thing.
 *
 * Collections and materials are deliberately *not* covered. `hjCollections` and
 * `hjMaterials` are site structure — five fixed collection routes, three
 * material descriptions — not catalogue data, and importing them is correct.
 */

const SRC_DIR = join(process.cwd(), 'src')
const APP_DIR = join(SRC_DIR, 'app')

/**
 * Directories exempt from the rule, and why each one is:
 *
 *   - `lib/data`     — the fallback catalogue itself.
 *   - `lib/shopify`  — the one legitimate consumer. It imports the static
 *                      catalogue *in order to* fall back to it, which is the
 *                      door every other surface is required to go through.
 *   - `tests`        — fixtures and assertions naturally name both sources.
 */
const EXEMPT_DIRS = [join(SRC_DIR, 'lib/data'), join(SRC_DIR, 'lib/shopify'), join(SRC_DIR, 'tests')]

function isExempt(file: string): boolean {
  return EXEMPT_DIRS.some((dir) => file.startsWith(dir))
}

/**
 * Product-catalogue lookups. Importing any of these from `hj-data` inside a
 * route means that surface can never see a Shopify product.
 */
const CATALOGUE_EXPORTS = [
  'getAllProducts',
  'getProductByHandle',
  'getProductsByCollection',
  'getBestsellers',
  'getNewArrivals',
  'hjProducts',
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.tsx?$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

const HJ_DATA = '@/lib/data/hj-data'

/**
 * Every binding a file takes from `hj-data`, resolved through the TypeScript AST.
 *
 * This replaced a regex that was measurably incomplete. It handled named and aliased
 * imports correctly, but `import * as hj from '@/lib/data/hj-data'` was invisible to it,
 * and a file with two separate import statements from the module only had the first one
 * read — it used `.match`, not `.matchAll`. Either was enough to walk a catalogue read
 * straight past the guardrail. See docs/adr/007.
 */
function hjDataImports(filePath: string, source: string): string[] {
  return importsFrom(parseSource(filePath, source), HJ_DATA).map((b) =>
    // A namespace import reaches every export, so it is treated as importing all of them.
    b.namespace ? '*' : b.imported,
  )
}

/** A namespace import can reach any catalogue export, so it counts as importing all. */
function catalogueBindings(imported: string[]): string[] {
  if (imported.includes('*')) return [...CATALOGUE_EXPORTS]
  return imported.filter((name) => CATALOGUE_EXPORTS.includes(name))
}

describe('catalogue data source', () => {
  // Every surface, not just routes. The first version of this test walked only
  // `src/app`, which is why it did not see `components/home/CollectionGrid.tsx`
  // reading `getProductsByCollection` out of the static catalogue — the exact
  // bug it was written to prevent, sitting one directory outside its reach.
  const sourceFiles = walk(SRC_DIR).filter((f) => !isExempt(f))
  const routeFiles = walk(APP_DIR)

  it('finds source files to check', () => {
    // A broken walk would make every assertion below vacuously pass — the same
    // "covered-looking and worthless" failure secret-exposure.test.ts guards
    // against by asserting its import graph is non-empty first.
    expect(routeFiles.length).toBeGreaterThan(10)
    expect(sourceFiles.length).toBeGreaterThan(routeFiles.length)
  })

  it('no module outside lib/shopify imports a product lookup from hj-data', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      const imported = hjDataImports(file, readFileSync(file, 'utf-8'))
      const catalogue = catalogueBindings(imported)
      if (catalogue.length > 0) {
        offenders.push(`${relative(process.cwd(), file)} → ${catalogue.join(', ')}`)
      }
    }

    expect(
      offenders,
      'These routes bypass Shopify and read the static fallback directly.\n' +
        'Use `@/lib/shopify` instead — it already falls back to hj-data when\n' +
        'Shopify is unconfigured, unreachable, or returns nothing:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('the product page reads Shopify in metadata and body alike', () => {
    const source = readFileSync(join(APP_DIR, 'products/[handle]/page.tsx'), 'utf-8')

    // The specific split that shipped: one source for the page, another for its
    // metadata. Asserting on generateMetadata by name because that is the
    // function whose output became 'Product Not Found'.
    const metadataFn = source.slice(source.indexOf('export async function generateMetadata'))
    expect(metadataFn).toContain('getProduct(')
    expect(metadataFn).not.toContain('getProductByHandle(')
  })

  it('generateStaticParams prerenders the Shopify catalogue, not the fallback', () => {
    const source = readFileSync(join(APP_DIR, 'products/[handle]/page.tsx'), 'utf-8')
    const fn = source.slice(source.indexOf('generateStaticParams'))
    const body = fn.slice(0, fn.indexOf('\n}'))

    // Prerendering static handles builds pages for products that do not exist
    // in Shopify, and skips every product that does.
    expect(body).not.toContain('getAllProducts(')
  })

  describe('import forms the previous regex could not see', () => {
    // These are the reason this guardrail parses instead of matching. Each one is a real
    // way to read the static catalogue while the old check reported nothing.
    const NAIVE = /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/data\/hj-data['"]/

    it('sees a namespace import, which the regex missed entirely', () => {
      const source = `import * as hj from '@/lib/data/hj-data'\nexport const x = hj.getAllProducts()`

      expect(NAIVE.test(source), 'the old regex should miss this').toBe(false)
      expect(catalogueBindings(hjDataImports('x.ts', source))).toContain('getAllProducts')
    })

    it('sees a second import statement from the same module', () => {
      // `.match` returns only the first occurrence, so the catalogue read on line two was
      // invisible while the innocuous line one satisfied the check.
      const source = [
        `import { hjCollections } from '@/lib/data/hj-data'`,
        `import { getAllProducts } from '@/lib/data/hj-data'`,
      ].join('\n')

      const firstOnly = source.match(NAIVE)?.[1] ?? ''
      expect(firstOnly).not.toContain('getAllProducts')
      expect(catalogueBindings(hjDataImports('x.ts', source))).toContain('getAllProducts')
    })

    it('sees a re-export, which never looked like an import at all', () => {
      const source = `export { getProductByHandle } from '@/lib/data/hj-data'`

      expect(NAIVE.test(source)).toBe(false)
      expect(catalogueBindings(hjDataImports('x.ts', source))).toContain('getProductByHandle')
    })

    it('resolves an alias to the name the module exports', () => {
      const source = `import { getAllProducts as everything } from '@/lib/data/hj-data'`
      expect(catalogueBindings(hjDataImports('x.ts', source))).toEqual(['getAllProducts'])
    })

    it('ignores a catalogue import written inside a comment', () => {
      // The parser never emits comments as nodes, so this is impossible rather than
      // filtered — the property the regex could only approximate.
      const source = `// import { getAllProducts } from '@/lib/data/hj-data'\nexport const x = 1`

      expect(NAIVE.test(source), 'the old regex saw this comment as an import').toBe(true)
      expect(catalogueBindings(hjDataImports('x.ts', source))).toEqual([])
    })

    it('does not flag a legitimate site-structure import', () => {
      const source = `import { hjCollections, hjMaterials } from '@/lib/data/hj-data'`
      expect(catalogueBindings(hjDataImports('x.ts', source))).toEqual([])
    })
  })
})
