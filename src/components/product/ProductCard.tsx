'use client'

import Link from 'next/link'
import type { HJProduct } from '@/lib/shopify/types'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'
import { formatPrice } from '@/lib/utils/formatPrice'

interface ProductCardProps {
  product: HJProduct
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  // availableForSale comes from Shopify per variant; the static fallback
  // catalog hardcodes every variant to true, so this only activates once
  // real inventory data flows through. No variants means no availability
  // signal at all, not a confirmed sold-out state.
  const isSoldOut =
    product.variants.length > 0 && product.variants.every((v) => !v.availableForSale)

  return (
    <Link
      href={`/products/${product.handle}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <article
        className={'card-tile' + (className ? ` ${className}` : '')}
        style={{
          position: 'relative',
          cursor: 'pointer',
          transition: `transform var(--duration-fast) var(--ease)`,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.transform = 'translateY(-3px)'
          const spec = el.querySelector<HTMLElement>('[data-spec]')
          if (spec) spec.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.transform = 'translateY(0)'
          const spec = el.querySelector<HTMLElement>('[data-spec]')
          if (spec) spec.style.opacity = '0'
        }}
      >
        {/* Photograph when Shopify has one, illustration when not — see ProductImage. */}
        <div
          style={{
            height: '280px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--nacre)',
            position: 'relative',
          }}
        >
          <ProductImage
            product={product}
            svgScale="65%"
            // Grid is 1 / 2 / 3 columns at the ProductGrid breakpoints.
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />

          {/* Spec overlay — revealed on hover */}
          <p
            data-spec
            style={{
              position: 'absolute',
              bottom: '10px',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              color: 'var(--graphite)',
              letterSpacing: '0.08em',
              opacity: 0,
              transition: `opacity var(--duration-fast) var(--ease)`,
              pointerEvents: 'none',
            }}
          >
            {product.spec}
          </p>
        </div>

        {/* Badge — absolute top-left. Sold-out status pre-empts promotional badges. */}
        {isSoldOut ? (
          <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
            <span className="badge">Sold Out</span>
          </div>
        ) : (
          product.badge !== null && (
            <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
              <ProductBadge badge={product.badge} />
            </div>
          )
        )}

        {/* Info bar */}
        <div style={{ padding: '16px' }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              marginBottom: '4px',
            }}
          >
            {product.title}
          </p>

          <span className="material-tag">{product.material.replace('-', ' ').toUpperCase()}</span>

          {/* Price row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm)',
                color: 'var(--ink)',
              }}
            >
              {formatPrice(product.price, product.currencyCode)}
            </span>

            {product.compareAtPrice !== null && (
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--graphite)',
                  textDecoration: 'line-through',
                }}
              >
                {formatPrice(product.compareAtPrice, product.currencyCode)}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}

export default ProductCard
