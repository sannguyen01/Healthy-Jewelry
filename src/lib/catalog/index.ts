/**
 * The catalogue reader — the **only** runtime access layer for product data.
 *
 * ## The boundary, and why it is a test rather than a convention
 *
 * [ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md) supersedes ADR 004. The
 * old rule was that the static catalogue is a *fallback* reachable only from behind
 * `@/lib/shopify`; the new one inverts it. `src/content/catalog/**` is the source,
 * `src/lib/catalog/**` is the only thing that may read it, and nothing else may import a
 * raw record.
 *
 * ADR 004 is worth re-reading before touching this file, because the five defects it
 * enumerates are the argument for enforcing the boundary with a compiler rather than a
 * comment. Every one of them — 20 of 22 products serving "Product Not Found", a search that
 * could find nothing, a homepage illustrating collections with products not in them — was a
 * module reading product data from somewhere its neighbours did not.
 * `catalog-import-boundary.test.ts` resolves imports through the TypeScript compiler API
 * and fails on any module outside this directory that reaches past this door.
 *
 * ## Validation happens once, here, at module load
 *
 * Every record is parsed through `productSchema` the first time this module is imported.
 * In a build that is at build time, and a malformed record **fails the build** rather than
 * rendering a page with a hole in it. `next.config.ts` already demonstrates the alternative:
 * `warnIfShopifyUnconfigured()` prints and continues, so a deployment that would serve a
 * catalogue nobody can buy from looks perfectly healthy in the log.
 *
 * `.strict()` on the schemas means an unrecognised key is an error, not a shrug. A typo'd
 * `materialLabl` would otherwise validate, render blank, and be invisible to everything.
 */

import {
  collectionSchema,
  productSchema,
  pendingFieldCount,
  type CatalogCollection,
  type CatalogProduct,
  type CollectionHandle,
} from './schema'
import { rawCollections, rawProducts } from './manifest'

/**
 * Parse and cross-check a whole catalogue, or throw naming everything wrong with it.
 *
 * **A pure function over its inputs, exported, and called once below with the manifest.**
 * The parsing used to happen inline at module load, which meant its failure branches could
 * only be reached by shipping a broken record — so they were the least-tested code in the
 * module that decides whether a build proceeds. That is
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)'s finding
 * exactly: of three probes written in one week, every defect landed in the one whose
 * decision was tangled with I/O and therefore had no fixture test.
 *
 * Separated, `catalog-schema.test.ts` can hand it a malformed record and read the message.
 *
 * Reports **every** problem rather than the first. A build that fails on one bad record,
 * gets fixed, and fails on the next costs one cycle per defect — the same reasoning
 * `preflight-secrets.mjs` gives for naming every missing secret up front: "configuring from
 * scratch costs five sequential red runs to learn five facts knowable up front."
 */
export function loadCatalog(
  rawProductRecords: readonly unknown[],
  rawCollectionRecords: readonly unknown[]
): { products: CatalogProduct[]; collections: CatalogCollection[] } {
  const products = parseAll(rawProductRecords, productSchema, 'product')
  const collections = parseAll(rawCollectionRecords, collectionSchema, 'collection')

  // Two handles resolving to one product is not a validation error on either record — it is
  // a property of the set, so it is checked where the set exists. A duplicate would make
  // `getProductByHandle` return whichever the manifest listed first, silently.
  const duplicates = [
    ...new Set(products.map((p) => p.handle).filter((h, i, all) => all.indexOf(h) !== i)),
  ]

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate product handle(s) in src/content/catalog/products/: ` +
        `${duplicates.join(', ')}. A handle is a URL, so two records claiming one means a ` +
        `page that resolves to whichever file the manifest lists first.`
    )
  }

  return { products, collections }
}

function parseAll<T>(
  raw: readonly unknown[],
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  kind: string
): T[] {
  const parsed: T[] = []
  const problems: string[] = []

  raw.forEach((record, index) => {
    const result = schema.safeParse(record)
    if (result.success && result.data !== undefined) {
      parsed.push(result.data)
      return
    }
    // The handle is the only field a reader can use to find the file, so it is worth
    // digging out of an object that failed validation precisely because it is malformed.
    const handle =
      typeof record === 'object' && record !== null && 'handle' in record
        ? String((record as { handle: unknown }).handle)
        : `index ${index}`
    problems.push(`  ${kind} "${handle}": ${JSON.stringify(result.error)}`)
  })

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} invalid ${kind} record(s) in src/content/catalog/.\n\n` +
        `${problems.join('\n\n')}\n\n` +
        `Every field is required and unknown keys are rejected — see ` +
        `src/lib/catalog/schema.ts for what each one means and why. This throw is ` +
        `deliberate: invalid content stops the build rather than rendering a page with a ` +
        `hole in it.`
    )
  }

  return parsed
}

const { products, collections } = loadCatalog(rawProducts, rawCollections)

// ── Accessors ──────────────────────────────────────────────────────────────

/** Every product, in manifest order. */
export function getAllProducts(): readonly CatalogProduct[] {
  return products
}

/** Every collection, in manifest order. */
export function getAllCollections(): readonly CatalogCollection[] {
  return collections
}

/**
 * One product, or `undefined` when the handle is not ours.
 *
 * `undefined` rather than a fabricated record, and that distinction has a history: ADR 004
 * records `getProduct` being the one Shopify fetcher that deliberately did *not* fall back,
 * because serving an invented product page is worse than serving a 404. The reasoning
 * survives the decommission even though the fallback it was about does not — a handle this
 * catalogue does not contain must reach `not-found`, never a page.
 */
export function getProductByHandle(handle: string): CatalogProduct | undefined {
  return products.find((product) => product.handle === handle)
}

export function getCollectionByHandle(handle: string): CatalogCollection | undefined {
  return collections.find((collection) => collection.handle === handle)
}

export function getProductsByCollection(handle: CollectionHandle): readonly CatalogProduct[] {
  return products.filter((product) => product.collection === handle)
}

export function getBestsellers(): readonly CatalogProduct[] {
  return products.filter((product) => product.badge === 'bestseller')
}

export function getNewArrivals(): readonly CatalogProduct[] {
  return products.filter((product) => product.badge === 'new')
}

/**
 * How many product fields across the whole catalogue are waiting to be authored.
 *
 * Exported so a test can ratchet it. Content debt that is counted can be burnt down;
 * content debt spelled `undefined` cannot even be found.
 */
export function totalPendingFields(): number {
  return products.reduce((sum, product) => sum + pendingFieldCount(product), 0)
}

export type { CatalogProduct, CatalogCollection, CollectionHandle }
