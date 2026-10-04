import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource, callsTo } from '@/lib/analysis/tsAstScan'

/**
 * **What the homepage is made of, read out of its own source.**
 *
 * ## This file was `homepage-fetch-budget.test.ts`, and the premise it was named for expired
 *
 * It guarded a Shopify *fetch* count. The homepage used to issue five
 * `getProductsByCollection` queries to read five `svgType` values — one network round trip
 * per collection, so a sixth collection meant a ninth query on the page — and the budget
 * test pinned the total at three.
 *
 * There are no queries. The catalogue is seventeen validated records imported at module
 * load ([ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md)), and
 * `getProductsByCollection` is `Array.prototype.filter`. Calling it five times costs five
 * passes over a seventeen-element array. A test called a *fetch budget*, asserting a number
 * whose units no longer exist, is the shape
 * [ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md) calls a
 * fossil: still green, still cited, measuring nothing.
 *
 * ## What survived the rename, and why it is worth keeping
 *
 * Two of the old assertions were never really about fetches:
 *
 *   - **Three strips, not two.** The old wording was "a fall means a strip stopped being
 *     fetched at all — which is how a section goes missing without any test noticing." Drop
 *     the word *fetched* and it is still exactly right, and still the only unit-level check
 *     that would notice.
 *   - **One catalogue read for the tiles.** Still a real shape question: the tiles are a
 *     *grouping* of one list, not five lookups. That is what stops the collection grid
 *     drifting back into per-collection work as the catalogue grows.
 *
 * And the section sequence, which was never about data access at all.
 *
 * Read through the AST rather than by matching text, so a call reformatted across lines or
 * written inside a comment cannot change the answer. See
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md).
 */

const HOMEPAGE = join(process.cwd(), 'src/app/page.tsx')
const source = readFileSync(HOMEPAGE, 'utf-8')
const ast = parseSource(HOMEPAGE, source)

describe('homepage catalogue access', () => {
  it('parses the homepage', () => {
    // A parse that silently produced nothing would make every assertion below vacuously
    // pass — the same failure `secret-exposure.test.ts` guards by asserting non-emptiness.
    expect(source.length).toBeGreaterThan(0)
    expect(callsTo(ast, 'getAllProducts').length).toBeGreaterThan(0)
  })

  it('issues at most one per-collection lookup', () => {
    // Now zero, and the ceiling stays at one rather than dropping to it. The "TITANIUM"
    // strip used to spend the one allowed call on `getProductsByCollection('necklaces')`,
    // which is where its contents stopped matching its label; it is derived from the
    // catalogue now. Five is the tiles regressing to a lookup each, which is the shape this
    // guards — pinning zero would forbid a future strip that legitimately needs one.
    const perCollection = callsTo(ast, 'getProductsByCollection')

    expect(
      perCollection.length,
      `getProductsByCollection is called ${perCollection.length} times on the homepage.\n` +
        'More than one means the collection tiles are querying per collection again —\n' +
        'derive them from a single getAllProducts() instead, so the tiles stay a grouping\n' +
        'of one list. Arguments seen: ' +
        JSON.stringify(perCollection)
    ).toBeLessThanOrEqual(1)
  })

  it('reads the whole catalogue exactly once for the tiles', () => {
    expect(callsTo(ast, 'getAllProducts').length).toBe(1)
  })

  it('does not map collections onto an async lookup', () => {
    // The specific shape that regressed: `hjCollections.map(async ... await getProducts...)`.
    // Catching the shape rather than only the count keeps a future variant from sneaking
    // in under a different helper name. `hjCollections` no longer exists — the pattern is
    // matched against whatever collection list is in hand.
    const mapsToAwaitedFetch =
      /(?:hjCollections|getAllCollections\(\))\s*\.\s*map\s*\(\s*async/.test(source)
    expect(mapsToAwaitedFetch, 'collections are mapped to an async lookup again').toBe(false)
  })

  /**
   * The page does not await anything any more, and that is asserted rather than assumed.
   *
   * An `async` homepage reading synchronous accessors is harmless at runtime and actively
   * misleading in review: it says "this data comes from somewhere else" about seventeen
   * records compiled into the bundle. It is also the first thing that would come back if
   * a remote data source were reintroduced without a decision being written down.
   */
  it('is a synchronous server component', () => {
    expect(
      /export default async function HomePage/.test(source),
      'HomePage is async again. The catalogue is in memory — if a remote read has come ' +
        'back, ADR 034 needs superseding before this test is changed.'
    ).toBe(false)
  })

  it('composes one curated product strip from two lists', () => {
    // ADR 040: seven beats, one strip. The strip is built from bestsellers and new arrivals,
    // so both reads are pinned exactly — a fall means the strip lost a source, a rise means a
    // list nobody has deduplicated against the others. `stripByMaterial` is gone with the
    // two material and campaign strips; its return is a composition change, not a tweak.
    expect(callsTo(ast, 'getBestsellers').length).toBe(1)
    expect(callsTo(ast, 'getNewArrivals').length).toBe(1)
    expect(callsTo(ast, 'stripByMaterial').length).toBe(0)
  })

  it('deduplicates the two strip sources against each other', () => {
    // `dedupeInOrder` is what stopped `orbit-pendant-titanium` appearing twice on one page,
    // carrying its Bestseller pill in both places. One strip now, but two lists feed it.
    expect(callsTo(ast, 'dedupeInOrder').length).toBe(1)
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
        /<(Hero|MaterialsSection|CareSection|HorizontalScroll|CollectionGrid|RealMoment|FollowUp)\b/g
      ),
    ].map((match) => match[1])

    expect(sequence, 'the homepage section sequence changed — update CLAUDE.md too').toEqual([
      'Hero',
      'MaterialsSection',
      'CareSection',
      'HorizontalScroll',
      'CollectionGrid',
      'RealMoment',
      'FollowUp',
    ])
  })
})
