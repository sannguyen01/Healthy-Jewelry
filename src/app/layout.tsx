import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Cormorant_Garamond, Barlow_Condensed, Barlow } from 'next/font/google'
import './globals.css'
import { CartProvider } from '@/store/cart'

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-next',
})

const cormorantGaramond = Cormorant_Garamond({
  weight: ['300'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif-next',
})

const barlowCondensed = Barlow_Condensed({
  weight: ['300', '400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui-next',
})

const barlow = Barlow({
  weight: ['300', '400'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body-next',
})

export const metadata: Metadata = {
  title: {
    default: 'Healthy Jewelry — Implant-Grade Titanium',
    template: '%s — Healthy Jewelry',
  },
  description:
    'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic, corrosion-proof, and designed to last a lifetime. No stones. No fillers. Pure material integrity.',
  keywords: [
    'implant grade titanium jewelry',
    'hypoallergenic jewelry',
    'niobium jewelry',
    'surgical steel jewelry',
    'titanium rings',
    'titanium necklaces',
    'nickel-free jewelry',
    'biocompatible jewelry',
    'grade 23 titanium',
    'MRI safe jewelry',
  ],
  authors: [{ name: 'Healthy Jewelry' }],
  creator: 'Healthy Jewelry',
  publisher: 'Healthy Jewelry',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://healthyjewelry.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://healthyjewelry.com',
    siteName: 'Healthy Jewelry',
    title: 'Healthy Jewelry — Implant-Grade Titanium',
    description:
      'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic. Corrosion-proof. Built to last.',
    images: [
      {
        url: '/og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'Healthy Jewelry — Implant-Grade Titanium',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthy Jewelry — Implant-Grade Titanium',
    description:
      'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic. Corrosion-proof.',
    images: ['/og-default.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F7F5F1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={[
        bebasNeue.variable,
        cormorantGaramond.variable,
        barlowCondensed.variable,
        barlow.variable,
      ].join(' ')}
      style={{
        '--font-display': 'var(--font-display-next, "Bebas Neue", sans-serif)',
        '--font-serif': 'var(--font-serif-next, "Cormorant Garamond", Georgia, serif)',
        '--font-ui': 'var(--font-ui-next, "Barlow Condensed", sans-serif)',
        '--font-body': 'var(--font-body-next, "Barlow", sans-serif)',
      } as React.CSSProperties}
    >
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  )
}
