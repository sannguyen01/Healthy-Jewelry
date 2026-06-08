import { ImageResponse } from 'next/og'
import { getProductByHandle } from '@/lib/data/hj-data'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface Props {
  params: Promise<{ handle: string }>
}

const MATERIAL_LABELS: Record<string, string> = {
  titanium: 'GRADE 23 TITANIUM',
  niobium: 'NIOBIUM',
  'surgical-steel': '316L SURGICAL STEEL',
}

export default async function Image({ params }: Props) {
  const { handle } = await params
  const product = getProductByHandle(handle)
  const title = product?.title ?? 'Product'
  const material = MATERIAL_LABELS[product?.material ?? ''] ?? 'TITANIUM'
  const price = product?.price ?? ''

  return new ImageResponse(
    (
      <div style={{ background: '#F7F5F1', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '80px', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#9DA7AF', display: 'flex' }} />
        <div style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9DA7AF', display: 'flex' }}>HEALTHY JEWELRY</div>
        <div>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#1A1714', lineHeight: 1.0, marginBottom: 28, display: 'flex' }}>
            {title}
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ border: '1px solid #D8D3CB', padding: '8px 16px', fontSize: 12, letterSpacing: '0.12em', color: '#6B6762', display: 'flex' }}>
              {material}
            </div>
            {price && <div style={{ fontSize: 20, color: '#1A1714', fontWeight: 400, display: 'flex' }}>{price}</div>}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
