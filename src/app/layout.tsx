import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/config/site'
import { buildStamp } from '@/config/build-info'
import { ConsentBanner } from '@/components/layout/ConsentBanner'

/**
 * **Three voices, four loaders** — the Quiet Archive system (ADR 051): Bodoni Moda speaks, DM Sans
 * explains, Barlow Condensed labels, and the brand name keeps the label voice it was already set
 * in (ADR 048). Provenance, licence and hashes for every file: `src/app/fonts/README.md`.
 *
 * Each file is a *fixed instance* of a variable family, as Google Fonts serves them through
 * `css2` (`opsz,wght@96,400`): static, one weight, latin slice only, about 14 KB. The variable
 * files are 45 KB (Bodoni Moda) and 61 KB (DM Sans) and would ship axes the site never sets. The
 * price of static instances is that an optical size is a *file*, so Bodoni Moda is two loaders:
 * the 96pt cut for display sizes, where its hairlines are meant to be fine, and the 24pt cut for
 * names and titles, where the same hairlines would break up. Which cut a rule uses is a function
 * of its size token, and `typography-weights.test.ts` holds every `--font-display` use to the
 * large tokens and every `--font-title` use to the small ones.
 *
 * Only the latin slice, and only the characters it draws: `e2e/glyph-coverage.spec.ts` fails on
 * any other, since a missing glyph silently renders in the fallback face. `font-files.test.ts`
 * reads each file's own tables to hold the weights declared here to the weights the files are.
 *
 * **Fallback names are written into the CSS unquoted**, so a name with a digit in it ("Bodoni 72")
 * is not an identifier sequence and invalidates the whole `font-family` list at computed-value
 * time. Every `var(--font-display)` then computes to `unset` and the heading inherits the body's
 * face, silently and with nothing in the stylesheet to say so (ADR 051). Every name below is plain
 * identifiers; `typography-weights.test.ts` holds that, and `rendered-fonts.spec.ts` holds each
 * role to its voice.
 *
 * What is preloaded is what the first paint needs: the 96pt display cut (the hero), DM Sans
 * (all running text) and Barlow Condensed (the bar and every label). The 24pt cut loads when a
 * name or a title is laid out. `preload` is per call, not per file, which is why the lighter
 * DM Sans weight is a call of its own.
 */
const bodoniDisplay = localFont({
  src: [{ path: './fonts/bodoni-moda-96pt-latin-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  variable: '--font-bm96',
  fallback: ['Didot', 'Georgia', 'serif'],
})

const bodoniTitle = localFont({
  src: [{ path: './fonts/bodoni-moda-24pt-latin-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-bm24',
  fallback: ['Didot', 'Georgia', 'serif'],
})

const dmSans = localFont({
  src: [{ path: './fonts/dm-sans-9pt-latin-400.woff2', weight: '400', style: 'normal' }],
  display: 'swap',
  variable: '--font-dm',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
})

/** The one emphasis weight (`strong`, `b`, `th`): its own call so that it is not preloaded. */
const dmSansMedium = localFont({
  src: [{ path: './fonts/dm-sans-9pt-latin-500.woff2', weight: '500', style: 'normal' }],
  display: 'swap',
  preload: false,
  variable: '--font-dm500',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
})

/**
 * **The label voice, and the brand name's own face.** The owner's ruling (2026-10-04, ADR 048)
 * kept the name in the typography it had before the Songmont reference: Barlow Condensed, 500 in
 * the header and 400 in the footer, in tracked capitals. The Quiet Archive system sets its labels
 * in the same voice (ADR 051 widens the ruling), so `--font-ui` and `--font-brand` now name one
 * face. They stay two tokens because they name two *roles*: `typography-weights.test.ts` fails if
 * `--font-brand` reaches any rule but the logotype's.
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
      data-scroll-behavior="smooth"
      className={[bodoniDisplay, bodoniTitle, dmSans, dmSansMedium, barlowCondensed].map((f) => f.variable).join(' ')}
      style={
        {
          '--font-display': 'var(--font-bm96, "Bodoni Moda", "Didot", serif)',
          '--font-title': 'var(--font-bm24, "Bodoni Moda", "Didot", serif)',
          '--font-body': 'var(--font-dm, "DM Sans", sans-serif)',
          '--font-body-medium': 'var(--font-dm500, "DM Sans", sans-serif)',
          '--font-ui': 'var(--font-bc, "Barlow Condensed", "Arial Narrow", sans-serif)',
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
        {children}
        {/* Asks once, then never again. Nothing is measured until it is answered. */}
        <ConsentBanner />
      </body>
    </html>
  )
}
