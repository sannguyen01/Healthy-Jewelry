import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, DM_Sans } from 'next/font/google'
import './globals.css'
import { CartProvider } from '@/store/cart'

const barlowCondensed = Barlow_Condensed({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bc',
})

const dmSans = DM_Sans({
  weight: ['300', '400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${dmSans.variable}`}
      style={
        {
          '--font-display': 'var(--font-bc, "Barlow Condensed", sans-serif)',
          '--font-ui': 'var(--font-bc, "Barlow Condensed", sans-serif)',
          '--font-body': 'var(--font-dm, "DM Sans", sans-serif)',
        } as React.CSSProperties
      }
    >
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  )
}
