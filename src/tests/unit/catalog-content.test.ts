import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  getAllProducts,
  getAllCollections,
  getProductByHandle,
  getCollectionByHandle,
  getProductsByCollection,
  getBestsellers,
  getNewArrivals,
  totalPendingFields,
} from '@/lib/catalog'
import { COLLECTION_HANDLES } from '@/lib/catalog/schema'
import { rawProducts, rawCollections } from '@/lib/catalog/manifest'

/**
 * **The content, the manifest that lists it, and the reader that serves it.**
 *
 * Three things that can disagree, checked against each other and against the directory —
 * because the manifest is hand-maintained (see `manifest.ts` for why a directory walk does
 * not survive deployment) and a hand-maintained list is a thing that drifts.
 */

const ROOT = resolve(__dirname, '../../..')
const PRODUCT_DIR = join(ROOT, 'src/content/catalog/products')
const COLLECTION_DIR = join(ROOT, 'src/content/catalog/collections')

const productFiles = readdirSync(PRODUCT_DIR).filter((f) => f.endsWith('.json'))
const collectionFiles = readdirSync(COLLECTION_DIR).filter((f) => f.endsWith('.json'))

/**
 * The count that must balance before Shopify is revoked.
 *
 * 17 products exist in this repository; the connected store has 22. The five-product delta
 * is WS-2's job and is **blocked** on the Shopify connector, which reads `needs_reconnect`.
 * This number is here so that filling the gap is a visible, deliberate edit rather than
 * something that drifts in — and so that a product silently *disappearing* fails too.
 *
 * See docs/browse-only-masterplan.md §WS-2: 17 + 5 = 22, and any other result fails the
 * migration review.
 */
const EXPECTED_PRODUCTS = 17
const EXPECTED_COLLECTIONS = 5

/**
 * Pending fields across the whole catalogue, today.
 *
 * 17 products x 3 unsourced fields (care instructions, SKU, last-reviewed) = 51. Every
 * product has a chosen illustration, so none is pending on media.
 *
 * **A ratchet, not a target.** It may go down as content is authored — that is the point of
 * counting it. It going *up* means a new record shipped with fewer fields filled in than
 * its neighbours, which is exactly the drift `undefined` would have hidden.
 */
const EXPECTED_PENDING_FIELDS = 51

describe('the manifest lists every file, and every file exists', () => {
  it('finds catalogue files to check', () => {
    expect(productFiles.length).toBeGreaterThan(0)
    expect(collectionFiles.length).toBeGreaterThan(0)
  })

  it('the manifest has one product entry per product file', () => {
    expect(
      rawProducts.length,
      `The manifest lists ${rawProducts.length} products and the directory holds ` +
        `${productFiles.length}. A JSON file absent from src/lib/catalog/manifest.ts is a ` +
        `product that exists on disk and nowhere else — it will not render, will not be in ` +
        `the sitemap, and nothing else will notice.`
    ).toBe(productFiles.length)
  })

  it('the manifest has one collection entry per collection file', () => {
    expect(rawCollections.length).toBe(collectionFiles.length)
  })

  it('every product file is named after the handle inside it', () => {
    // The manifest imports by path; the reader looks up by handle. If the two disagree,
    // `getProductByHandle('x')` misses a file called `x.json`.
    for (const file of productFiles) {
      const record = JSON.parse(readFileSync(join(PRODUCT_DIR, file), 'utf-8')) as {
        handle: string
      }
      expect(`${record.handle}.json`, `${file} contains handle "${record.handle}"`).toBe(file)
    }
  })

  it('every collection file is named after the handle inside it', () => {
    for (const file of collectionFiles) {
      const record = JSON.parse(readFileSync(join(COLLECTION_DIR, file), 'utf-8')) as {
        handle: string
      }
      expect(`${record.handle}.json`).toBe(file)
    }
  })
})

describe('every record validates, which is what the build depends on', () => {
  it('the reader loaded without throwing', () => {
    // Importing this module at the top of the file already ran every schema check. If a
    // record were malformed the import would have thrown and no test here would run —
    // which is the build-time behaviour, exercised.
    expect(getAllProducts().length).toBe(EXPECTED_PRODUCTS)
  })

  it('serves the expected number of collections', () => {
    expect(getAllCollections().length).toBe(EXPECTED_COLLECTIONS)
  })

  it('the five-product Shopify delta is still open and still counted', () => {
    // 17 here, 22 in Shopify. When WS-2 lands, this number and EXPECTED_PRODUCTS both move
    // to 22 in the same commit, and the reconciliation is a reviewable diff.
    expect(getAllProducts().length + 5).toBe(22)
  })
})

describe('handles resolve, and only real ones do', () => {
  it('finds every product by its own handle', () => {
    for (const product of getAllProducts()) {
      expect(getProductByHandle(product.handle)?.handle).toBe(product.handle)
    }
  })

  it('returns undefined for a handle the catalogue does not have', () => {
    // Never a fabricated record. ADR 004 recorded why: an invented product page is worse
    // than a 404, because a customer or a search engine trusts a page that lies.
    expect(getProductByHandle('not-a-real-product')).toBeUndefined()
    expect(getProductByHandle('')).toBeUndefined()
  })

  it('finds every collection by its own handle', () => {
    for (const collection of getAllCollections()) {
      expect(getCollectionByHandle(collection.handle)?.handle).toBe(collection.handle)
    }
  })

  it('returns undefined for an unknown collection', () => {
    // `frontpage` specifically: catalog-conventions.md records a real defect where a
    // Shopify built-in collection leaked into a breadcrumb and produced a hard 404.
    expect(getCollectionByHandle('frontpage')).toBeUndefined()
  })

  it('handles are unique', () => {
    const handles = getAllProducts().map((p) => p.handle)
    expect(new Set(handles).size).toBe(handles.length)
  })
})

describe('collection membership', () => {
  it('every product belongs to one of the five collections', () => {
    for (const product of getAllProducts()) {
      expect(COLLECTION_HANDLES).toContain(product.collection)
    }
  })

  it('every collection has at least one product', () => {
    // An empty collection renders an empty shelf with a heading, which reads as a bug.
    for (const handle of COLLECTION_HANDLES) {
      expect(
        getProductsByCollection(handle).length,
        `Collection "${handle}" has no products.`
      ).toBeGreaterThan(0)
    }
  })

  it('the per-collection lists partition the catalogue exactly', () => {
    const total = COLLECTION_HANDLES.reduce((n, h) => n + getProductsByCollection(h).length, 0)
    expect(total).toBe(getAllProducts().length)
  })
})

describe('badges', () => {
  it('bestsellers and new arrivals are non-empty — the homepage strips read them', () => {
    expect(getBestsellers().length).toBeGreaterThan(0)
    expect(getNewArrivals().length).toBeGreaterThan(0)
  })

  it('no product carries a Sale badge', () => {
    // There are no prices, so nothing can be below one. `split-ring-titanium` carried it
    // and is now unbadged rather than being given a badge it never earned.
    for (const product of getAllProducts()) {
      expect(product.badge).not.toBe('sale')
    }
    expect(getProductByHandle('split-ring-titanium')?.badge).toBeNull()
  })

  it('bestseller and new are disjoint', () => {
    const bestsellers = new Set(getBestsellers().map((p) => p.handle))
    for (const product of getNewArrivals()) {
      expect(bestsellers.has(product.handle)).toBe(false)
    }
  })
})

describe('no commerce semantics survive in the content', () => {
  it('no record carries a price, a currency or a variant id', () => {
    const forbidden = /"(price|compareAtPrice|currencyCode|availableForSale|variants|defaultVariantId|checkoutUrl)"/
    for (const file of productFiles) {
      const source = readFileSync(join(PRODUCT_DIR, file), 'utf-8')
      expect(forbidden.test(source), `${file} carries a commerce field`).toBe(false)
    }
  })

  it('no record mentions Shopify', () => {
    for (const file of [...productFiles, ...collectionFiles]) {
      const dir = productFiles.includes(file) ? PRODUCT_DIR : COLLECTION_DIR
      expect(readFileSync(join(dir, file), 'utf-8')).not.toMatch(/shopify/i)
    }
  })

  it('no product claims purchasable stock', () => {
    for (const product of getAllProducts()) {
      expect(product.availability).toBe('ask-an-ambassador')
    }
  })
})

describe('the brand rules apply to content too', () => {
  it('no record uses prohibited language', () => {
    // CLAUDE.md's PROHIBITED list. Enforced here as well as in eslint, because eslint does
    // not read JSON and this is where product copy now lives.
    const prohibited = /\b(stone|stones|gemstone|crystal|crystals|chakra|chakras|healing|mystical|spiritual)\b/i
    for (const product of getAllProducts()) {
      for (const [field, value] of Object.entries({
        title: product.title,
        description: product.description,
        specification: product.specification,
        materialLabel: product.materialLabel,
      })) {
        expect(prohibited.test(value), `${product.handle}.${field}: "${value}"`).toBe(false)
      }
    }
  })

  it('the material label matches the material', () => {
    const labels: Record<string, string> = {
      titanium: 'Grade 23 Titanium',
      niobium: 'Niobium',
      'surgical-steel': '316L Surgical Steel',
    }
    for (const product of getAllProducts()) {
      expect(product.materialLabel, `${product.handle}`).toBe(labels[product.material])
    }
  })
})

describe('sizes are a plain list, and the shape is per-collection', () => {
  it('rings come in eight sizes', () => {
    for (const product of getProductsByCollection('rings')) {
      expect(product.sizes, `${product.handle}`).toHaveLength(8)
    }
  })

  it('bracelets come in five', () => {
    for (const product of getProductsByCollection('bracelets')) {
      expect(product.sizes, `${product.handle}`).toHaveLength(5)
    }
  })

  it('necklaces, earrings and charms are one size, spelled as an empty list', () => {
    // Not `['Default Title']`, which is a Shopify artefact that used to reach the UI.
    for (const handle of ['necklaces', 'earrings', 'charms'] as const) {
      for (const product of getProductsByCollection(handle)) {
        expect(product.sizes, `${product.handle}`).toEqual([])
      }
    }
  })

  it('no size is the Shopify placeholder', () => {
    for (const product of getAllProducts()) {
      expect(product.sizes).not.toContain('Default Title')
    }
  })
})

describe('content debt is counted, and the count is a ratchet', () => {
  it('is exactly what the catalogue carries today', () => {
    expect(
      totalPendingFields(),
      `Pending fields moved from ${EXPECTED_PENDING_FIELDS} to ${totalPendingFields()}.\n\n` +
        `Down is good — update this constant in the same commit that authored the content.\n` +
        `Up means a new record shipped with fewer fields filled in than its neighbours, ` +
        `which is the drift an optional field would have hidden.`
    ).toBe(EXPECTED_PENDING_FIELDS)
  })

  it('is three per product — care instructions, SKU and last-reviewed', () => {
    expect(EXPECTED_PENDING_FIELDS).toBe(EXPECTED_PRODUCTS * 3)
  })

  it('no product is pending on media — every one has a chosen illustration', () => {
    for (const product of getAllProducts()) {
      expect(product.media.kind, `${product.handle}`).toBe('illustration')
    }
  })
})

describe('the build is what enforces the schema, and the wiring is one import', () => {
  // `docs/adr/018-a-claim-about-a-control-is-not-a-control.md`: the schema only runs when
  // something loads the reader. Before next.config.ts imported it, a malformed record
  // passed `pnpm build` cleanly — the claim "invalid content stops the build" was prose.
  // This reads the configuration back out of its own source, so removing the import fails
  // here rather than being discovered by a customer looking at a page with a hole in it.
  const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf-8')

  it('next.config.ts loads the catalogue reader', () => {
    expect(
      config,
      'next.config.ts no longer imports ./src/lib/catalog. Catalogue validation runs at ' +
        'module load, so without that import no record is checked during `pnpm build` and ' +
        'a malformed product ships.'
    ).toMatch(/from '\.\/src\/lib\/catalog'/)
  })

  it('and reads from it, so the import is not dead weight a cleanup deletes', () => {
    // A bare side-effect import is exactly what an "unused import" sweep removes.
    expect(config).toMatch(/getAllProducts\(\)/)
  })

  it('the manifest imports content relatively, which is what makes that work', () => {
    // Next's config loader does not apply tsconfig path mappings, so an `@/` alias
    // anywhere in the reader's import graph breaks the build-time check — and breaks it
    // by *skipping* it, not by failing loudly.
    const manifest = readFileSync(join(ROOT, 'src/lib/catalog/manifest.ts'), 'utf-8')
    expect(manifest).not.toMatch(/from '@\/content\//)
    expect(manifest).toMatch(/from '\.\.\/\.\.\/content\/catalog\//)
  })
})
