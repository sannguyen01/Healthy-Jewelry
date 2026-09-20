/**
 * The catalogue record schema — what a Healthy Jewellery product *is*, now that nothing
 * sells it.
 *
 * ## Why this is not the old type with the price fields deleted
 *
 * `src/lib/catalog/types.ts` holds the Shopify wire format. It moved out of
 * `src/lib/shopify/` in PR #77, which was the right first step and changed "not a field,
 * not a name, not an export" — so it still exports `Money`, `edges`/`node` envelopes,
 * `checkoutUrl`, `availableForSale` and `priceRange.minVariantPrice`. Building the
 * browse-only catalogue on that type would re-import every commerce semantic this
 * decommission exists to remove, into the directory whose name promises they are gone.
 *
 * Measured against the fifteen public-identity fields the decommission must preserve, that
 * type carries five outright, five only in a commerce shape, and **five not at all**: SKU,
 * care instructions, an availability statement, a last-reviewed date, and legacy redirects.
 *
 * ## The rule that shapes every optional field here: absence is a state, never a blank
 *
 * Those five have no source. Not in `hj-data.ts`, not in Shopify as far as this repository
 * can see, not anywhere. There were three ways to handle that and only one is honest:
 *
 * | option | what it does | why not |
 * |---|---|---|
 * | invent plausible values | ships fabricated claims about a real brand's products | never |
 * | leave the field optional | `undefined` reads as "no care instructions exist", which is a claim | no |
 * | **an explicit pending state** | says *we have not authored this yet*, and can be counted | **this** |
 *
 * The decommission brief already reached this conclusion for photography — "it converts
 * 'we have no photo' from an accidental absence into an explicit content state". Every
 * unsourced field here gets the same treatment, for the same reason and with one extra
 * benefit: a pending state is **countable**, so `pendingFieldCount()` turns the content
 * debt into a number that can be burnt down and asserted against, which `undefined`
 * never could.
 *
 * ## What is deliberately absent
 *
 * No `price`, no `compareAtPrice`, no `currencyCode`, no `availableForSale`, no variant
 * IDs, no `checkoutUrl`. A field that cannot be true of a catalogue nobody can buy from
 * does not get a nullable column; it gets left out, so that a page trying to render one
 * fails to compile rather than rendering an empty span.
 */

import { z } from 'zod'

// ── Vocabularies ───────────────────────────────────────────────────────────
//
// Restated here rather than imported from `@/lib/catalog/types`, and that is not an
// oversight. This module must outlive that file: WS-4 deletes the Shopify wire format, and
// a schema importing its unions would be deleted with it. `collection-handle-contract`
// already asserts the two agree while both exist — see `src/tests/unit/catalog-schema.test.ts`.

export const COLLECTION_HANDLES = [
  'rings',
  'necklaces',
  'earrings',
  'bracelets',
  'charms',
] as const

export const MATERIAL_HANDLES = ['titanium', 'niobium', 'surgical-steel'] as const

/**
 * `Sale` is gone, and its absence is a content decision rather than an omission.
 *
 * The old badge vocabulary was `Bestseller | New | Sale | null`, and `Sale` was derived:
 * "if neither tag is present but the product has an active compare-at price". A browse-only
 * catalogue publishes no prices, so there is no compare-at price to be below and nothing a
 * Sale badge could mean. One product carried it — `split-ring-titanium` — and it becomes
 * unbadged rather than being given a different badge it never earned.
 */
export const BADGES = ['bestseller', 'new'] as const

/**
 * What the site may honestly say about getting hold of a piece.
 *
 * `ask-an-ambassador` is the default and will be the answer for most of the catalogue.
 * That is the point: this brand sells through people, and a browse-only site that inherited
 * `availableForSale: true` from a decommissioned inventory system would be asserting stock
 * it has no way to check. Naming the states makes the claim deliberate.
 */
export const AVAILABILITY_STATES = [
  'ask-an-ambassador',
  'made-to-order',
  'discontinued',
] as const

// ── Media ──────────────────────────────────────────────────────────────────

/**
 * The three things that can be true about a product's imagery.
 *
 * `illustration` and `illustration-pending` are **not** the same state, and collapsing them
 * is what `featuredImage: null` did. An illustration with a chosen `svgType` is a
 * deliberate presentation — CLAUDE.md is explicit that the hand-drawn SVGs are "the site's
 * whole visual language today", not an apology. `illustration-pending` means nobody has
 * even decided which illustration this piece should have. The first needs nothing; the
 * second is work.
 */
export const mediaSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('photo'),
    src: z.string().min(1),
    /**
     * Required, and never the empty string.
     *
     * An empty `alt` tells a screen reader the image is decorative — that the thing the
     * customer is looking at does not matter. `catalog-conventions.md` already records
     * falling back to the product title rather than emitting one; here the schema simply
     * refuses to store the empty case.
     */
    alt: z.string().min(1),
  }),
  z.object({
    kind: z.literal('illustration'),
    svgType: z.string().min(1),
  }),
  z.object({
    kind: z.literal('illustration-pending'),
  }),
])

// ── Fields with no source yet ──────────────────────────────────────────────

/**
 * A value that has been authored, or has explicitly not been.
 *
 * Generic so the pending shape is written once. Every consumer must handle both arms,
 * which is the enforcement: a template cannot accidentally render "undefined" because
 * there is no `undefined` to render.
 */
function pendingOr<T extends z.ZodTypeAny>(authored: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('pending') }),
    z.object({ state: z.literal('authored'), value: authored }),
  ])
}

export const careInstructionsSchema = pendingOr(z.array(z.string().min(1)).min(1))
export const skuSchema = pendingOr(z.string().min(1))
export const lastReviewedSchema = pendingOr(z.iso.date())

// ── The product ────────────────────────────────────────────────────────────

export const productSchema = z
  .object({
    handle: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'handle must be a lowercase kebab-case slug'),
    title: z.string().min(1),
    collection: z.enum(COLLECTION_HANDLES),
    material: z.enum(MATERIAL_HANDLES),
    /**
     * The material as a customer reads it — "Grade 23 Titanium", not `titanium`.
     *
     * Stored rather than derived at render. The decommission brief lists `material` and
     * `material label` as two separate things the catalogue must preserve, and it is right
     * to: the handle is an identifier this repository owns, the label is published copy
     * making a materials-science claim. Deriving the second from the first would mean the
     * only place a claim about metallurgy lives is a lookup table in a component.
     */
    materialLabel: z.string().min(1),
    description: z.string().min(1),
    /**
     * The published specification line, exactly as it appears on the page.
     *
     * A free string, not `{ label, value }[]`, and that was the harder call. The seventeen
     * existing spec lines share no structure — "2 mm · 1.8 g", "Adjustable · 2.1 g",
     * "Disc 18 mm · chain 18\"", "14 mm diameter · 1.2 mm wire". A structured schema that
     * fits all four is either a bag of untyped pairs, which buys nothing over the string,
     * or a split on `·` that invents a semantic the copy never had. False precision in a
     * field making dimensional claims about jewellery is worse than no precision.
     */
    specification: z.string().min(1),
    /**
     * The sizes a piece is made in. Empty means one size.
     *
     * A plain list, not `variants[].selectedOptions`. A variant is a purchasable thing and
     * there is nothing to purchase; what remains is the honest fact that a ring comes in
     * eight sizes and a pendant comes in one.
     */
    sizes: z.array(z.string().min(1)),
    availability: z.enum(AVAILABILITY_STATES),
    badge: z.enum(BADGES).nullable(),
    media: mediaSchema,
    careInstructions: careInstructionsSchema,
    sku: skuSchema,
    lastReviewed: lastReviewedSchema,
    /**
     * Paths that used to serve this product and must keep resolving.
     *
     * Empty today and deliberately present anyway. The decommission retires `/cart`,
     * `/checkout` and `/account`, and WS-2 may find a Shopify product whose handle differs
     * from the one this repository has been serving — at which point a redirect is the
     * difference between a moved page and a 404 with inbound links pointing at it. A field
     * added after that discovery is a field added under deadline.
     */
    legacyRedirects: z.array(z.string().startsWith('/')),
  })
  .strict()

export const collectionSchema = z
  .object({
    handle: z.enum(COLLECTION_HANDLES),
    title: z.string().min(1),
    description: z.string().min(1),
  })
  .strict()

export type CatalogProduct = z.infer<typeof productSchema>
export type CatalogCollection = z.infer<typeof collectionSchema>
export type CatalogMedia = z.infer<typeof mediaSchema>
export type CollectionHandle = (typeof COLLECTION_HANDLES)[number]
export type MaterialHandle = (typeof MATERIAL_HANDLES)[number]
export type Badge = (typeof BADGES)[number]
export type Availability = (typeof AVAILABILITY_STATES)[number]

/**
 * How many fields on this product are waiting to be authored.
 *
 * The reason the pending states are a union rather than `undefined`: content debt you can
 * count is content debt you can put a ratchet on. `catalog-content.test.ts` asserts the
 * total across the catalogue, so filling one in is a visible diff and *adding* one cannot
 * pass unnoticed.
 */
export function pendingFieldCount(product: CatalogProduct): number {
  let n = 0
  if (product.careInstructions.state === 'pending') n += 1
  if (product.sku.state === 'pending') n += 1
  if (product.lastReviewed.state === 'pending') n += 1
  if (product.media.kind === 'illustration-pending') n += 1
  return n
}
