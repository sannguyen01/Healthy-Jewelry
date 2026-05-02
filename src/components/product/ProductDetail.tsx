'use client'

import { useState } from 'react'
import type { HJProduct } from '@/lib/shopify/types'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { ProductBadge } from '@/components/product/ProductBadge'
import { SizePicker } from '@/components/product/SizePicker'
import { formatPrice } from '@/lib/utils/formatPrice'
import { useCartStore } from '@/store/cart'

interface ProductDetailProps {
  product: HJProduct
}

const MATERIAL_FULL_NAMES: Record<string, string> = {
  titanium: 'Grade 23 Titanium',
  niobium: 'Niobium',
  'surgical-steel': '316L Surgical Steel',
}

const TRUST_SIGNALS = ['·IMPLANT GRADE·', '·HYPOALLERGENIC·', '·MRI SAFE·']

export function ProductDetail({ product }: ProductDetailProps) {
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined)
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useCartStore((s) => s.openCart)

  function handleAddToBag() {
    addItem(product, 1)
    openCart()
  }

  const materialName = MATERIAL_FULL_NAMES[product.material] ?? product.material

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 'var(--space-gutter)',
      }}
    >
      <style>{`
        @media (min-width: 768px) {
          .hj-detail-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>

      <div
        className="hj-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 'var(--space-gutter)',
        }}
      >
        {/* Left — SVG */}
        <div
          className="card-tile"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '480px',
            aspectRatio: '1 / 1',
          }}
        >
          <JewelrySVG
            type={product.svgType}
            className=""
            style={{ width: '70%', height: '70%' }}
          />
        </div>

        {/* Right — Info panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            justifyContent: 'center',
          }}
        >
          {/* Badge */}
          {product.badge !== null && (
            <div>
              <ProductBadge badge={product.badge} />
            </div>
          )}

          {/* Title */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display)',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              lineHeight: 1.05,
            }}
          >
            {product.title}
          </h1>

          {/* Material line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-tag">{materialName}</span>
          </div>

          {/* Spec */}
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              color: 'var(--graphite)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {product.spec}
          </p>

          {/* Description */}
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 'var(--text-base)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              marginTop: '16px',
            }}
          >
            {product.description}
          </p>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: 'var(--ash)',
            }}
            role="separator"
          />

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                color: 'var(--ink)',
              }}
            >
              {formatPrice(product.price, 'USD')}
            </span>

            {product.compareAtPrice !== null && (
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 'var(--text-base)',
                  color: 'var(--graphite)',
                  textDecoration: 'line-through',
                }}
              >
                {formatPrice(product.compareAtPrice, 'USD')}
              </span>
            )}
          </div>

          {/* Size picker — only for rings and bracelets */}
          <SizePicker
            collection={product.collection}
            onSelect={setSelectedSize}
            selected={selectedSize}
          />

          {/* Add to Bag */}
          <button
            onClick={handleAddToBag}
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: 'var(--ink)',
              color: 'var(--bg)',
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              border: 'none',
              cursor: 'pointer',
              transition: `background-color var(--duration-fast) var(--ease)`,
              marginTop: '8px',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--mid)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--ink)'
            }}
            aria-label={`Add ${product.title} to bag`}
          >
            Add to Bag
          </button>

          {/* Trust signals */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: '8px',
            }}
          >
            {TRUST_SIGNALS.map((signal) => (
              <span
                key={signal}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--titanium)',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductDetail
