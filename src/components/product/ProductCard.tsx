'use client'

import Link from 'next/link'
import type { CatalogProduct } from '@/lib/catalog'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'

interface ProductCardProps {
  product: CatalogProduct
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
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
            {product.specification}
          </p>
        </div>

        {/*
          Badge — absolute top-left.
          The Sold Out state is gone with the inventory signal that produced it: it read
          `every variant unavailable` from Shopify, and there is no inventory system left
          to read. Claiming a piece is sold out on a catalogue that cannot check would be
          an invented fact; `availability` carries the honest answer instead, and it is
          `ask-an-ambassador` for every product today.
        */}
        {product.badge !== null && (
          <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
            <ProductBadge badge={product.badge} />
          </div>
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

          {/*
            The price row was here.

            A browse-only catalogue publishes no prices: there is nothing to pay and
            nothing to pay it with. `material` above and `specification` on hover are
            what a card can honestly say about a piece; what it costs is a
            conversation with an ambassador, which is what `availability` records.
          */}
        </div>
      </article>
    </Link>
  )
}

export default ProductCard
