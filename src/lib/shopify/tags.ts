// Healthy Jewelry — Shopify tag parsing
//
// Shopify has no first-class field for "which metal is this" or "which
// illustration should this use", so both travel as product tags. Reading them
// is the seam where the store's vocabulary meets the code's, and it is exactly
// where the two silently disagreed:
//
//   - the store tags products `material:titanium`, `material:niobium`,
//     `material:steel`; the code looked for bare `titanium` / `niobium` /
//     `surgical-steel`. Nothing matched, so every one of the 22 real products
//     fell through to the `titanium` default — six niobium and four steel
//     pieces each claiming to be titanium, on a brand whose entire promise is
//     knowing which metal touches your skin.
//   - the store tags `svg:ring-halo`, `svg:charm-star` and six other types the
//     `HJSvgType` union does not contain. The old code cast the tag straight to
//     `HJSvgType`, so nothing caught it and `JewelrySVG` returned `null` —
//     nine completely blank product tiles.
//
// Both failures are silent by construction: a tag that does not match is
// indistinguishable from a tag that is absent. Parsing lives here, in one
// place, so it can be tested against fixtures captured from the real store.

import { HJ_SVG_TYPES, HJ_COLLECTION_HANDLES } from './types'
import type { HJCollectionHandle, HJMaterialHandle, HJSvgType } from './types'

// ── Materials ──────────────────────────────────────────────────────────────

/**
 * Every spelling the store might use, mapped to the handle the code uses.
 *
 * `steel` is the one that matters: Shopify says `material:steel`, the code's
 * vocabulary is `surgical-steel`, and stripping the `material:` prefix alone
 * still would not have matched. Both halves of the fix are needed.
 */
const MATERIAL_ALIASES: Readonly<Record<string, HJMaterialHandle>> = {
  titanium: 'titanium',
  'grade-23-titanium': 'titanium',
  ti: 'titanium',
  niobium: 'niobium',
  nb: 'niobium',
  'surgical-steel': 'surgical-steel',
  steel: 'surgical-steel',
  '316l': 'surgical-steel',
  '316l-steel': 'surgical-steel',
  'stainless-steel': 'surgical-steel',
}

/** Strip a known namespace prefix (`material:titanium` → `titanium`). */
function stripPrefix(tag: string, prefix: string): string {
  const lower = tag.toLowerCase().trim()
  return lower.startsWith(prefix) ? lower.slice(prefix.length) : lower
}

export interface MaterialParse {
  material: HJMaterialHandle
  /** False when nothing matched and the default was used. */
  matched: boolean
}

/**
 * The material a product is made of, from its tags.
 *
 * Accepts both `material:steel` and a bare `steel`, so the store can be
 * retagged without breaking the site and vice versa — neither side has to move
 * first.
 */
export function parseMaterial(tags: readonly string[]): MaterialParse {
  for (const tag of tags) {
    const value = stripPrefix(tag, 'material:')
    const material = MATERIAL_ALIASES[value]
    if (material) return { material, matched: true }
  }
  return { material: 'titanium', matched: false }
}

// ── Collections ────────────────────────────────────────────────────────────

export function isHJCollectionHandle(value: string): value is HJCollectionHandle {
  return (HJ_COLLECTION_HANDLES as readonly string[]).includes(value)
}

/**
 * Collections Shopify creates and manages itself. A product can sit in one
 * without anybody putting it there, and none of them is a category this site
 * serves.
 *
 * `frontpage` is the one that matters, and it is live: `arc-band-titanium` is in
 * `frontpage` *and* `rings`, and Shopify returns `frontpage` first.
 */
const SHOPIFY_BUILTIN_COLLECTIONS: ReadonlySet<string> = new Set(['frontpage'])

export interface CollectionParse {
  collection: HJCollectionHandle
  /** False when nothing matched and the default was used. */
  matched: boolean
  /** Handles that were present but are not ones this site serves — for logging. */
  ignored: string[]
}

/**
 * Which of this site's five collections a product belongs to.
 *
 * ## The bug this replaces
 *
 * `mapShopifyProduct` used to take the *first* handle Shopify returned and cast
 * it:
 *
 * ```ts
 * const collection = (edges[0]?.node?.handle as HJCollectionHandle) ?? 'rings'
 * ```
 *
 * `material` and `svgType` were both moved out of casts and into validating
 * parsers here, precisely because a cast is a claim the compiler believes and
 * nothing checks. `collection` was the one left behind, and the live store has a
 * product that lands on it: `arc-band-titanium` returns
 * `collections: [frontpage, rings]`, built-in first.
 *
 * So `product.collection` became `'frontpage'` — a value its own type says is
 * impossible — and from there:
 *
 *   - the breadcrumb rendered the literal `frontpage` and linked to
 *     `/shop/frontpage`, which `dynamicParams = false` turns into a **hard 404**,
 *     reached from a link the site renders on its only `bestseller` product;
 *   - `breadcrumbJsonLd` published that 404 as structured data;
 *   - `collectionTag('frontpage')` was registered by the related-products fetch
 *     and revalidated by nothing — a widow tag, the exact failure class
 *     `cacheTags.ts` exists to make inexpressible.
 *
 * ## Why no detector saw it
 *
 * `scripts/lib/premise-checks.mjs` exempts `frontpage` from the collection-set
 * drift premise, and a test pins that exemption as correct. It *is* correct for
 * the question that premise asks — a built-in appearing is not drift. It was
 * being read as the broader claim that `frontpage` is harmless. **An exemption is
 * an assumption, and it needs a detector like any other.**
 *
 * ## The rule
 *
 * Return the first handle that is genuinely one of ours, ignoring built-ins and
 * anything unrecognised. Order within the valid ones is Shopify's; order between
 * valid and invalid is no longer. A product in `frontpage` + `rings` resolves to
 * `rings` — which is what `docs/catalog-conventions.md` has claimed all along.
 */
export function parseCollection(
  collectionHandles: readonly string[],
  handle = ''
): CollectionParse {
  const ignored: string[] = []

  for (const raw of collectionHandles) {
    const value = raw.toLowerCase().trim()
    if (isHJCollectionHandle(value)) return { collection: value, matched: true, ignored }
    // Built-ins are expected and uninteresting; anything else is a real
    // collection somebody made that the site cannot serve, and worth naming.
    if (!SHOPIFY_BUILTIN_COLLECTIONS.has(value)) ignored.push(value)
  }

  // `handle` is accepted so callers pass it uniformly with parseSvgType; it is
  // the caller that logs, so that every warning in the mapper reads the same.
  void handle
  return { collection: 'rings', matched: false, ignored }
}

// ── SVG illustration types ─────────────────────────────────────────────────

export function isHJSvgType(value: string): value is HJSvgType {
  return (HJ_SVG_TYPES as readonly string[]).includes(value)
}

/**
 * The illustration to use when the tag is missing, unrecognised, or the product
 * has no tag at all.
 *
 * Keyed by collection so a ring always looks like a ring. The old fallback was
 * `'ring-arc'` for everything, which put a ring on a necklace — and an
 * unrecognised tag skipped the fallback entirely and rendered nothing.
 */
const COLLECTION_FALLBACK: Readonly<Record<HJCollectionHandle, HJSvgType>> = {
  rings: 'ring-arc',
  necklaces: 'necklace-drop',
  earrings: 'earring-hoop',
  bracelets: 'bracelet-cuff',
  charms: 'charm-classic',
}

export interface SvgTypeParse {
  svgType: HJSvgType
  /** False when the tag was absent or named a type that does not exist. */
  matched: boolean
  /** The unrecognised tag value, when there was one — for logging. */
  unknownTag?: string
}

/**
 * The illustration for a product, from its `svg:` tag.
 *
 * Validates rather than casts. An unknown value degrades to the collection's
 * illustration, so the worst outcome is a generic-but-correct shape instead of
 * an empty box.
 */
export function parseSvgType(
  tags: readonly string[],
  collection: HJCollectionHandle,
  handle = ''
): SvgTypeParse {
  const fallback = COLLECTION_FALLBACK[collection] ?? 'ring-arc'

  const svgTag = tags.find((t) => t.toLowerCase().startsWith('svg:'))
  if (svgTag) {
    const value = stripPrefix(svgTag, 'svg:')
    if (isHJSvgType(value)) return { svgType: value, matched: true }
    return { svgType: fallback, matched: false, unknownTag: value }
  }

  // No tag: the handle often still says what the piece is. Kept from the
  // original implementation because it is genuinely useful on an untagged
  // catalog, but it now defers to the collection rather than to 'ring-arc'.
  const lower = handle.toLowerCase()
  if (lower.includes('necklace') || lower.includes('pendant')) {
    return { svgType: 'necklace-drop', matched: false }
  }
  if (lower.includes('earring') || lower.includes('stud')) {
    return { svgType: 'earring-hoop', matched: false }
  }
  if (lower.includes('bracelet') || lower.includes('cuff') || lower.includes('bangle')) {
    return { svgType: 'bracelet-cuff', matched: false }
  }
  if (lower.includes('charm')) {
    return { svgType: 'charm-classic', matched: false }
  }

  return { svgType: fallback, matched: false }
}
