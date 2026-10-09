import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { claimText } from '@/lib/catalog'
import { SITE_DEFAULT_TITLE, SITE_NAME } from '@/config/site'

// The Node runtime, like `products/[handle]/opengraph-image`. This card was `runtime = 'edge'`
// while it drew only literals; its tagline is now a claim resolved through the catalogue, and
// on Edge that one import carried Zod, every catalogue record and the claims registry into the
// edge bundle, validated again on every cold start, to draw one sentence. On Node the card is
// prerendered at build (`○` in the route table, where Edge made it `ƒ`), so it has no cold start.

// A literal rather than SITE_DEFAULT_TITLE: Next reads `alt` from this module's exports, and
// a literal is the form it is guaranteed to resolve. Said "Implant-Grade Titanium" until
// 2026-09-26 — the share card is the brand's most-copied sentence.
/**
 * The share card renders the positioning claim, so it re-renders on the same bound as the pages
 * (`CLAIM_WITHDRAWAL_BOUND_SECONDS`, `src/lib/catalog/claims-schema.ts`). A metadata image route
 * does not inherit the root layout's segment config, so it states its own — the same literal,
 * held equal by `claim-expiry.test.ts`.
 */
export const revalidate = 3600

export const alt = SITE_DEFAULT_TITLE
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The card is set in the site's original pair (ADR 052): the metal, the brand name in Barlow
 * Condensed capitals; the positioning line in DM Sans 300 and the material chips in DM Sans 500.
 * Satori reads TTF and not the WOFF2 the site ships, so the card bundles the same fixed instances
 * as TTF, byte for byte (`src/app/fonts/README.md`, "The share-card copies"). The paths are written
 * at the call, as in the product card, so Turbopack scopes the trace to these three files (ADR 047).
 */
async function loadCardFonts() {
  const [display, body, label] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/barlow-condensed-500.ttf')),
    readFile(path.join(process.cwd(), 'public/fonts/dm-sans-9pt-300.ttf')),
    readFile(path.join(process.cwd(), 'public/fonts/dm-sans-9pt-500.ttf')),
  ])
  return [
    { name: 'Barlow Condensed', data: display, weight: 500 as const, style: 'normal' as const },
    { name: 'DM Sans', data: body, weight: 300 as const, style: 'normal' as const },
    { name: 'DM Sans', data: label, weight: 500 as const, style: 'normal' as const },
  ]
}

export default async function Image() {
  const fonts = await loadCardFonts()
  return new ImageResponse(
    (
      <div
        style={{
          background: '#FAF9F5',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '80px',
          position: 'relative',
          fontFamily: 'DM Sans',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#9DA7AF', display: 'flex' }} />
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 500, fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9DA7AF', marginBottom: 28, display: 'flex' }}>
          {SITE_NAME.toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 124, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.01em', color: '#1A1918', lineHeight: 1, display: 'flex' }}>Grade 23</span>
          <span style={{ fontFamily: 'Barlow Condensed', fontSize: 124, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.01em', color: '#1A1918', lineHeight: 1, display: 'flex' }}>Titanium</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 26, fontWeight: 300, color: '#3D3935', display: 'flex' }}>
          {/* The positioning line is a pending claim; the card renders what the page does. */}
          {claimText('brand-positioning', { kind: 'site' })}
        </div>
        <div style={{ position: 'absolute', bottom: 64, right: 80, display: 'flex', gap: 12 }}>
          {['GRADE 23 TITANIUM', 'NIOBIUM', '316L SURGICAL STEEL'].map((mat) => (
            <div key={mat} style={{ fontFamily: 'DM Sans', fontWeight: 500, border: '1px solid #DFDACF', padding: '8px 16px', fontSize: 16, letterSpacing: '0.12em', color: '#5F5B55', display: 'flex' }}>
              {mat}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
