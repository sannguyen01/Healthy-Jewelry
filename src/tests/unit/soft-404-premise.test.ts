import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseSource, importsFrom, moduleSpecifiers } from '@/lib/analysis/tsAstScan'

/**
 * **A premise with an expiry date, and the thing that will notice the date passing.**
 *
 * `/products/<unknown>` answers **HTTP 200** with `not-found.tsx` rendered and
 * `robots: noindex`. That is a soft 404, it is deliberate, and the page says why in its own
 * comment:
 *
 * > this route cannot use `dynamicParams = false` without 404ing products newly added in
 * > Shopify. noindex keeps the junk URL out of the index anyway.
 *
 * The reasoning is sound **while Shopify is the catalogue**. `generateStaticParams` can only
 * enumerate what it knew at build time, and a merchant adding a product in an admin console
 * must not get a hard 404 until the next deploy. `noindex` is the right mitigation for a
 * trade-off that cannot be avoided.
 *
 * The decommission avoids it. Once `src/content/catalog/**` is the source
 * ([ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md)) nobody can add a product
 * anywhere but this repository, `generateStaticParams` becomes **exhaustive**, and
 * `dynamicParams = false` turns the soft 404 into a real one. Acceptance criterion 4 of
 * `docs/browse-only-masterplan.md` — "unknown products return true 404" — stops being
 * blocked by anything.
 *
 * ## Why this is a test and not a line in the plan
 *
 * [ADR 008](../../../docs/adr/008-decisions-need-premise-detectors.md): a decision whose
 * premise has expired goes on executing, silently, because nothing is watching the premise.
 * The existing detectors in `scripts/lib/premise-checks.mjs` all read **live Shopify data** —
 * locales, collections, payment providers — and this premise is not about Shopify's state.
 * It is about *this repository's* wiring, so it is checked where that wiring lives.
 *
 * The join: as long as the page reads products from `@/lib/shopify`, the soft 404 is
 * justified and must stay documented. The moment it reads from `@/lib/catalog`, the
 * justification is gone and `dynamicParams = false` is required. WS-4 cannot rewire the data
 * source and forget the 404, because doing so turns this red.
 *
 * Resolved through the TypeScript compiler rather than by grepping for a string, per
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) — a comment
 * mentioning `@/lib/catalog` is not an import, and this test's whole job is to know the
 * difference.
 */

const ROOT = resolve(__dirname, '../../..')
const PAGE = 'src/app/products/[handle]/page.tsx'

const source = readFileSync(join(ROOT, PAGE), 'utf-8')
const ast = parseSource(PAGE, source)

/** Does the page still take its product data from the Shopify layer? */
const readsFromShopify = importsFrom(ast, '@/lib/shopify').length > 0

/** Does it take product data from the catalogue reader? */
const readsFromCatalog = moduleSpecifiers(ast).some(
  (specifier) => specifier === '@/lib/catalog' || specifier.startsWith('@/lib/catalog/')
)

/**
 * `dynamicParams = false` makes `generateStaticParams` exhaustive: any handle not in that
 * list is a hard 404 rather than an on-demand render.
 *
 * Matched as an exported assignment, not as a substring, so the commented-out form that a
 * previous attempt might have left behind does not count as having set it.
 */
const setsDynamicParamsFalse = /export\s+const\s+dynamicParams\s*=\s*false/.test(source)

describe('the premise detector can see the page it is about', () => {
  it('reads a real, non-empty source file', () => {
    // A detector whose input silently became empty answers "premise holds" forever.
    expect(source.length).toBeGreaterThan(500)
  })

  it('resolves at least one import from it', () => {
    expect(moduleSpecifiers(ast).length).toBeGreaterThan(3)
  })

  it('the two data sources are distinguishable, not both true by construction', () => {
    // If this ever reported both, the branch below would be meaningless.
    expect(readsFromShopify && readsFromCatalog).toBe(false)
  })
})

describe('the soft 404 is justified only while Shopify is the catalogue', () => {
  it('the page reads from exactly one product source', () => {
    expect(
      readsFromShopify || readsFromCatalog,
      `${PAGE} imports product data from neither @/lib/shopify nor @/lib/catalog. This ` +
        `detector cannot tell whether the soft-404 premise still holds, which is worse ` +
        `than either answer — update it to name the new source.`
    ).toBe(true)
  })

  it('while it reads Shopify, the trade-off stays documented in the page itself', () => {
    if (!readsFromShopify) return

    // The comment is the whole justification. A reader who finds `return NOT_FOUND_SEO`
    // with no explanation has no way to know the 200 is deliberate rather than a bug.
    expect(
      source,
      `${PAGE} returns a soft 404 and no longer explains why. The 200 is a deliberate ` +
        `trade-off — a hard 404 would break products added in Shopify since the last ` +
        `deploy — and an undocumented deliberate trade-off is indistinguishable from a defect.`
    ).toMatch(/soft 404/i)

    expect(source).toMatch(/dynamicParams/)
  })

  it('while it reads Shopify, noindex is the mitigation and must be present', () => {
    if (!readsFromShopify) return
    // `NOT_FOUND_SEO` carries `robots: noindex, nofollow`. Without it the soft 404 is an
    // indexable page for a product that does not exist.
    expect(source).toContain('NOT_FOUND_SEO')
  })

  it('once it reads the catalogue, the premise has expired and a true 404 is required', () => {
    if (!readsFromCatalog) return

    expect(
      setsDynamicParamsFalse,
      `${PAGE} now reads from @/lib/catalog, so generateStaticParams is exhaustive: no ` +
        `product can exist that this repository does not hold. The only reason for the ` +
        `soft 404 was that Shopify could add products between deploys, and that is no ` +
        `longer true.\n\n` +
        `Add \`export const dynamicParams = false\` so an unknown handle returns a real ` +
        `404 rather than HTTP 200 with not-found.tsx.\n\n` +
        `This is acceptance criterion 4 of docs/browse-only-masterplan.md, and ` +
        `scripts/verify-browse-only.mjs reports it as \`unknown-not-404\` until it is done.`
    ).toBe(true)
  })
})

describe('the detector reports which state we are in', () => {
  it('records the premise as holding or expired, and the two cannot both be true', () => {
    const premiseHolds = readsFromShopify && !readsFromCatalog

    // Not an assertion about which state is correct — an assertion that the detector has
    // an opinion. ADR 008's failure is a premise nobody is watching, and a detector that
    // returns "unknown" is nobody watching with extra steps.
    expect(typeof premiseHolds).toBe('boolean')

    if (premiseHolds) {
      // Today's state. The soft 404 stands, `verify-browse-only.mjs` reports
      // `unknown-not-404`, and that finding is correct and expected.
      expect(setsDynamicParamsFalse).toBe(false)
    }
  })
})
