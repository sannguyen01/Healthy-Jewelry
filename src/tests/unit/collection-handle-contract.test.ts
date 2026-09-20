import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLLECTION_HANDLES } from '@/lib/catalog/schema'
import { getAllCollections, getAllProducts } from '@/lib/catalog'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'
import ts from 'typescript'

/**
 * **Every collection a product can belong to must be one the router will serve.**
 *
 * That is the invariant, and it has outlived two different mechanisms for upholding it.
 *
 * ## What it used to be checked against
 *
 * `parseCollection` in `src/lib/shopify/tags.ts` mapped a product's Shopify collection
 * memberships onto one of ours, skipping built-ins like `frontpage`. This file tested that
 * parser at length — the live `arc-band-titanium → [frontpage, rings]` case, casing,
 * whitespace, the fallback and its reason — and then held the set the parser could return
 * against the set the router serves.
 *
 * The parser is gone with the fetcher. A product's collection is now a `z.enum` field in a
 * reviewed JSON record, so "a handle the mapper could invent" is not a thing that can
 * happen: an unknown value fails validation and stops the build.
 *
 * ## Why the file is still here
 *
 * Because the *drift* it was really about is still possible, and it is the expensive kind.
 * `/shop/[collection]` sets `dynamicParams = false`, so a handle outside its
 * `VALID_COLLECTIONS` is a **hard 404 before rendering** — and `product.collection` is what
 * the product page's breadcrumb links to, and what `breadcrumbJsonLd` publishes as
 * structured data. A mismatch is a 404 reached from a link the site renders itself, on a
 * page that looks completely healthy.
 *
 * There are now four declarations of the same set, in four languages of a sort:
 *
 *   1. `COLLECTION_HANDLES` in `src/lib/catalog/schema.ts` — what a record may say;
 *   2. `VALID_COLLECTIONS` in `src/app/shop/[collection]/page.tsx` — what the router serves;
 *   3. `src/content/catalog/collections/*.json` — what has a title and a description;
 *   4. the `collection` field on each of the seventeen products.
 *
 * Nothing in the type system joins 1 to 2, or 3 to either. So they are compared here, in
 * every direction, against real sources rather than against a list written in this file.
 */

const COLLECTION_ROUTE = 'src/app/shop/[collection]/page.tsx'

/**
 * `VALID_COLLECTIONS` as the router actually declares it.
 *
 * Read from source rather than imported: the route module pulls in Next server
 * internals and React components, and a test that has to mock half the framework to
 * read one array is a test that will be deleted. Parsed, not regexed — ADR 007.
 */
function routerCollections(): string[] {
  const path = resolve(__dirname, '../../..', COLLECTION_ROUTE)
  const source = parseSource(path, readFileSync(path, 'utf8'))

  const found: string[] = []
  walk(source, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (!ts.isIdentifier(node.name) || node.name.text !== 'VALID_COLLECTIONS') return
    if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const element of node.initializer.elements) {
        if (ts.isStringLiteral(element)) found.push(element.text)
      }
    }
  })
  return found
}

describe('the collection set is one set, not four', () => {
  it('finds the router declaration at all', () => {
    // Without this, a rename would make every assertion below vacuously true —
    // the `cache-tag-contract` lesson about a guardrail that reads a file by name.
    expect(routerCollections().length).toBeGreaterThan(0)
  })

  it('every handle a record may declare is served by the router', () => {
    expect([...COLLECTION_HANDLES].sort()).toEqual(routerCollections().sort())
  })

  it('every handle the router serves has a collection record to render', () => {
    // `/shop/rings` needs a title and a description, not just permission to exist. A
    // served route with no record renders a heading over nothing.
    expect(getAllCollections().map((c) => c.handle).sort()).toEqual(routerCollections().sort())
  })

  it('every product sits in a collection the router serves', () => {
    // The direction that produces the visible defect: a product whose breadcrumb links
    // to a 404 the site renders itself.
    const served = new Set(routerCollections())
    for (const product of getAllProducts()) {
      expect(
        served.has(product.collection),
        `${product.handle} is in "${product.collection}", which /shop/[collection] does not serve`
      ).toBe(true)
    }
  })

  /**
   * The direction that bites. Adding a sixth collection to the schema without adding it
   * to the router gives it a hard 404, and the failure looks like a routing bug rather
   * than a missing config.
   */
  it('a handle added to the schema but not the router is caught', () => {
    const router = new Set(routerCollections())
    const orphans = [...(COLLECTION_HANDLES as readonly string[]), 'pendants'].filter(
      (h) => !router.has(h)
    )
    expect(orphans).toEqual(['pendants'])
  })

  /**
   * And the reverse: a route serving a handle no record backs. This one is quieter — the
   * page resolves, `getProductsByCollection` returns an empty array, and the visitor gets
   * a shelf with a heading and nothing on it, which reads as a stock problem rather than
   * a configuration one.
   */
  it('a handle added to the router but not the catalogue is caught', () => {
    const recorded = new Set<string>(getAllCollections().map((c) => c.handle))
    const unbacked = [...routerCollections(), 'pendants'].filter((h) => !recorded.has(h))
    expect(unbacked).toEqual(['pendants'])
  })
})

/**
 * **The Shopify built-in exemption, and the join that keeps it from becoming a blind spot
 * again.**
 *
 * `scripts/lib/premise-checks.mjs` exempts `frontpage` — Shopify creates it, nobody puts a
 * product there deliberately, and reporting it every run is how a warning becomes
 * wallpaper. The exemption was originally dangerous because the *mapper* was simultaneously
 * capable of mapping a product into it, so one file waved through what the other acted on.
 *
 * The mapper is gone, and the exemption outlived it. What has to stay true is narrower and
 * still worth asserting: a handle the premise checker waves through must not be one the
 * catalogue schema accepts. If `frontpage` ever became a servable collection, the checker
 * would be silently ignoring the thing it exists to notice.
 *
 * This assertion leaves when `premise-checks.mjs` does — see WS-6. It is kept until then
 * rather than deleted early, because the exemption it guards is still in the file.
 */
describe('the built-in exemption is not a handle the catalogue serves', () => {
  it('matches scripts/lib/premise-checks.mjs', () => {
    const path = resolve(__dirname, '../../../scripts/lib/premise-checks.mjs')
    const source = readFileSync(path, 'utf8')
    const declared = source.match(/SHOPIFY_BUILTIN_COLLECTIONS = new Set\(\[([^\]]*)\]\)/)

    expect(declared).not.toBeNull()
    const handles = [...(declared?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(handles).toEqual(['frontpage'])

    for (const handle of handles) {
      expect(
        (COLLECTION_HANDLES as readonly string[]).includes(handle),
        `"${handle}" is exempted as a Shopify built-in and is also a collection this site ` +
          `serves. One of the two is wrong.`
      ).toBe(false)
    }
  })
})
