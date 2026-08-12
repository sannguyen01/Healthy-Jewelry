import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, DM_Sans } from 'next/font/google'
import './globals.css'
import { CartProvider } from '@/store/cart'
import { SITE_URL } from '@/config/site'
import { buildStamp } from '@/config/build-info'
import { ConsentBanner } from '@/components/layout/ConsentBanner'

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
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Healthy Jewelry',
    title: 'Healthy Jewelry — Implant-Grade Titanium',
    description:
      'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic. Corrosion-proof. Built to last.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthy Jewelry — Implant-Grade Titanium',
    description:
      'Implant-grade titanium, niobium, and 316L surgical steel jewelry. Hypoallergenic. Corrosion-proof.',
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
      data-scroll-behavior="smooth"
      className={`${barlowCondensed.variable} ${dmSans.variable}`}
      style={
        {
          '--font-display': 'var(--font-bc, "Barlow Condensed", sans-serif)',
          '--font-ui': 'var(--font-dm, "DM Sans", sans-serif)',
          '--font-body': 'var(--font-dm, "DM Sans", sans-serif)',
        } as React.CSSProperties
      }
    >
      <head>
        {/*
          Which commit, which environment, when built, and a fingerprint of the
          inlined NEXT_PUBLIC_* values — readable with "view source" on any
          device, no tooling. `/api/version` carries the same facts plus the
          stale-bundle comparison; this exists because runbook step 5 happens on
          a real phone, where running a script is not an option.

          Public by construction: the commit is in a public repo and the
          fingerprint's inputs are already shipped to the browser in plain text.
        */}
        <meta name="hj-build" content={buildStamp()} />
      </head>
      <body>
        <CartProvider>{children}</CartProvider>
        {/* Asks once, then never again. Nothing is measured until it is answered. */}
        <ConsentBanner />
      </body>
    </html>
  )
}
