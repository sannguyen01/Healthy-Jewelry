import type { HJMaterialHandle, HJProduct } from '@/lib/shopify/types'

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
 * Filtering the already-fetched catalogue rather than adding a query is deliberate: material
 * is not a Shopify-side facet — it is parsed from tags by `parseMaterial` — so there is no
 * server query to defer to, and `src/tests/unit/homepage-fetch-budget.test.ts` pins the
 * homepage at four fetches.
 *
 * The contrast with `getBestsellers`/`getNewArrivals` is intentional and worth stating: those
 * stay Shopify-side queries because deriving them here would move their *ordering* from
 * Shopify's query into our filter. A material strip has no such ordering to lose.
 */
export function stripByMaterial(
  catalogue: readonly HJProduct[],
  material: HJMaterialHandle,
  alreadyShown: readonly HJProduct[],
  limit = 8
): HJProduct[] {
  const seen = new Set(alreadyShown.map((product) => product.handle))
  return catalogue
    .filter((product) => product.material === material && !seen.has(product.handle))
    .slice(0, limit)
}

/**
 * The same strips with every product kept only where it first appears.
 *
 * `stripByMaterial` closes the duplication the *static* catalogue could produce. It does not
 * close the one the live store can, and the difference is worth spelling out because it is
 * invisible to every test in this repo:
 *
 *   - The first two strips come from two independent Shopify queries, `tag:bestseller` and
 *     `tag:new` (`GET_BESTSELLERS` / `GET_NEW_ARRIVALS`). A product carrying both tags is
 *     returned by both, so it renders in both strips — and `badge` collapses to a single
 *     value with bestseller winning (`src/lib/shopify/index.ts`), so it shows the *same*
 *     "Bestseller" pill in both places. Precisely the `orbit-pendant-titanium` defect, one
 *     data source over.
 *   - On the static fallback that cannot happen: `badge` is one scalar field, so
 *     `badge === 'Bestseller'` and `badge === 'New'` are disjoint by construction. Which
 *     means `e2e/homepage-composition.spec.ts` — running against `mock.myshopify.com` — can
 *     never observe this case, however carefully it asks.
 *
 * So the fixture proves the parts and cannot prove the whole, which is the failure this
 * whole change is about. The guard therefore lives in the code path rather than only in the
 * assertion: earlier strips win, because the page's order is its priority order.
 */
export function dedupeInOrder<T extends { handle: string }>(
  strips: ReadonlyArray<readonly T[]>
): T[][] {
  const seen = new Set<string>()
  return strips.map((strip) => {
    const kept: T[] = []
    for (const item of strip) {
      // Also collapses a product repeated *within* one strip, which a paginated or
      // hand-curated Shopify collection can produce on its own.
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
  strips: ReadonlyArray<{ label: string; products: readonly HJProduct[] }>
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
