import { ImageResponse } from 'next/og'
import { claimText } from '@/lib/catalog'

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

export const alt = 'Healthy Jewelry — Grade 23 Titanium, Niobium, 316L Steel'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#F7F5F1',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '80px',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#9DA7AF', display: 'flex' }} />
        <div style={{ fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9DA7AF', marginBottom: 28, display: 'flex' }}>
          HEALTHY JEWELRY
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#1A1714', lineHeight: 0.95, display: 'flex' }}>GRADE 23</span>
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#1A1714', lineHeight: 0.95, display: 'flex' }}>TITANIUM</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 22, color: '#6B6762', letterSpacing: '0.04em', display: 'flex' }}>
          {/* The positioning line is a pending claim; the card renders what the page does. */}
          {claimText('brand-positioning', { kind: 'site' })}
        </div>
        <div style={{ position: 'absolute', bottom: 64, right: 80, display: 'flex', gap: 12 }}>
          {['GRADE 23 TITANIUM', 'NIOBIUM', '316L SURGICAL STEEL'].map((mat) => (
            <div key={mat} style={{ border: '1px solid #D8D3CB', padding: '8px 16px', fontSize: 11, letterSpacing: '0.12em', color: '#6B6762', display: 'flex' }}>
              {mat}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
