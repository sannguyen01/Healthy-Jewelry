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
import { getBestsellers, getNewArrivals, getProductsByCollection } from '@/lib/shopify'
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
  const [bestsellers, newArrivals, titaniumNecklaces, collectionTiles] = await Promise.all([
    getBestsellers(),
    getNewArrivals(),
    getProductsByCollection('necklaces'),
    // Resolved here because `CollectionGrid` is a client component and cannot
    // await Shopify. It previously read the static catalogue directly, so the
    // tile illustrations came from the bundled fixture rather than the store.
    // `hjCollections` is site structure — five fixed routes — not catalogue
    // data, so it stays.
    Promise.all(
      hjCollections.map(async (collection): Promise<CollectionTile> => {
        const products = await getProductsByCollection(collection.handle)
        return {
          handle: collection.handle,
          title: collection.title,
          svgType: products[0]?.svgType ?? null,
        }
      })
    ),
  ])

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
