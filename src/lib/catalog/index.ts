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
  MATERIAL_HANDLES,
  type CatalogCollection,
  type CatalogProduct,
  type CollectionHandle,
  type MaterialHandle,
} from './schema'
import { rawClaims, rawCollections, rawProducts } from './manifest'
import { CLAIM_IDS, loadClaimsRegistry, type ClaimId, type ClaimsRegistry } from './claims-schema'
import {
  approvedWordings,
  documentedStandard,
  findMaterialSpec,
  inline,
  lines,
  resolveClaim,
  type ClaimContext,
  type ClaimResolution,
} from './claims'

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

/**
 * The claims registry, validated here rather than in its own module for one reason: the
 * build-time check.
 *
 * `next.config.ts` imports this file and nothing else from `src/lib/catalog`, so anything
 * validated here is validated once per build before a page is generated. A registry loaded
 * in a sibling module would need its own import in `next.config.ts` — which belongs to
 * another workstream — or a circular import back into this file for the product handles
 * its cross-check needs. Loading it after the products makes both unnecessary.
 */
const claimsRegistry: ClaimsRegistry = loadClaimsRegistry(rawClaims, {
  productHandles: products.map((p) => p.handle),
})

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
 * The longest search query this will consider.
 *
 * Carried over from the Shopify search path, where it bounded a cache key and a network
 * call. Neither exists now — the search is a filter over 17 records in memory — but the
 * bound stays for the reason it was chosen: an unbounded query is an unbounded string from
 * a URL, and `?q=` with a megabyte in it should cost nothing.
 */
export const MAX_SEARCH_QUERY_LENGTH = 100

/** Lower-case, collapse whitespace, trim, bound. */
export function normaliseSearchQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Products matching a query, across the fields a shopper would search by.
 *
 * Replaces the Shopify Storefront `search` connection, and the substitution is closer than
 * it sounds: that path already degraded to exactly this filter whenever Shopify was
 * unconfigured or unreachable, so this behaviour has been the one most visitors got.
 *
 * An empty query returns nothing rather than everything. `/search` with no term is a page
 * waiting for input, not a request for the whole catalogue.
 *
 * `materialLabel` is searched as well as `material`: somebody typing "titanium" and
 * somebody typing "Grade 23" are asking the same question, and only one of those is the
 * handle.
 */
export function searchProducts(query: string): readonly CatalogProduct[] {
  const q = normaliseSearchQuery(query)
  if (!q) return []
  return products.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.material.toLowerCase().includes(q) ||
      p.materialLabel.toLowerCase().includes(q) ||
      p.specification.toLowerCase().includes(q) ||
      p.collection.toLowerCase().includes(q)
  )
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

/**
 * How many products have not yet been assigned one of the nine forms.
 *
 * Every one of them, today, and deliberately: Arc, Halo, Orbit, Facet, Disc, Bar, Cuff,
 * Split and Hoop are a design taxonomy, not a naming rule, and assigning a form is a design
 * decision a person makes. Counted so that the assignment is a burn-down with a number on
 * it rather than a field that is quietly filled in by whoever edits a record next.
 */
export function unassignedFormCount(): number {
  return products.filter((product) => product.form.state === 'unassigned').length
}

// ── Claims ─────────────────────────────────────────────────────────────────
//
// Server-side only, and that is a bundle decision as much as an architectural one: these
// read a Zod-validated registry, and a client component importing them would ship Zod to
// the browser for the sake of three words. Client components receive resolved text as
// props from the server component that renders them — see `Hero` and `ProductDetail`.

/** The validated registry, for tests and for the scheduled expiry probe. */
export function getClaimsRegistry(): ClaimsRegistry {
  return claimsRegistry
}

/** The render-time clock. A function, so a test can see exactly where time enters. */
function renderTime(): Date {
  return new Date()
}

/** The full resolution — wording or fallback, and why — for surfaces and tests that need the reason. */
export function resolveClaimFor(id: ClaimId, context: ClaimContext): ClaimResolution {
  return resolveClaim(claimsRegistry, id, context, renderTime())
}

/**
 * What a sentence surface renders for this claim: its wording when approved and
 * applicable, its neutral fallback otherwise. Line-break hints collapse to spaces.
 */
export function claimText(id: ClaimId, context: ClaimContext): string {
  return inline(resolveClaimFor(id, context).text)
}

/** As `claimText`, split on the registry's line-break hints — for a heading set on several lines. */
export function claimLines(id: ClaimId, context: ClaimContext): string[] {
  return lines(resolveClaimFor(id, context).text)
}

/** Only the approved wordings among `ids`, for list surfaces. See `approvedWordings`. */
export function approvedClaimTexts(ids: readonly ClaimId[], context: ClaimContext): string[] {
  return approvedWordings(claimsRegistry, ids, context, renderTime())
}

/**
 * Narrow claim ids held as plain strings — `hj-data.ts` keeps them that way so the
 * materials copy does not import the catalogue — or throw naming the one that is not real.
 * A throw rather than a cast: an unknown id silently rendering nothing would look exactly
 * like a claim nobody has approved yet.
 */
export function asClaimIds(ids: readonly string[]): ClaimId[] {
  return ids.map((id) => {
    const known = CLAIM_IDS.find((c) => c === id)
    if (!known) throw new Error(`"${id}" is not a claim id in src/lib/catalog/claims-schema.ts.`)
    return known
  })
}

/** The exact designation of a metal — a specification, so it always renders. */
export function materialDesignation(material: MaterialHandle): string {
  return findMaterialSpec(claimsRegistry, material).designation
}

/** The standard a metal is documented to meet in this context, or `null`. See `documentedStandard`. */
export function materialStandard(material: MaterialHandle, context: ClaimContext): string | null {
  return documentedStandard(claimsRegistry, material, context)
}

/**
 * Narrow a materials-copy handle to the catalogue vocabulary, or throw.
 *
 * `hj-data.ts` keeps its handles as plain strings on purpose (see its header), so the
 * narrowing happens once, here, at the edge where a material becomes a claim context.
 */
export function toMaterialHandle(handle: string): MaterialHandle {
  const material = MATERIAL_HANDLES.find((m) => m === handle)
  if (!material) throw new Error(`"${handle}" is not one of the catalogue's materials.`)
  return material
}

/** The claim context for one metal, from a materials-copy handle. */
export function materialContext(handle: string): ClaimContext {
  return { kind: 'material', material: toMaterialHandle(handle) }
}

/** The claim context for one product page. */
export function productContext(product: CatalogProduct): ClaimContext {
  return { kind: 'product', handle: product.handle, material: product.material }
}

/**
 * The notes under a product: its material designation, a standard only where documentation
 * covers this piece, and any approved claim about it. Today that is the designation alone —
 * the three chips this row carried until 2026-09-26 were claims with no evidence.
 */
export const PRODUCT_NOTE_CLAIMS: readonly ClaimId[] = ['implant-grade', 'hypoallergenic', 'mri-safe']

export function productMaterialNotes(product: CatalogProduct): {
  designation: string
  standard: string | null
  claims: string[]
} {
  const context = productContext(product)
  return {
    designation: materialDesignation(product.material),
    standard: materialStandard(product.material, context),
    claims: approvedClaimTexts(PRODUCT_NOTE_CLAIMS, context),
  }
}

/**
 * The chips a metal shows: its specification properties, then each of its claims that is
 * approved for that metal at render time. One rule for the two surfaces that render
 * `hjMaterials` — the homepage section and `/materials` — so they cannot disagree about
 * the same metal.
 */
export function materialChips(material: {
  handle: string
  properties: readonly string[]
  claims: readonly string[]
}): string[] {
  return [...material.properties, ...approvedClaimTexts(asClaimIds(material.claims), materialContext(material.handle))]
}

export type { CatalogProduct, CatalogCollection, CollectionHandle, ClaimId, ClaimContext }
