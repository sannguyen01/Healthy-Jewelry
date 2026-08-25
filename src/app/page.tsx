import type { Metadata } from 'next'
import Nav from '@/components/layout/Nav'
import CartDrawer from '@/components/layout/CartDrawer'
import Footer from '@/components/layout/Footer'
import {
  Hero,
  HorizontalScroll,
  CampaignBand,
  CollectionGrid,
  MaterialsSection,
} from '@/components/home'
import type { CollectionTile } from '@/components/home/CollectionGrid'
import { getBestsellers, getNewArrivals, getProducts } from '@/lib/shopify'
import { hjCollections } from '@/lib/data/hj-data'
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

export default async function HomePage() {
  // Four fetches, and it stays four however many collections exist.
  //
  // The tiles used to issue one `getProductsByCollection` per collection — five full
  // collection queries to read five `svgType` values, growing by one query per collection
  // added. One `getProducts()` returns the whole catalogue (22 products, `maxItems` 250)
  // with `collection` on each, so the tiles are a grouping rather than a round trip.
  //
  // Worth being accurate about the stakes: this page is statically prerendered with
  // `revalidate: 3600`, so these run at build and hourly revalidation, never per request —
  // and server components call the Storefront API directly, not through the rate-limited
  // `/api/shopify` proxy, which only `src/store/cart.tsx` uses. The fix is for the linear
  // scaling, not for a per-request cost that does not exist.
  //
  // `getBestsellers` and `getNewArrivals` stay Shopify-side queries: deriving them from the
  // catalogue would move their ordering from Shopify's query to our filter.
  const [rawBestsellers, rawNewArrivals, allProducts] = await Promise.all([
    getBestsellers(),
    getNewArrivals(),
    getProducts(),
  ])

  // The first two strips are two independent Shopify queries — `tag:bestseller` and
  // `tag:new` — so a product carrying both tags is returned by both and renders in both,
  // showing the same "Bestseller" pill each time (badge collapses to one value, bestseller
  // winning). The static fallback cannot reproduce that, because its `badge` is a single
  // scalar and the two filters are disjoint by construction — so no test running against
  // mock.myshopify.com can see it. Guarded here rather than only asserted.
  const [bestsellers, newArrivals] = dedupeInOrder([rawBestsellers, rawNewArrivals])

  // The third strip is titled TITANIUM, so it holds titanium — it used to hold
  // `getProductsByCollection('necklaces')`, which put a 316L steel pendant and a niobium
  // chain under that heading, each rendering its own contradicting material line. It also
  // repeated two of the four cards from the strips above it, because the three lists were
  // computed independently and never compared. See `stripByMaterial` for both.
  //
  // Derived from `allProducts` rather than a fourth query: material is parsed from tags,
  // not a Shopify-side facet, so there is no server ordering to defer to — and the fetch
  // budget stays at three, one below what `homepage-fetch-budget.test.ts` allows.
  const titanium = stripByMaterial(allProducts, 'titanium', [...bestsellers, ...newArrivals])

  // Resolved here because `CollectionGrid` is a client component and cannot await Shopify.
  // `hjCollections` is site structure — five fixed routes — not catalogue data.
  const collectionTiles: CollectionTile[] = hjCollections.map((collection) => ({
    handle: collection.handle,
    title: collection.title,
    svgType: allProducts.find((p) => p.collection === collection.handle)?.svgType ?? null,
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
      <CartDrawer />
    </>
  )
}
