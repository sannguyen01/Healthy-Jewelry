import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { getProductByHandle } from '@/lib/catalog'
import { productSeo } from '@/lib/seo/productSeo'
import { SITE_NAME } from '@/config/site'

// `next/og`'s automatic font loader fetches Google Fonts per glyph range at
// **request time**, keyed off a font-name heuristic it does not document. That
// fetch is a dependency on a third-party CDN inside the render path of a route
// only crawlers hit, and when it fails the card does not degrade — the whole
// response throws.
//
// It failed here. For the ₫ (U+20AB DONG SIGN) in a VND price it returned 400
// in production — 23 failures across 18 users, logged as "Failed to load dynamic
// font for ₫" — while every other character on the card rendered fine.
//
// **That glyph is gone and the bundling stays.** The card no longer carries a
// price, so U+20AB is no longer on it; what has not changed is that a
// request-time font fetch can fail for any glyph, and this route has no
// fallback when it does. Bundling removes the dependency rather than the one
// symptom. `opengraph-bundled-font.test.tsx` exercises the real rasteriser
// against the characters the card actually renders today.
//
// The card is set in the site's own voices (ADR 051): the piece's name in Bodoni Moda, the brand
// name and the material in Barlow Condensed. It was Noto Sans until 2026-10-09, "a leftover of the
// original fix": chosen for pan-Unicode currency coverage when the card carried a price, and kept
// as a stand-in for a brand face the route could not load. Satori reads TTF, OTF and WOFF but not
// the WOFF2 the site ships, so the card bundles the same fixed instances as TTF, byte for byte
// from Google Fonts (`src/app/fonts/README.md`, "The share-card copies"), and
// `opengraph-bundled-font.test.tsx` rasterises every title and material in the catalogue with them.
//
// **The two paths are written at the call, and must stay there.** They were a `FONT_FILES`
// object until 2026-10-04, and Turbopack cannot resolve a path read out of an object, so it
// treated `readFile(FONT_FILES.regular)` as reading *any* file and traced the whole
// repository into this function: 752 files and 54 MB against ~250 and 43 MB for every
// other route — the tests, the ADRs, the scripts and the e2e specs shipped as server code
// on every deploy. A literal `path.join(process.cwd(), '…')` is the scoped form its warning
// asks for. `scripts/audit-function-traces.mjs` fails the build if any function traces
// repository files again (ADR 047).
async function loadCardFonts() {
  const [display, label] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/bodoni-moda-96pt-400.ttf')),
    readFile(path.join(process.cwd(), 'public/fonts/barlow-condensed-500.ttf')),
  ])
  return [
    { name: 'Bodoni Moda', data: display, weight: 400 as const, style: 'normal' as const },
    { name: 'Barlow Condensed', data: label, weight: 500 as const, style: 'normal' as const },
  ]
}

// Still deliberately NOT `runtime = 'edge'`, and the reason has changed.
//
// It was the network. This card read the static catalogue and ran happily on
// the edge; when it moved to Shopify through `src/lib/shopify/client.ts` it had
// to move to the Node runtime with it, and the accepted cost was a slower cold
// start on a route only crawlers hit. The alternative was an edge card that
// rendered the wrong product, which is what it had been doing.
//
// There is no Shopify call any more — `getProductByHandle` reads seventeen
// records compiled into the bundle — so the *original* argument for Node has
// expired. What replaces it is `loadCardFonts()`: `node:fs/promises` reading two
// files out of `public/fonts/`, which the edge runtime has no filesystem for.
// Bundled fonts and the edge runtime are mutually exclusive, and the bundled
// fonts are the thing keeping a third-party CDN out of this render path.
//
// The 2500ms budget that used to be enforced here by
// `scripts/verify-production.mjs` went with that script (WS-6). It was a budget
// on a round trip this route no longer makes. Local measurements on the Shopify
// version — 513ms cold, 54ms warm, 15KB — are kept only as the record of what
// the network cost; a card with no fetch in it is bounded by rasterisation, and
// nothing currently measures that. Say so rather than leave a number that
// describes a different route.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${SITE_NAME} product`

interface Props {
  params: Promise<{ handle: string }>
}

export default async function Image({ params }: Props) {
  const { handle } = await params
  const product = getProductByHandle(handle)
  // Same derivation as generateMetadata and the JSON-LD, so the tab title, the share
  // card and the structured data cannot describe the product differently.
  const title = product ? productSeo(product).title : 'Product'
  // The published label off the record, upper-cased for the card's own typography — not
  // a `MATERIAL_LABELS` lookup keyed on `product.material`, which is what this was. Three
  // rows mapping `titanium` to "GRADE 23 TITANIUM" meant a claim about metallurgy lived
  // in a constant in a route file, and its unknown-handle default was the string
  // 'TITANIUM': a card for a product this catalogue does not hold asserted it was
  // titanium. It says nothing now.
  const material = product ? product.materialLabel.toUpperCase() : ''
  const fonts = await loadCardFonts()

  return new ImageResponse(
    <div
      style={{
        background: '#FAF9F5',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '80px',
        justifyContent: 'space-between',
        position: 'relative',
        fontFamily: 'Barlow Condensed',
        fontWeight: 500,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: '#9DA7AF',
          display: 'flex',
        }}
      />
      <div
        style={{
          fontSize: 22,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#9DA7AF',
          display: 'flex',
        }}
      >
        {SITE_NAME.toUpperCase()}
      </div>
      {/* Satori has no block layout: a div with more than one child must
            declare display explicitly or rendering throws at request time. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: 'Bodoni Moda',
            fontSize: 84,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: '#1A1918',
            lineHeight: 1.05,
            marginBottom: 28,
            display: 'flex',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* An empty bordered box is worse than no box: it reads as a label that failed
              to load. Rendered only when there is a material to name. */}
          {material !== '' && (
            <div
              style={{
                border: '1px solid #DFDACF',
                padding: '8px 16px',
                fontSize: 18,
                letterSpacing: '0.12em',
                color: '#5F5B55',
                display: 'flex',
              }}
            >
              {material}
            </div>
          )}
          {/*
            The price was rendered here, formatted inline so that the currency scan — now
            `price-absence-contract.test.tsx` — could not mistake it for a raw number:
            this project shipped an unformatted "1450000" beside a store charging
            "1.450.000₫" four separate times.

            It is gone with the rest of the prices. An unfurled link is often the first
            thing someone sees of a product, so a price on it is a claim made before they
            reach any page that could qualify it. The card keeps the name and the material.
          */}
        </div>
      </div>
    </div>,
    { ...size, fonts }
  )
}
