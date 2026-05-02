import type { Metadata } from 'next'
import Nav from '@/components/layout/Nav'
import CartDrawer from '@/components/layout/CartDrawer'
import Footer from '@/components/layout/Footer'
import { Hero, HorizontalScroll, CampaignBand, CollectionGrid, MaterialsSection } from '@/components/home'
import { getBestsellers, getNewArrivals, getProductsByCollection } from '@/lib/data/hj-data'

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

export default function HomePage() {
  const bestsellers = getBestsellers()
  const newArrivals = getNewArrivals()
  const titaniumNecklaces = getProductsByCollection('necklaces')

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HorizontalScroll label="BESTSELLING" products={bestsellers} />
        <CampaignBand />
        <HorizontalScroll label="NEW ARRIVALS" products={newArrivals} />
        <CollectionGrid />
        <HorizontalScroll label="TITANIUM" products={titaniumNecklaces} />
        <MaterialsSection />
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
