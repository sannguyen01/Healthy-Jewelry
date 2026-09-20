import type { MaterialHandle } from '@/lib/catalog/schema'
import type { CatalogProduct } from '@/lib/catalog'

/**
 * The homepage runs three `HorizontalScroll` strips that are the same component with the
 * same layout, the same card and the same reveal — only `label` and `products` differ. That
 * makes the *contents* the entire difference between them, and nothing was enforcing it.
 *
 * Two defects this exists to remove, both measured on the static catalogue:
 *
 *   1. **Repeats.** The third strip was `getProductsByCollection('necklaces')`, computed
 *      independently of the first two and never compared against them. Two of its four cards
 *      were products the visitor had already scrolled past — `orbit-pendant-titanium`
 *      carrying its "Bestseller" badge in both places. 50% of a strip restating an earlier
 *      strip is the page saying the same thing twice with extra steps.
 *   2. **A label that was not true.** That same strip is titled TITANIUM, and contained
 *      `drop-pendant-surgical-steel` and `link-chain-niobium` — each rendering its own
 *      material line, 316L Surgical Steel and Niobium, directly under the word TITANIUM. It
 *      was a necklaces query wearing a materials label.
 *
 * Both are content-shaped rather than code-shaped, which is why no component test could see
 * them: every card rendered correctly. Only a question asked across two strips at once
 * catches it, so the question lives here as a pure function and is asserted in
 * `e2e/homepage-composition.spec.ts` against what actually renders.
 */

/**
 * Products of one material, in catalogue order, excluding anything already shown.
 *
 * `alreadyShown` is the whole point and the parameter most likely to be dropped as
 * redundant: without it this returns titanium bestsellers the visitor has already scrolled
 * past two strips ago. `src/tests/unit/homepage-composition-contract.test.ts` asserts the
 * homepage still passes it.
 *
 * **A note on what changed under this function.** It used to carry a justification for
 * filtering in memory rather than adding a Shopify query — material was not a Shopify-side
 * facet, it was parsed out of tags — and a contrast with `getBestsellers`/`getNewArrivals`,
 * which stayed server-side so their *ordering* came from Shopify's query rather than our
 * filter. None of that survives [ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md):
 * all three read the same seventeen in-memory records, and catalogue order is manifest order.
 * The function is unchanged; only the reason it is shaped this way is.
 */
export function stripByMaterial(
  catalogue: readonly CatalogProduct[],
  material: MaterialHandle,
  alreadyShown: readonly CatalogProduct[],
  limit = 8
): CatalogProduct[] {
  const seen = new Set(alreadyShown.map((product) => product.handle))
  return catalogue
    .filter((product) => product.material === material && !seen.has(product.handle))
    .slice(0, limit)
}

/**
 * The same strips with every product kept only where it first appears.
 *
 * ## Why this is not redundant with `stripByMaterial`
 *
 * `stripByMaterial` closes one direction — the material strip cannot repeat what the badge
 * strips already showed. This closes the general case: any strip against any other, whatever
 * produced them.
 *
 * The case it was *written* for no longer exists, and that is worth recording rather than
 * quietly leaving the docstring describing it. BESTSELLING and NEW ARRIVALS used to be two
 * independent Shopify queries, `tag:bestseller` and `tag:new`. A product carrying both tags
 * came back from both, and `badge` collapsed to one value with bestseller winning — so it
 * rendered the *same* "Bestseller" pill in two strips. That was `orbit-pendant-titanium`,
 * one data source over. It was also unobservable from E2E, because the static fallback the
 * mock store fell back to had a single scalar `badge` and could not reproduce it.
 *
 * After [ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md) the scalar `badge`
 * *is* the catalogue: `bestseller` and `new` are disjoint by construction and
 * `catalog-content.test.ts` asserts it directly, so those two strips can no longer collide
 * at all.
 *
 * It stays for the reason the guard was put in the code path rather than in an assertion:
 * the next strip is the one nobody has thought about yet — a curated list, a collection, a
 * second material — and the page's order is its priority order, so earlier strips win
 * without anyone having to decide again.
 */
export function dedupeInOrder<T extends { handle: string }>(
  strips: ReadonlyArray<readonly T[]>
): T[][] {
  const seen = new Set<string>()
  return strips.map((strip) => {
    const kept: T[] = []
    for (const item of strip) {
      // Also collapses a product repeated *within* one strip. The manifest cannot produce
      // that — `catalog-content.test.ts` asserts handles are unique — but a hand-curated
      // strip built by concatenating two lists can, and that is the kind of list a future
      // strip is most likely to be.
      if (seen.has(item.handle)) continue
      seen.add(item.handle)
      kept.push(item)
    }
    return kept
  })
}

/**
 * Handles appearing in more than one strip, with the strips that share them.
 *
 * Reported rather than silently de-duplicated, because which strip should lose a product is
 * an editorial decision and not one a helper should make quietly. `stripByMaterial` prevents
 * the case the homepage actually had; this is what the composition spec asserts against so a
 * future strip cannot reintroduce it unnoticed.
 */
export function duplicateAcrossStrips(
  strips: ReadonlyArray<{ label: string; products: readonly CatalogProduct[] }>
): Array<{ handle: string; labels: string[] }> {
  const places = new Map<string, string[]>()
  for (const strip of strips) {
    for (const product of strip.products) {
      const labels = places.get(product.handle) ?? []
      // A strip repeating a product *within itself* is a different defect; count each
      // strip once so this reports cross-strip repetition only.
      if (!labels.includes(strip.label)) labels.push(strip.label)
      places.set(product.handle, labels)
    }
  }
  return [...places.entries()]
    .filter(([, labels]) => labels.length > 1)
    .map(([handle, labels]) => ({ handle, labels }))
}

export default stripByMaterial
