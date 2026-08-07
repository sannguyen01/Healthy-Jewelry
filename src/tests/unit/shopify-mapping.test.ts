import { describe, expect, it } from 'vitest'
import { parseMaterial, parseSvgType, isHJSvgType } from '@/lib/shopify/tags'
import type { HJCollectionHandle } from '@/lib/shopify/types'

/**
 * The store's vocabulary must match the code's.
 *
 * Shopify carries "which metal is this" as a free-text tag. The store writes
 * `material:titanium`, `material:niobium`, `material:steel`. The code looked for
 * bare `titanium` / `niobium` / `surgical-steel`, found nothing, and fell
 * through to `?? 'titanium'` — so all 22 real products would have been labelled
 * Grade 23 Titanium, including six niobium and four steel pieces.
 *
 * On a brand that exists specifically so people with metal sensitivities know
 * what is against their skin, that is not a display bug.
 *
 * It was invisible for the usual reason: an unmatched tag is indistinguishable
 * from an absent one, and the existing tests used synthetic fixtures written in
 * the code's own vocabulary — they asserted the mapper agreed with itself. The
 * fixtures below are the **actual tag arrays on the live catalog**, captured
 * from the Admin API, which is the only kind of fixture that could have failed.
 */

/** Verbatim from the connected store: handle, tags, collection. */
const LIVE_CATALOG: {
  handle: string
  tags: string[]
  collection: HJCollectionHandle
  expectedMaterial: string
  expectedSvg: string
}[] = [
  {
    handle: 'arc-band-titanium',
    tags: ['bestseller', 'material:titanium', 'svg:ring-arc'],
    collection: 'rings',
    expectedMaterial: 'titanium',
    expectedSvg: 'ring-arc',
  },
  {
    handle: 'orbit-pendant-necklace',
    tags: ['material:niobium', 'svg:necklace-disc'],
    collection: 'necklaces',
    expectedMaterial: 'niobium',
    expectedSvg: 'necklace-disc',
  },
  {
    handle: 'halo-stud-earrings',
    tags: ['material:steel', 'svg:earring-stud'],
    collection: 'earrings',
    expectedMaterial: 'surgical-steel',
    expectedSvg: 'earring-stud',
  },
  {
    handle: 'halo-band-titanium',
    tags: ['material:titanium', 'svg:ring-halo'],
    collection: 'rings',
    expectedMaterial: 'titanium',
    expectedSvg: 'ring-halo',
  },
  {
    handle: 'facet-ring-niobium',
    tags: ['material:niobium', 'svg:ring-facet'],
    collection: 'rings',
    expectedMaterial: 'niobium',
    expectedSvg: 'ring-facet',
  },
  {
    handle: 'threader-earrings-steel',
    tags: ['material:steel', 'svg:earring-threader'],
    collection: 'earrings',
    expectedMaterial: 'surgical-steel',
    expectedSvg: 'earring-threader',
  },
  {
    handle: 'chain-bracelet-titanium',
    tags: ['material:titanium', 'svg:bracelet-chain'],
    collection: 'bracelets',
    expectedMaterial: 'titanium',
    expectedSvg: 'bracelet-chain',
  },
  {
    handle: 'bead-bracelet-niobium',
    tags: ['material:niobium', 'svg:bracelet-bead'],
    collection: 'bracelets',
    expectedMaterial: 'niobium',
    expectedSvg: 'bracelet-bead',
  },
  {
    handle: 'anchor-charm-niobium',
    tags: ['material:niobium', 'svg:charm-anchor'],
    collection: 'charms',
    expectedMaterial: 'niobium',
    expectedSvg: 'charm-anchor',
  },
  {
    handle: 'star-charm-titanium',
    tags: ['material:titanium', 'svg:charm-star'],
    collection: 'charms',
    expectedMaterial: 'titanium',
    expectedSvg: 'charm-star',
  },
  {
    handle: 'disc-charm-steel',
    tags: ['material:steel', 'svg:charm-disc'],
    collection: 'charms',
    expectedMaterial: 'surgical-steel',
    expectedSvg: 'charm-disc',
  },
  {
    handle: 'heart-charm-titanium',
    tags: ['material:titanium', 'svg:charm-heart'],
    collection: 'charms',
    expectedMaterial: 'titanium',
    expectedSvg: 'charm-heart',
  },
  {
    handle: 'meridian-cuff',
    tags: ['collection:spectrum', 'material:titanium', 'new', 'svg:bracelet-cuff'],
    collection: 'bracelets',
    expectedMaterial: 'titanium',
    expectedSvg: 'bracelet-cuff',
  },
  {
    handle: 'tectonic-ring',
    tags: ['collection:spectrum', 'material:niobium', 'new', 'svg:ring-facet'],
    collection: 'rings',
    expectedMaterial: 'niobium',
    expectedSvg: 'ring-facet',
  },
  {
    handle: 'terra-bangle',
    tags: ['collection:spectrum', 'material:steel', 'new', 'svg:bracelet-cuff'],
    collection: 'bracelets',
    expectedMaterial: 'surgical-steel',
    expectedSvg: 'bracelet-cuff',
  },
]

describe('the live catalog maps correctly', () => {
  it.each(LIVE_CATALOG)('$handle resolves its material', ({ tags, expectedMaterial }) => {
    const { material, matched } = parseMaterial(tags)
    expect(matched, `no tag in [${tags}] was recognised as a material`).toBe(true)
    expect(material).toBe(expectedMaterial)
  })

  it.each(LIVE_CATALOG)('$handle resolves its illustration', ({ tags, collection, expectedSvg }) => {
    const { svgType, matched, unknownTag } = parseSvgType(tags, collection)
    expect(matched, `unknown svg tag: ${unknownTag}`).toBe(true)
    expect(svgType).toBe(expectedSvg)
  })

  it('no live product silently defaults to titanium', () => {
    // The exact failure: `material:steel` matched nothing, so a steel earring
    // reported titanium with no warning and no way to tell it apart from a
    // product that really is titanium.
    const defaulted = LIVE_CATALOG.filter(({ tags }) => !parseMaterial(tags).matched)
    expect(defaulted.map((p) => p.handle)).toEqual([])
  })

  it('every live svg tag names a shape that exists', () => {
    const missing = LIVE_CATALOG.filter(({ tags }) => {
      const tag = tags.find((t) => t.startsWith('svg:'))
      return tag ? !isHJSvgType(tag.replace('svg:', '')) : false
    })
    expect(missing.map((p) => p.handle)).toEqual([])
  })

  it('covers all three materials — a fixture set of one metal proves nothing', () => {
    const materials = new Set(LIVE_CATALOG.map(({ tags }) => parseMaterial(tags).material))
    expect([...materials].sort()).toEqual(['niobium', 'surgical-steel', 'titanium'])
  })
})

describe('parseMaterial tolerates both vocabularies', () => {
  it('reads the prefixed form the store actually uses', () => {
    expect(parseMaterial(['material:steel']).material).toBe('surgical-steel')
    expect(parseMaterial(['material:niobium']).material).toBe('niobium')
  })

  it('still reads the bare form the code originally expected', () => {
    // Neither side has to move first: retagging the store cannot break the
    // site, and this fix did not require retagging the store.
    expect(parseMaterial(['surgical-steel']).material).toBe('surgical-steel')
    expect(parseMaterial(['niobium']).material).toBe('niobium')
  })

  it('accepts the other names a merchant might reasonably type', () => {
    expect(parseMaterial(['material:316L']).material).toBe('surgical-steel')
    expect(parseMaterial(['material:stainless-steel']).material).toBe('surgical-steel')
  })

  it('is case-insensitive — Shopify tags are free text', () => {
    expect(parseMaterial(['Material:Niobium']).material).toBe('niobium')
  })

  it('reports when it defaulted, so the caller can warn', () => {
    const result = parseMaterial(['bestseller', 'new'])
    expect(result.matched).toBe(false)
    expect(result.material).toBe('titanium')
  })

  it('ignores unrelated tags rather than matching them by accident', () => {
    expect(parseMaterial(['collection:spectrum', 'new']).matched).toBe(false)
  })
})
