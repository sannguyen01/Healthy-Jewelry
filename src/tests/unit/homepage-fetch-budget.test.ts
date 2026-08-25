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
    expect(callsTo(ast, 'Promise.all').length + callsTo(ast, 'getProducts').length).toBeGreaterThan(
      0
    )
  })

  it('issues at most one per-collection query', () => {
    // Now zero, and the ceiling stays at one rather than dropping to it. The "TITANIUM"
    // strip used to spend the one allowed call on `getProductsByCollection('necklaces')`,
    // which is where its contents stopped matching its label; it is derived from the
    // catalogue now. Five is the tiles regressing to a query each, which is the shape this
    // guards — pinning zero would forbid a future strip that legitimately needs one.
    const perCollection = callsTo(ast, 'getProductsByCollection')

    expect(
      perCollection.length,
      `getProductsByCollection is called ${perCollection.length} times on the homepage.\n` +
        'More than one means the collection tiles are querying per collection again —\n' +
        'derive them from a single getProducts() instead, so the count stops growing\n' +
        'with the catalogue. Arguments seen: ' +
        JSON.stringify(perCollection)
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

  it('keeps the total Shopify fetch count at three', () => {
    // bestsellers + newArrivals + whole catalogue. Was four: the "TITANIUM" strip held a
    // fourth query, `getProductsByCollection('necklaces')`, whose results contradicted the
    // strip's own label and repeated two cards from the strips above it. Deriving that
    // strip from the catalogue already in hand fixed both and removed the query.
    //
    // Pinned exactly rather than as a ceiling, in both directions on purpose: a rise means
    // the per-collection pattern is back, and a fall means a strip stopped being fetched at
    // all — which is how a section goes missing without any test noticing.
    const total =
      callsTo(ast, 'getBestsellers').length +
      callsTo(ast, 'getNewArrivals').length +
      callsTo(ast, 'getProductsByCollection').length +
      callsTo(ast, 'getProducts').length

    expect(total, 'the homepage should issue exactly 3 Shopify fetches').toBe(3)
  })

  it('renders the documented section sequence, in order', () => {
    // CLAUDE.md's "Homepage Section Sequence" is a design decision, and until now it was
    // prose only: every existing homepage assertion is a single-element existence check, so
    // deleting a section or reordering the page broke nothing. This reads the JSX in source
    // order and pins the sequence itself.
    //
    // Source order rather than rendered order because it is the decision being guarded —
    // e2e/homepage-composition.spec.ts asserts the rendered counterpart, and the two
    // disagreeing would itself be worth knowing.
    const sequence = [
      ...source.matchAll(
        /<(Hero|HorizontalScroll|CampaignBand|CollectionGrid|MaterialsSection)\b/g
      ),
    ].map((match) => match[1])

    expect(sequence, 'the homepage section sequence changed — update CLAUDE.md too').toEqual([
      'Hero',
      'HorizontalScroll',
      'CampaignBand',
      'HorizontalScroll',
      'CollectionGrid',
      'HorizontalScroll',
      'MaterialsSection',
    ])
  })
})
