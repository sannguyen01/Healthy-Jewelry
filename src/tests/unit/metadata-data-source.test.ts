import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

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

const APP_DIR = join(process.cwd(), 'src/app')

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

/** Named imports pulled from `@/lib/data/hj-data` in one file, if any. */
function hjDataImports(source: string): string[] {
  const match = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/data\/hj-data['"]/)
  if (!match) return []
  return match[1]
    .split(',')
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean)
}

describe('catalogue data source', () => {
  const routeFiles = walk(APP_DIR)

  it('finds route files to check', () => {
    // A broken walk would make every assertion below vacuously pass — the same
    // "covered-looking and worthless" failure secret-exposure.test.ts guards
    // against by asserting its import graph is non-empty first.
    expect(routeFiles.length).toBeGreaterThan(10)
  })

  it('no route imports a product lookup directly from hj-data', () => {
    const offenders: string[] = []

    for (const file of routeFiles) {
      const imported = hjDataImports(readFileSync(file, 'utf-8'))
      const catalogue = imported.filter((name) => CATALOGUE_EXPORTS.includes(name))
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
})
