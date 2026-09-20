import type { HJSvgType } from '@/lib/svg/types'
import type { Metadata } from 'next'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import {
  Hero,
  HorizontalScroll,
  CampaignBand,
  CollectionGrid,
  MaterialsSection,
} from '@/components/home'
import type { CollectionTile } from '@/components/home/CollectionGrid'
import { getBestsellers, getNewArrivals, getAllProducts, getAllCollections } from '@/lib/catalog'
import { dedupeInOrder, stripByMaterial } from '@/lib/utils/homepageStrips'

export const metadata: Metadata = {
  title: 'Healthy Jewelry — Implant-Grade Titanium',
  description:
    'Premium jewelry in Grade 23 titanium, niobium, and 316L surgical steel. Hypoallergenic, biocompatible, built for people with metal sensitivities.',
  openGraph: {
    title: 'Healthy Jewelry — Implant-Grade Titanium',
    description: 'Metal that works with your body. No stones. No fillers. Pure material integrity.',
    siteName: 'Healthy Jewelry',
    locale: 'en_US',
    type: 'website',
  },
}

/**
 * **Synchronous, because there is nothing left to await.**
 *
 * This function was `async`, and every accessor below was awaited inside a `Promise.all`.
 * That shape existed because each one was a Shopify Storefront query, and the block of
 * commentary it carried was about a *fetch budget*: five `getProductsByCollection` calls
 * to read five `svgType` values, one query per collection, growing by one with every
 * collection added.
 *
 * The catalogue is seventeen validated records in memory now ([ADR 034](../../docs/adr/034-the-catalogue-is-the-source.md)),
 * so there is no round trip to count and no ordering held on a server to defer to. Keeping
 * the `await`s would have cost nothing at runtime and misled every reader about where this
 * data comes from — which is the failure `e2e/retired-routes.spec.ts` and ADR 033 are both
 * about, one layer up.
 *
 * What the old comment protected is still real and has moved to
 * `src/tests/unit/homepage-composition-contract.test.ts`: the page composes **three**
 * strips and derives the tiles from **one** catalogue read, and a strip disappearing is how
 * a section goes missing with nothing failing.
 */
export default function HomePage() {
  const bestsellersRaw = getBestsellers()
  const newArrivalsRaw = getNewArrivals()
  const allProducts = getAllProducts()

  /**
   * Earlier strips win a product that would appear in two.
   *
   * The reason this guard exists has changed and it is worth being exact, because the old
   * comment here claimed something that is no longer true. It used to say BESTSELLING and
   * NEW ARRIVALS were two independent Shopify queries (`tag:bestseller` and `tag:new`), so
   * a doubly-tagged product was returned by both and rendered the same "Bestseller" pill
   * twice — a case no test running against a mock store could observe.
   *
   * There are no tags and no queries. `badge` is one scalar field on the record and
   * `bestseller` and `new` are disjoint by construction, which `catalog-content.test.ts`
   * asserts directly. So this can no longer fire between these two strips at all.
   *
   * It stays because the third strip is a different question: TITANIUM is a material
   * filter over the same catalogue, and a titanium bestseller is in both sets. That is
   * handled by passing `alreadyShown` to `stripByMaterial` below; `dedupeInOrder` is the
   * belt to that braces, and the place a fourth strip — a curated list, a collection —
   * would be caught the day somebody adds one.
   */
  const [bestsellers, newArrivals] = dedupeInOrder([bestsellersRaw, newArrivalsRaw])

  // The third strip is titled TITANIUM, so it holds titanium — it used to hold
  // `getProductsByCollection('necklaces')`, which put a 316L steel pendant and a niobium
  // chain under that heading, each rendering its own contradicting material line. It also
  // repeated two of the four cards from the strips above it, because the three lists were
  // computed independently and never compared. See `stripByMaterial` for both.
  const titanium = stripByMaterial(allProducts, 'titanium', [...bestsellers, ...newArrivals])

  // Resolved here because `CollectionGrid` is a client component. `getAllCollections()` is
  // site structure — five fixed routes — not catalogue data.
  const collectionTiles: CollectionTile[] = getAllCollections().map((collection) => ({
    handle: collection.handle,
    title: collection.title,
    // The tile borrows the illustration of a product in that collection. Reads through
    // the media union now, and takes it only from a product that actually has a chosen
    // illustration — `illustration-pending` means nobody has decided what that piece
    // looks like, and a tile is the wrong place to guess on its behalf.
    svgType: (() => {
      const illustrated = allProducts.find(
        (p) => p.collection === collection.handle && p.media.kind === 'illustration'
      )
      return illustrated?.media.kind === 'illustration'
        ? (illustrated.media.svgType as HJSvgType)
        : null
    })(),
  }))

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HorizontalScroll label="BESTSELLING" products={bestsellers} />
        <CampaignBand />
        <HorizontalScroll label="NEW ARRIVALS" products={newArrivals} />
        <CollectionGrid tiles={collectionTiles} />
        {/* `viewAllHref` stays defaulted to /shop. All three strips pointing at the same
            destination is a real weakness, but /shop takes no material or badge param —
            its filter is client-side — so a /shop?material=titanium link would promise a
            filter it would not apply. Fixing it properly means teaching /shop to read
            searchParams, which is its own change, not a rider on this one. */}
        <HorizontalScroll label="TITANIUM" products={titanium} />
        <MaterialsSection />
      </main>
      <Footer />
    </>
  )
}
