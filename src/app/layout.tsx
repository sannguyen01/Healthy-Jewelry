import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, DM_Sans } from 'next/font/google'
import './globals.css'
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_URL } from '@/config/site'
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

/**
 * Site-wide metadata: what a search result, a browser tab and a shared link say first.
 *
 * Until 2026-09-26 this published "Implant-grade … Hypoallergenic, corrosion-proof, and
 * designed to last a lifetime" as the default description, and asked search engines to rank
 * the brand for "hypoallergenic jewelry", "nickel-free jewelry", "biocompatible jewelry" and
 * "MRI safe jewelry". A keyword is a claim addressed to a search engine: it asks to be shown
 * to people looking for exactly that property. Every one of those is now a pending claim in
 * the registry, so every one leaves here; the keywords that remain name materials and
 * pieces, which is what the brand can say without a document.
 *
 * Plain strings, and the default description and title come from `@/config/site` so there
 * is one statement of each (see the note there on why they are not registry claims).
 */
export const metadata: Metadata = {
  title: {
    default: SITE_DEFAULT_TITLE,
    template: '%s — Healthy Jewelry',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'grade 23 titanium jewelry',
    'titanium jewelry',
    'niobium jewelry',
    'anodized niobium jewelry',
    'surgical steel jewelry',
    '316L steel jewelry',
    'titanium rings',
    'titanium necklaces',
    'grade 23 titanium',
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
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
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
        {children}
        {/* Asks once, then never again. Nothing is measured until it is answered. */}
        <ConsentBanner />
      </body>
    </html>
  )
}
