import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource, callsTo } from '@/lib/analysis/tsAstScan'

/**
 * The homepage's Shopify fetch count must not scale with the number of collections.
 *
 * It used to. Five `getProductsByCollection` calls ran inside a `Promise.all` to read five
 * `svgType` values — one full collection query per collection, so a sixth collection meant
 * a ninth query on the page. One `getProducts()` returns the whole catalogue with
 * `collection` on each product, which makes the tiles a grouping rather than five round
 * trips.
 *
 * **What this is not.** It is not a per-request cost. The homepage is statically
 * prerendered with `revalidate: 3600`, so these run at build and hourly revalidation; and
 * server components call the Storefront API directly rather than through the rate-limited
 * `/api/shopify` proxy, whose only caller is `src/store/cart.tsx`. The guardrail exists
 * because the *pattern* silently gets more expensive as the catalogue grows, not because
 * there is a live ceiling to hit.
 *
 * Read through the AST rather than by matching text, so a call reformatted across lines or
 * written inside a comment cannot change the answer. See docs/adr/007.
 */

const HOMEPAGE = join(process.cwd(), 'src/app/page.tsx')
const source = readFileSync(HOMEPAGE, 'utf-8')
const ast = parseSource(HOMEPAGE, source)

describe('homepage Shopify fetch budget', () => {
  it('parses the homepage', () => {
    // A parse that silently produced nothing would make every assertion below vacuously
    // pass — the same failure `secret-exposure.test.ts` guards by asserting non-emptiness.
    expect(source.length).toBeGreaterThan(0)
    expect(callsTo(ast, 'Promise.all').length + callsTo(ast, 'getProducts').length).toBeGreaterThan(0)
  })

  it('issues at most one per-collection query', () => {
    // One call for the "TITANIUM" strip is legitimate and deliberate. Five are the tiles
    // regressing to a query each.
    const perCollection = callsTo(ast, 'getProductsByCollection')

    expect(
      perCollection.length,
      `getProductsByCollection is called ${perCollection.length} times on the homepage.\n` +
        'More than one means the collection tiles are querying per collection again —\n' +
        'derive them from a single getProducts() instead, so the count stops growing\n' +
        'with the catalogue. Arguments seen: ' +
        JSON.stringify(perCollection),
    ).toBeLessThanOrEqual(1)
  })

  it('fetches the catalogue once for the tiles', () => {
    expect(callsTo(ast, 'getProducts').length).toBe(1)
  })

  it('does not map collections onto an async fetch', () => {
    // The specific shape that regressed: `hjCollections.map(async ... await getProducts...)`.
    // Catching the shape rather than only the count keeps a future variant from sneaking
    // in under a different helper name.
    const mapsToAwaitedFetch = /hjCollections\s*\.\s*map\s*\(\s*async/.test(source)
    expect(mapsToAwaitedFetch, 'collections are mapped to an async fetch again').toBe(false)
  })

  it('keeps the total Shopify fetch count at four', () => {
    // bestsellers + newArrivals + necklaces strip + whole catalogue.
    const total =
      callsTo(ast, 'getBestsellers').length +
      callsTo(ast, 'getNewArrivals').length +
      callsTo(ast, 'getProductsByCollection').length +
      callsTo(ast, 'getProducts').length

    expect(total, 'the homepage should issue exactly 4 Shopify fetches').toBe(4)
  })
})
