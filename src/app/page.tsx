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
import {
  getBestsellers,
  getNewArrivals,
  getProducts,
  getProductsByCollection,
} from '@/lib/shopify'
import { hjCollections } from '@/lib/data/hj-data'

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
  const [bestsellers, newArrivals, titaniumNecklaces, allProducts] = await Promise.all([
    getBestsellers(),
    getNewArrivals(),
    getProductsByCollection('necklaces'),
    getProducts(),
  ])

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
        <HorizontalScroll label="TITANIUM" products={titaniumNecklaces} />
        <MaterialsSection />
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
