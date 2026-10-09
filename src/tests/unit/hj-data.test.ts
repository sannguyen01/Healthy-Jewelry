import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hjMaterials } from '@/lib/data/hj-data'
import * as hjData from '@/lib/data/hj-data'

/**
 * **What is left of `hj-data.ts`, and the assertion that keeps it that way.**
 *
 * This file used to be 446 lines holding 17 products, 5 collections and 3 materials, and
 * this test used to reconcile all three. Products and collections moved to reviewed JSON
 * under `src/content/catalog/**` in WS-4a/b, read through `@/lib/catalog` and validated
 * against a Zod schema that stops the build. `catalog-content.test.ts` owns every
 * assertion that moved with them — counts, handles, badges, collection membership, the
 * brand rules, the content-debt ratchet.
 *
 * Materials stayed, and that was a decision rather than an omission. The catalogue schema
 * describes things a visitor can look at and ask an ambassador about: a handle, a URL,
 * sizes, a photograph, an availability state. A metal has none of those. Forcing the
 * three materials into a product shape would mean inventing five fields for each of them
 * and then explaining in the schema why they are always pending — which is the same
 * fabrication the pending-state design exists to avoid.
 *
 * So what remains here is materials coverage, plus the boundary itself: a test that fails
 * if product accessors reappear in this module. That is not hypothetical tidiness. ADR 004
 * enumerates five defects, every one of them a module reading product data from somewhere
 * its neighbours did not, and this file was one of the two places they read from.
 */

describe('hjMaterials', () => {
  it('has exactly 3 entries', () => {
    expect(hjMaterials).toHaveLength(3)
  })

  it('contains titanium, niobium, surgical-steel', () => {
    const handles = hjMaterials.map((m) => m.handle)
    expect(handles).toContain('titanium')
    expect(handles).toContain('niobium')
    expect(handles).toContain('surgical-steel')
  })

  it('every material carries the copy both surfaces render', () => {
    // `/materials` and the homepage `MaterialsSection` both read title, subtitle, body
    // and properties. A material missing one renders a heading with a hole under it.
    for (const material of hjMaterials) {
      expect(material.title.length, `${material.handle} has no title`).toBeGreaterThan(0)
      expect(material.subtitle.length, `${material.handle} has no subtitle`).toBeGreaterThan(0)
      expect(material.body.length, `${material.handle} has no body`).toBeGreaterThan(0)
      expect(
        material.properties.length,
        `${material.handle} lists no properties`
      ).toBeGreaterThan(0)
    }
  })

  it('every material handle matches the catalogue vocabulary', async () => {
    // `MATERIAL_HANDLES` in the catalogue schema and these three handles are the same
    // vocabulary written twice — a product says `material: 'titanium'` and this file
    // says what titanium is. They are compared rather than shared because the schema
    // must outlive this module (see the note at the top of `schema.ts`).
    const { MATERIAL_HANDLES } = await import('@/lib/catalog/schema')
    expect([...hjMaterials.map((m) => m.handle)].sort()).toEqual([...MATERIAL_HANDLES].sort())
  })

  it('the material copy carries no prohibited brand language', () => {
    const prohibited = /\b(stone|gemstone|crystal|chakra|healing|mystical|spiritual)\b/i
    for (const material of hjMaterials) {
      const text = [material.title, material.subtitle, material.body, ...material.properties]
        .join(' ')
      expect(prohibited.test(text), `${material.handle}: ${text}`).toBe(false)
    }
  })
})

/**
 * The boundary, asserted in both directions: by export surface and by source.
 *
 * The export check is the one that matters at runtime; the source check catches a product
 * array added back as a non-exported constant, which would be the first half of the same
 * mistake and would look harmless in review.
 */
describe('products and collections do not live here any more', () => {
  const REMOVED = [
    'hjProducts',
    'hjCollections',
    'getAllProducts',
    'getProductsByCollection',
    'getProductByHandle',
    'getBestsellers',
    'getNewArrivals',
    'getCollectionByHandle',
  ]

  it.each(REMOVED)('no longer exports %s', (name) => {
    expect(
      Object.prototype.hasOwnProperty.call(hjData, name),
      `src/lib/data/hj-data.ts exports "${name}" again. Product data has exactly one ` +
        `runtime access layer — @/lib/catalog — and ADR 034 is why. A second accessor ` +
        `here is how 20 of 22 products once served "Product Not Found" as their title ` +
        `while rendering a perfectly good page: two modules, two catalogues, neither ` +
        `aware of the other.`
    ).toBe(false)
  })

  it('exports materials and nothing else', () => {
    expect(Object.keys(hjData).sort()).toEqual(['hjMaterials'])
  })

  it('holds no product records in its source either', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/data/hj-data.ts'), 'utf8')
    // A product record is recognisable by fields no material has.
    for (const field of ['price', 'compareAtPrice', 'currencyCode', 'variants', 'svgType']) {
      expect(source.includes(`${field}:`), `hj-data.ts declares a "${field}" field`).toBe(false)
    }
  })
})
