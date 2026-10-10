import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/config/site'
import { buildStamp } from '@/config/build-info'
import { ConsentBanner } from '@/components/layout/ConsentBanner'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'

/**
 * **The original pair, self-hosted** (ADR 052): Barlow Condensed for the display voice and the brand
 * name, DM Sans for everything else. It is the typography the brand had before the Songmont
 * reference (ADR 043) and before the Quiet Archive's first trial of three voices (ADR 051), which
 * the owner set aside on 2026-10-09: the design stays, the typography goes back. Provenance,
 * licence and hashes for every file: `src/app/fonts/README.md`.
 *
 * - **Barlow Condensed, 400 and 500** (`--font-display`, `--font-brand`): headings, page titles,
 *   piece and collection names, the menu's links and the logotype, set in tracked capitals. The
 *   500 is the display weight; the 400 is the footer's name (ADR 048).
 * - **DM Sans, 300 and 500** (`--font-body`, `--font-ui`): running text at 300, as it always was,
 *   and every label, control and badge at 500. There is no 400 file and nothing asks for one:
 *   `typography-weights.test.ts` fails on a weight these files are not, because a weight with no
 *   face is not ignored, it is faked.
 *
 * Each file is a *fixed instance* of a variable family, as Google Fonts serves them through `css2`
 * (`opsz,wght@14,300`): static, one weight, latin slice only, about 14 KB. Only the characters the
 * slice draws: `e2e/glyph-coverage.spec.ts` fails on any other, since a missing glyph silently
 * renders in the fallback face. `font-files.test.ts` reads each file's own tables to hold the
 * weights declared here to the weights the files are.
 *
 * **Fallback names are written into the CSS unquoted**, so a name with a digit in it ("Bodoni 72")
 * is not an identifier sequence and invalidates the whole `font-family` list at computed-value
 * time: every `var(--font-display)` then computes to `unset` and the heading inherits the body's
 * face, silently, with nothing in the stylesheet to say so (measured 2026-10-09). Every name below
 * is plain identifiers; `typography-weights.test.ts` holds that, and `rendered-fonts.spec.ts`
 * holds each role to its face.
 *
 * Everything is preloaded: the bar and the hero need both families on the first paint, and the
 * total is smaller than the pair it replaces.
 */
const barlowCondensed = localFont({
  src: [
    { path: './fonts/barlow-condensed-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/barlow-condensed-latin-500.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-bc',
  fallback: ['Arial Narrow', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

const dmSans = localFont({
  src: [
    { path: './fonts/dm-sans-9pt-latin-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/dm-sans-9pt-latin-500.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-dm',
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
  themeColor: '#FAF9F5',
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
      // A script in the body writes one custom property on this element before the first paint
      // (CONSENT_PREPAINT_SCRIPT), which React did not render.
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={[barlowCondensed, dmSans].map((f) => f.variable).join(' ')}
      style={
        {
          '--font-display': 'var(--font-bc, "Barlow Condensed", "Arial Narrow", sans-serif)',
          '--font-body': 'var(--font-dm, "DM Sans", sans-serif)',
          '--font-ui': 'var(--font-dm, "DM Sans", sans-serif)',
          '--font-brand': 'var(--font-bc, "Barlow Condensed", "Arial Narrow", sans-serif)',
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
        {/*
          Before anything the hero is part of is painted: when nobody has answered the consent notice, reserve the
          room it will take, so the hero's copy does not move when the notice arrives after hydration. A fixed,
          static string (no user input), read from consent.ts, the same file that decides who is asked.
        */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_PREPAINT_SCRIPT }} />
        {/* WCAG 2.4.1: the first stop of every page, off screen until it takes focus. */}
        <a href="#main" className="btn-primary hj-skip">
          Skip to content
        </a>
        {children}
        {/* Asks once, then never again. Nothing is measured until it is answered. */}
        <ConsentBanner />
      </body>
    </html>
  )
}
