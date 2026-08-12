import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HJ_COLLECTION_HANDLES } from '@/lib/shopify/types'
import { parseCollection, isHJCollectionHandle } from '@/lib/shopify/tags'
import { hjCollections } from '@/lib/data/hj-data'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'
import ts from 'typescript'

/**
 * **Every collection a product can be mapped into must be one the router will serve.**
 *
 * That is the invariant. `parseCollection` is only how it is currently upheld, and
 * testing the parser alone would miss the way this actually breaks: the two sets
 * drifting apart.
 *
 * `/shop/[collection]` sets `dynamicParams = false`, so a handle outside its
 * `VALID_COLLECTIONS` is a **hard 404 before rendering** — and `product.collection`
 * is what the product page's breadcrumb links to, and what `breadcrumbJsonLd`
 * publishes as structured data. A mismatch is a 404 reached from a link the site
 * renders itself, on a page that looks completely healthy.
 *
 * Two sides of a contract with nothing joining them: the `cacheTags.ts` shape, which
 * this repo has already paid for twice. So they are compared here, in both directions,
 * against the router's real source.
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

describe('the collection set is one set, not three', () => {
  it('finds the router declaration at all', () => {
    // Without this, a rename would make every assertion below vacuously true —
    // the `cache-tag-contract` lesson about a guardrail that reads a file by name.
    expect(routerCollections().length).toBeGreaterThan(0)
  })

  it('every handle the parser can return is served by the router', () => {
    expect([...HJ_COLLECTION_HANDLES].sort()).toEqual(routerCollections().sort())
  })

  it('every handle the router serves has a collection entry to render', () => {
    expect(hjCollections.map((c) => c.handle).sort()).toEqual(routerCollections().sort())
  })

  /**
   * The direction that bites. Adding a sixth collection to the type without adding it
   * to the router gives it a hard 404, and the failure looks like a routing bug rather
   * than a missing config.
   */
  it('a handle added to the type but not the router is caught', () => {
    const router = new Set(routerCollections())
    const orphans = [...HJ_COLLECTION_HANDLES, 'pendants'].filter((h) => !router.has(h))
    expect(orphans).toEqual(['pendants'])
  })
})

describe('parseCollection', () => {
  /**
   * Captured verbatim from the live store on 2026-08-12, via the Admin API:
   *
   *   arc-band-titanium → collections: [frontpage, rings]
   *
   * Written in Shopify's order, not a convenient one. *A fixture written in your own
   * vocabulary asserts only that you agree with yourself* — the lesson from
   * `material:steel` mismatching `surgical-steel` on all 22 products while every test
   * stayed green.
   */
  it('resolves the live arc-band-titanium case to rings, not frontpage', () => {
    const result = parseCollection(['frontpage', 'rings'], 'arc-band-titanium')
    expect(result.collection).toBe('rings')
    expect(result.matched).toBe(true)
  })

  it('does not report the built-in frontpage as an unrecognised collection', () => {
    // Shopify creates it; nobody put the product there. Reporting it as a problem
    // every run is how a warning becomes wallpaper.
    expect(parseCollection(['frontpage', 'rings']).ignored).toEqual([])
  })

  it('takes the first real handle when a product is in several of ours', () => {
    expect(parseCollection(['bracelets', 'charms']).collection).toBe('bracelets')
  })

  it('skips past a built-in to find a real handle later in the list', () => {
    expect(parseCollection(['frontpage', 'charms']).collection).toBe('charms')
  })

  it('falls back to rings when no handle is one of ours', () => {
    const result = parseCollection(['seasonal', 'spectrum'], 'nova-pendant')
    expect(result.collection).toBe('rings')
    expect(result.matched).toBe(false)
  })

  /**
   * The fallback and the reason for it are reported separately. "Defaulted to rings"
   * and "defaulted to rings *because this product is in a collection called spectrum
   * that has no page*" call for different responses.
   */
  it('names the collections it could not use', () => {
    expect(parseCollection(['seasonal', 'spectrum']).ignored).toEqual(['seasonal', 'spectrum'])
  })

  it('falls back on an empty list, as an untagged product produces', () => {
    const result = parseCollection([])
    expect(result.collection).toBe('rings')
    expect(result.matched).toBe(false)
    expect(result.ignored).toEqual([])
  })

  it('tolerates the casing and whitespace a hand-edited Shopify handle can carry', () => {
    expect(parseCollection([' Rings ']).collection).toBe('rings')
  })

  it('never returns a handle outside the served set, whatever the input', () => {
    const inputs = [
      ['frontpage'],
      ['', '   '],
      ['RINGS'],
      ['not-a-collection'],
      [],
      ['frontpage', 'seasonal', 'earrings'],
    ]
    for (const input of inputs) {
      expect(isHJCollectionHandle(parseCollection(input).collection)).toBe(true)
    }
  })
})

describe('isHJCollectionHandle', () => {
  it('accepts every served handle', () => {
    for (const handle of HJ_COLLECTION_HANDLES) expect(isHJCollectionHandle(handle)).toBe(true)
  })

  it('rejects the built-in that caused this', () => {
    expect(isHJCollectionHandle('frontpage')).toBe(false)
  })

  it('rejects near-misses rather than guessing', () => {
    for (const value of ['Rings', 'ring', 'rings ', '', 'necklace']) {
      expect(isHJCollectionHandle(value)).toBe(false)
    }
  })
})

/**
 * The premise checker and the parser both decide what a "built-in" collection is, in
 * two languages, in two files. They now have to agree — which is the whole reason the
 * blind spot existed: `premise-checks.mjs` exempted `frontpage` as harmless while the
 * mapper was busy mapping a product into it.
 */
describe('the built-in exemption is the same set on both sides', () => {
  it('matches scripts/lib/premise-checks.mjs', () => {
    const path = resolve(__dirname, '../../../scripts/lib/premise-checks.mjs')
    const source = readFileSync(path, 'utf8')
    const declared = source.match(/SHOPIFY_BUILTIN_COLLECTIONS = new Set\(\[([^\]]*)\]\)/)

    expect(declared).not.toBeNull()
    const handles = [...(declared?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(handles).toEqual(['frontpage'])

    // Every handle the premise checker waves through must also be one the parser
    // refuses to map a product into. Otherwise the exemption is a blind spot again.
    for (const handle of handles) {
      expect(isHJCollectionHandle(handle)).toBe(false)
      expect(parseCollection([handle]).matched).toBe(false)
    }
  })
})
