import { ImageResponse } from 'next/og'
import { getProduct } from '@/lib/shopify'
import { formatPrice } from '@/lib/utils/formatPrice'
import { productSeo } from '@/lib/seo/productSeo'

// Deliberately NOT `runtime = 'edge'`.
//
// This card used to read the static catalogue, which needed no network and ran
// happily on the edge. It now reads Shopify through `src/lib/shopify/client.ts`,
// so it runs on the Node runtime instead. The cost is a slower cold start on a
// route only crawlers hit; the alternative was a card that renders the wrong
// product, which is what the edge version was doing.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Healthy Jewelry product'

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
  // `getProduct` falls back to the static catalogue on its own when Shopify is
  // unconfigured or unreachable, so this is strictly better-informed than the
  // direct `getProductByHandle` it replaces — never worse.
  const product = await getProduct(handle)
  // Same derivation as generateMetadata and the JSON-LD.
  const title = product ? productSeo(product).title : 'Product'
  const material = MATERIAL_LABELS[product?.material ?? ''] ?? 'TITANIUM'
  // Formatted, not interpolated. A bare `{product.price}` renders "1450000"
  // beside a store that charges "1.450.000₫" — the fourth time this project
  // shipped a price no formatter had seen.
  const price = product ? formatPrice(product.price, product.currencyCode) : ''

  return new ImageResponse(
    (
      <div style={{ background: '#F7F5F1', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '80px', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#9DA7AF', display: 'flex' }} />
        <div style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9DA7AF', display: 'flex' }}>HEALTHY JEWELRY</div>
        {/* Satori has no block layout: a div with more than one child must
            declare display explicitly or rendering throws at request time. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
