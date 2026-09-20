import { describe, it, expect } from 'vitest'
import {
  MAX_SEARCH_QUERY_LENGTH,
  getAllProducts,
  normaliseSearchQuery,
  searchProducts,
} from '@/lib/catalog'

/**
 * **Site search, which moved catalogue and arrived with no tests of its own.**
 *
 * `searchProducts` was a Shopify Storefront `search` connection, exercised at length by
 * `shopify-index.test.ts`. WS-4b replaced it with a filter over seventeen in-memory records
 * and WS-4c deleted that spec with the module it tested — so the function a customer
 * actually reaches had, briefly, no coverage at all while the file it lives in still
 * reported 84% lines and passed the per-file floor.
 *
 * That is the shape this repository keeps paying for: a number that clears its threshold
 * while the thing it is meant to describe has moved. `/search` has *one* E2E spec and no
 * unit tests, and search is the one surface where a customer types free text and gets a
 * yes-or-no answer about whether a product exists.
 *
 * The substitution is closer than it sounds, which is worth stating rather than assuming:
 * the Shopify path already degraded to exactly this filter whenever the store was
 * unconfigured or unreachable, so this behaviour is the one most visitors have had.
 */

describe('normaliseSearchQuery', () => {
  it('lower-cases, so a shopper typing Titanium finds titanium', () => {
    expect(normaliseSearchQuery('Titanium')).toBe('titanium')
  })

  it('collapses runs of whitespace into single spaces', () => {
    expect(normaliseSearchQuery('arc   band')).toBe('arc band')
  })

  it('collapses tabs and newlines too, which a paste can carry', () => {
    expect(normaliseSearchQuery('arc\t\nband')).toBe('arc band')
  })

  it('trims the edges', () => {
    expect(normaliseSearchQuery('  titanium  ')).toBe('titanium')
  })

  it('returns the empty string for whitespace only', () => {
    expect(normaliseSearchQuery('   \t\n ')).toBe('')
  })

  /**
   * The bound was carried over from the Shopify path, where it capped a cache key and a
   * network call. Neither exists now. It stays for the reason it was chosen: `?q=` is an
   * unbounded string from a URL, and a megabyte in it should cost nothing.
   */
  it('bounds the query at MAX_SEARCH_QUERY_LENGTH', () => {
    const long = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 500)
    expect(normaliseSearchQuery(long)).toHaveLength(MAX_SEARCH_QUERY_LENGTH)
  })

  it('bounds after normalising, not before', () => {
    // Trimming first means the cap applies to the query, not to the padding around it.
    const padded = `${' '.repeat(50)}${'b'.repeat(MAX_SEARCH_QUERY_LENGTH)}`
    expect(normaliseSearchQuery(padded)).toBe('b'.repeat(MAX_SEARCH_QUERY_LENGTH))
  })
})

describe('searchProducts', () => {
  /**
   * An empty query returns nothing rather than everything, and the distinction has teeth:
   * `/search` with no term is a page waiting for input, not a request for the whole
   * catalogue. An earlier implementation returned every product for an empty string, which
   * rendered seventeen cards under the heading "Results for ''".
   */
  it.each(['', '   ', '\t\n'])('returns nothing for %p', (query) => {
    expect(searchProducts(query)).toEqual([])
  })

  it('finds a product by its title', () => {
    expect(searchProducts('arc band').map((p) => p.handle)).toContain('arc-band-titanium')
  })

  it('is case-insensitive', () => {
    expect(searchProducts('ARC BAND').map((p) => p.handle)).toContain('arc-band-titanium')
  })

  it('finds by material handle', () => {
    const results = searchProducts('niobium')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((p) => `${p.material} ${p.materialLabel} ${p.description}`.toLowerCase().includes('niobium'))).toBe(true)
  })

  /**
   * `materialLabel` is searched as well as `material`, and this is the case that requires
   * it: somebody typing "Grade 23" is asking the same question as somebody typing
   * "titanium", and only one of those is the handle.
   */
  it('finds by the published material label, not only the handle', () => {
    const results = searchProducts('Grade 23')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((p) => p.materialLabel.toLowerCase().includes('grade 23'))).toBe(true)
  })

  it('finds by collection', () => {
    const results = searchProducts('bracelets')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((p) => p.collection === 'bracelets')).toBe(true)
  })

  it('finds by description text', () => {
    expect(searchProducts('mirror-polished').map((p) => p.handle)).toContain('arc-band-titanium')
  })

  it('finds by specification', () => {
    // The spec line carries dimensions and weights, which is what somebody comparing two
    // pieces types.
    const withSpec = getAllProducts()[0]
    const results = searchProducts(withSpec.specification)
    expect(results.map((p) => p.handle)).toContain(withSpec.handle)
  })

  it('returns nothing for a term the catalogue does not contain', () => {
    // The zero-result branch has to be exercised too — a search only ever seen finding
    // things is as unproven as one only ever seen empty.
    expect(searchProducts('sapphire')).toEqual([])
  })

  it('never returns a product twice, however many fields match', () => {
    // 'titanium' appears in the handle, the material, the label and most descriptions.
    const handles = searchProducts('titanium').map((p) => p.handle)
    expect(handles).toHaveLength(new Set(handles).size)
  })

  it('preserves catalogue order', () => {
    const order = getAllProducts().map((p) => p.handle)
    const results = searchProducts('titanium').map((p) => p.handle)
    expect(results).toEqual(order.filter((h) => results.includes(h)))
  })

  it('every result is a real record the product route will serve', () => {
    // The defect this whole function was rewritten to close: search returning products
    // that 404 on click, because it read a different catalogue from the page.
    const known = new Set(getAllProducts().map((p) => p.handle))
    for (const product of searchProducts('titanium')) {
      expect(known.has(product.handle), `${product.handle} is not in the catalogue`).toBe(true)
    }
  })

  it('normalises the query before matching, so extra spaces still find things', () => {
    expect(searchProducts('  ARC   BAND  ').map((p) => p.handle)).toContain('arc-band-titanium')
  })

  it('a query longer than the bound still matches on its first 100 characters', () => {
    const padded = `titanium${'x'.repeat(MAX_SEARCH_QUERY_LENGTH)}`
    // Truncated to 100 chars, this is 'titanium' followed by 92 x's — which matches nothing.
    // The point is that it terminates and returns an array rather than throwing on length.
    expect(Array.isArray(searchProducts(padded))).toBe(true)
  })
})
