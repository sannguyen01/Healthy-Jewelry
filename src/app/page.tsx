import type { HJSvgType } from '@/lib/svg/types'
import type { Metadata } from 'next'
import Nav from '@/components/layout/Nav'
import Footer from '@/components/layout/Footer'
import {
  Hero,
  HorizontalScroll,
  CollectionGrid,
  MaterialsSection,
  RealMoment,
  CareSection,
  FollowUp
} from '@/components/home'
import type { CollectionTile } from '@/components/home/CollectionGrid'
import {
  claimLines,
  claimText,
  getBestsellers,
  getNewArrivals,
  getAllProducts,
  getAllCollections,
} from '@/lib/catalog'
import { SITE_DEFAULT_TITLE } from '@/config/site'
import { dedupeInOrder } from '@/lib/utils/homepageStrips'

const SITE = { kind: 'site' } as const

export function generateMetadata(): Metadata {
  return {
    title: SITE_DEFAULT_TITLE,
    description:
      'Jewelry in Grade 23 titanium, anodized niobium and 316L surgical steel — rings, necklaces, earrings, bracelets and charms, each named by its exact specification.',
    openGraph: {
      title: SITE_DEFAULT_TITLE,
      description: `${claimText('brand-positioning', SITE)} No stones. No fillers. Pure material integrity.`,
      siteName: 'Healthy Jewelry',
      locale: 'en_US',
      type: 'website',
    },
  }
}

export default function HomePage() {
  const bestsellersRaw = getBestsellers()
  const newArrivalsRaw = getNewArrivals()
  const allProducts = getAllProducts()

  // 1. The metals. (MaterialsSection)
  // 2. A few pieces. Four to six reviewed items.
  const [bestsellers, newArrivals] = dedupeInOrder([bestsellersRaw, newArrivalsRaw])
  const curatedPieces = [...bestsellers, ...newArrivals].slice(0, 6)

  // 3. Explore by type. 5 clear category tiles.
  const collectionTiles: CollectionTile[] = getAllCollections().map((collection) => ({
    handle: collection.handle,
    title: collection.title,
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
        {/* 1. Hero */}
        <Hero headlineLines={claimLines('brand-positioning', SITE)} />
        
        {/* 2. The metals */}
        <MaterialsSection />
        
        {/* 3. A few pieces (4-6 items) */}
        <HorizontalScroll label="CURATED PIECES" products={curatedPieces} />
        
        {/* 4. Explore by type */}
        <CollectionGrid tiles={collectionTiles} />
        
        {/* 5. The moment */}
        <RealMoment />
        
        {/* 6. Reviewed care */}
        <CareSection />
        
        {/* 7. Continue the encounter */}
        <FollowUp />
      </main>
      <Footer />
    </>
  )
}
