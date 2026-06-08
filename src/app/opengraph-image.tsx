import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Healthy Jewelry — Implant-Grade Titanium'
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
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#1A1714', lineHeight: 0.95, display: 'flex' }}>IMPLANT-GRADE</span>
          <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#1A1714', lineHeight: 0.95, display: 'flex' }}>TITANIUM</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 22, color: '#6B6762', letterSpacing: '0.04em', display: 'flex' }}>
          Metal that works with your body.
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
