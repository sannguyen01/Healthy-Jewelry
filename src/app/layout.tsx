import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/config/site'
import { buildStamp } from '@/config/build-info'
import { ConsentBanner } from '@/components/layout/ConsentBanner'

/**
 * One family for every role — display, UI and body — because Songmont's identity sets
 * everything in one: the FW Tsukiji Gothic family (DESIGN.md, "Reference: Songmont"). Zen Kaku
 * Gothic Antique is its closest openly licensed relative, an antique gothic with the same
 * classical, brush-softened strokes.
 *
 * Self-hosted, and only the *latin* slice: Google serves this CJK family as 121 slices per
 * weight, and `next/font/google` downloads every one of them at build time to serve the one
 * a Latin page uses. The two files here are 9.7 KB each. There is no 300: weight numbers do
 * not carry between families, and this one's 300 carries about half the ink DM Sans 300 did
 * (globals.css, `body`), so the 300 role became 400. The characters they cover are the
 * characters the site may render — `e2e/glyph-coverage.spec.ts` fails on any other, since a
 * missing glyph silently renders in the fallback face. Provenance and licence:
 * `src/app/fonts/README.md`; `font-files.test.ts` reads each file's own tables to hold the
 * weights declared here to the weights the files actually are.
 */
const zenKakuGothicAntique = localFont({
  src: [
    { path: './fonts/zen-kaku-gothic-antique-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/zen-kaku-gothic-antique-latin-500.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-zk',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
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
    template: `%s — ${SITE_NAME}`,
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
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
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
  themeColor: '#F3F2EC',
}

/**
 * **Every page re-renders at most an hour after it was built** — because every page renders a
 * claim (the Footer's positioning line), and a claim's approval can expire with no commit.
 * Without this, all 37 prerendered routes had no revalidation at all and an expired approval
 * stayed served until somebody redeployed (`CLAIM_WITHDRAWAL_BOUND_SECONDS` in
 * `src/lib/catalog/claims-schema.ts` has the measurement). A literal because Next reads segment
 * config statically; `claim-expiry.test.ts` holds it equal to that constant.
 */
export const revalidate = 3600

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={zenKakuGothicAntique.variable}
      style={
        {
          '--font-display': 'var(--font-zk, "Zen Kaku Gothic Antique", sans-serif)',
          '--font-ui': 'var(--font-zk, "Zen Kaku Gothic Antique", sans-serif)',
          '--font-body': 'var(--font-zk, "Zen Kaku Gothic Antique", sans-serif)',
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
