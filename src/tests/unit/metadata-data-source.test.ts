import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'

/**
 * **A page and its metadata must read the same catalogue.**
 *
 * ## The defect, which is not about which catalogue won
 *
 * `products/[handle]/page.tsx` read Shopify in its body and `hj-data` in its
 * `generateMetadata`, and the two catalogues were nearly disjoint — so 20 of the 22 live
 * products served `title: 'Product Not Found'` from a page that rendered perfectly. That
 * string was the browser tab, the search result and the shared link. The OG image route had
 * the same split, and `/search` searched the static catalogue exclusively, so site search
 * could not find a single real product.
 *
 * None of it was visible to the rest of the suite: every unit and E2E test runs without
 * Shopify credentials, which is precisely the condition under which both sources returned
 * the same thing.
 *
 * ## Why the rule survives the decommission, restated
 *
 * This file used to say *"the catalogue has exactly one entry point: `@/lib/shopify`"*, and
 * `hj-data` was the fallback reachable only from behind it. ADR 034 inverts that: the
 * content directory is the source and `@/lib/catalog` is the only reader. `hj-data.ts` no
 * longer exports a product lookup at all, so the *specific* bypass this file was written to
 * catch is now a compile error.
 *
 * What is not a compile error, and is the invariant worth keeping, is **four surfaces of
 * one product resolving a handle four ways**. The page body, `generateMetadata`,
 * `generateStaticParams` and `opengraph-image.tsx` are four separate functions, two of them
 * served on separate requests, and nothing in the type system makes them agree about where
 * a product comes from. That is exactly the shape that shipped "Product Not Found" as a
 * page title, and it would ship it again the day any one of them acquires a second source.
 *
 * `catalog-import-boundary.test.ts` owns the wall around `src/content/catalog/**`. This
 * file owns the narrower question of whether the product route's four surfaces agree.
 *
 * Collections and materials are deliberately *not* covered. `hjMaterials` is site
 * content — three material descriptions — not catalogue data, and importing it is correct.
 */

const SRC_DIR = join(process.cwd(), 'src')
const APP_DIR = join(SRC_DIR, 'app')
const PRODUCT_ROUTE_DIR = join(APP_DIR, 'products/[handle]')

/**
 * Directories exempt from the `hj-data` rule, and why each one is:
 *
 *   - `lib/data`  — the module itself.
 *   - `tests`     — fixtures and assertions naturally name both sources.
 *
 * `lib/shopify` used to be the third and the most important: it was the one legitimate
 * consumer, importing the static catalogue *in order to* fall back to it. Its read path is
 * gone, so the exemption is too.
 */
const EXEMPT_DIRS = [join(SRC_DIR, 'lib/data'), join(SRC_DIR, 'tests')]

function isExempt(file: string): boolean {
  return EXEMPT_DIRS.some((dir) => file.startsWith(dir))
}

/**
 * Product-catalogue lookups. These names no longer exist in `hj-data` — `hj-data.test.ts`
 * asserts its export surface is exactly `hjMaterials` — so importing one is a type error
 * today.
 *
 * The list stays because a type error is a property of the current source, not a rule. A
 * future edit that reintroduces `getAllProducts` there would compile, and nothing else
 * would object: ADR 004's five defects were all a module reading product data from
 * somewhere its neighbours did not, and this is the check that names that directly.
 */
const CATALOGUE_EXPORTS = [
  'getAllProducts',
  'getProductByHandle',
  'getProductsByCollection',
  'getBestsellers',
  'getNewArrivals',
  'hjProducts',
  'hjCollections',
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
const CATALOG = '@/lib/catalog'

/**
 * Every binding a file takes from a module, resolved through the TypeScript AST.
 *
 * This replaced a regex that was measurably incomplete. It handled named and aliased
 * imports correctly, but `import * as hj from '@/lib/data/hj-data'` was invisible to it,
 * and a file with two separate import statements from the module only had the first one
 * read — it used `.match`, not `.matchAll`. Either was enough to walk a catalogue read
 * straight past the guardrail. See docs/adr/007.
 */
function importsOf(filePath: string, source: string, from: string): string[] {
  return importsFrom(parseSource(filePath, source), from).map((b) =>
    // A namespace import reaches every export, so it is treated as importing all of them.
    b.namespace ? '*' : b.imported
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

  it('no module imports a product lookup from hj-data', () => {
    const offenders: string[] = []

    for (const file of sourceFiles) {
      const catalogue = catalogueBindings(importsOf(file, readFileSync(file, 'utf-8'), HJ_DATA))
      if (catalogue.length > 0) {
        offenders.push(`${relative(process.cwd(), file)} → ${catalogue.join(', ')}`)
      }
    }

    expect(
      offenders,
      'These modules read product data from hj-data.ts. There is one runtime access\n' +
        'layer and it is `@/lib/catalog` — see ADR 034, and ADR 004 for the five defects\n' +
        'that came of having two:\n  ' +
        offenders.join('\n  ')
    ).toEqual([])
  })
})

/**
 * The four surfaces of one product, held to one source.
 *
 * Read by import rather than by call site: a function can resolve a handle through a local
 * helper, and what decides whether two surfaces can disagree is which module the *file*
 * takes its product data from.
 */
describe('the product route resolves a handle one way', () => {
  const SURFACES = ['page.tsx', 'opengraph-image.tsx']

  it.each(SURFACES)('%s imports its product data from @/lib/catalog', (file) => {
    const path = join(PRODUCT_ROUTE_DIR, file)
    const bindings = importsOf(path, readFileSync(path, 'utf-8'), CATALOG)
    expect(
      bindings.length,
      `${file} takes nothing from @/lib/catalog. Either it has acquired a second data ` +
        `source, or the reader moved and this test is pointed at the wrong module.`
    ).toBeGreaterThan(0)
  })

  it.each(SURFACES)('%s takes product data from nowhere else', (file) => {
    const path = join(PRODUCT_ROUTE_DIR, file)
    expect(catalogueBindings(importsOf(path, readFileSync(path, 'utf-8'), HJ_DATA))).toEqual([])
  })

  it('generateMetadata and the page body call the same accessor', () => {
    const source = readFileSync(join(PRODUCT_ROUTE_DIR, 'page.tsx'), 'utf-8')

    // The specific split that shipped: one source for the page, another for its metadata.
    // Asserting on generateMetadata by name because that is the function whose output
    // became 'Product Not Found'.
    const metadataFn = source.slice(source.indexOf('export async function generateMetadata'))
    const bodyFn = source.slice(source.indexOf('export default async function ProductPage'))

    expect(metadataFn).toContain('getProductByHandle(')
    expect(bodyFn).toContain('getProductByHandle(')
  })

  it('generateStaticParams enumerates the catalogue the page will read', () => {
    const source = readFileSync(join(PRODUCT_ROUTE_DIR, 'page.tsx'), 'utf-8')
    const fn = source.slice(source.indexOf('export function generateStaticParams'))
    const body = fn.slice(0, fn.indexOf('\n}'))

    // With `dynamicParams = false` this list *is* the set of pages that exist. A source
    // that disagreed with the page body would not render the wrong title any more — it
    // would 404 a product the site links to.
    expect(body).toContain('getAllProducts(')
  })
})

describe('import forms the previous regex could not see', () => {
  // These are the reason this guardrail parses instead of matching. Each one is a real
  // way to read a second catalogue while the old check reported nothing.
  const NAIVE = /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/data\/hj-data['"]/

  it('sees a namespace import, which the regex missed entirely', () => {
    const source = `import * as hj from '@/lib/data/hj-data'\nexport const x = hj.getAllProducts()`

    expect(NAIVE.test(source), 'the old regex should miss this').toBe(false)
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toContain('getAllProducts')
  })

  it('sees a second import statement from the same module', () => {
    // `.match` returns only the first occurrence, so the catalogue read on line two was
    // invisible while the innocuous line one satisfied the check.
    const source = [
      `import { hjMaterials } from '@/lib/data/hj-data'`,
      `import { getAllProducts } from '@/lib/data/hj-data'`,
    ].join('\n')

    const firstOnly = source.match(NAIVE)?.[1] ?? ''
    expect(firstOnly).not.toContain('getAllProducts')
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toContain('getAllProducts')
  })

  it('sees a re-export, which never looked like an import at all', () => {
    const source = `export { getProductByHandle } from '@/lib/data/hj-data'`

    expect(NAIVE.test(source)).toBe(false)
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toContain('getProductByHandle')
  })

  it('resolves an alias to the name the module exports', () => {
    const source = `import { getAllProducts as everything } from '@/lib/data/hj-data'`
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toEqual(['getAllProducts'])
  })

  it('ignores a catalogue import written inside a comment', () => {
    // The parser never emits comments as nodes, so this is impossible rather than
    // filtered — the property the regex could only approximate.
    const source = `// import { getAllProducts } from '@/lib/data/hj-data'\nexport const x = 1`

    expect(NAIVE.test(source), 'the old regex saw this comment as an import').toBe(true)
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toEqual([])
  })

  it('does not flag a legitimate site-content import', () => {
    const source = `import { hjMaterials } from '@/lib/data/hj-data'`
    expect(catalogueBindings(importsOf('x.ts', source, HJ_DATA))).toEqual([])
  })
})
