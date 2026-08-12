'use client'

import Link from 'next/link'
import type { HJProduct } from '@/lib/shopify/types'
import { ProductImage } from '@/components/product/ProductImage'
import { Badge } from '@/components/ui/Badge'
import { useReveal } from '@/lib/hooks/useReveal'
import { formatPrice } from '@/lib/utils/formatPrice'

interface HorizontalScrollProps {
  label: string
  products: HJProduct[]
  viewAllHref?: string
}

export function HorizontalScroll({ label, products, viewAllHref = '/shop' }: HorizontalScrollProps) {
  const [sectionRef, visible] = useReveal(0.08)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(48px, 6vw, 80px) 0',
        borderBottom: '1px solid var(--ash)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s var(--ease), transform 0.7s var(--ease)',
      }}
    >
      {/* Section header */}
      <div
        style={{
          padding: '0 var(--space-gutter, clamp(20px,4vw,64px))',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <span className="label-eyebrow">{label}</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ash)' }} />
        <Link
          href={viewAllHref}
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--graphite)',
            flexShrink: 0,
            transition: 'color 0.2s var(--ease)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--graphite)'
          }}
        >
          View All →
        </Link>
      </div>

      {/* Scrollable row */}
      <div
        className="hj3-noscroll"
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '2px',
          paddingLeft: 'var(--space-gutter, clamp(20px,4vw,64px))',
          paddingRight: 'var(--space-gutter, clamp(20px,4vw,64px))',
          paddingBottom: '4px',
        }}
      >
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.handle}`}
            style={{
              display: 'block',
              width: 'clamp(220px, 260px, 280px)',
              flexShrink: 0,
              textDecoration: 'none',
              transition: 'transform 0.3s var(--ease)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-4px)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'
            }}
          >
            {/* Card image area */}
            <div
              className="card-tile"
              style={{
                height: '300px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <ProductImage
                product={product}
                svgScale="60%"
                // The card is `clamp(220px, 260px, 280px)` wide — a fixed 260px, not a
                // fluid grid cell — so the hint is a width, not a viewport fraction.
                // 280px covers the clamp's ceiling if the card ever widens.
                sizes="280px"
              />
              {product.badge && (
                <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                  <Badge
                    variant={
                      product.badge === 'Bestseller'
                        ? 'bestseller'
                        : product.badge === 'New'
                          ? 'new'
                          : 'sale'
                    }
                  />
                </div>
              )}
            </div>

            {/* Card info */}
            <div style={{ padding: '14px 0 0' }}>
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  margin: '0 0 4px',
                }}
              >
                {product.title}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--graphite)',
                  margin: '0 0 6px',
                }}
              >
                {product.material === 'surgical-steel'
                  ? '316L Surgical Steel'
                  : product.material === 'niobium'
                    ? 'Niobium'
                    : 'Grade 23 Titanium'}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: '0.9rem',
                  color: 'var(--ink)',
                  margin: 0,
                }}
              >
                {formatPrice(product.price, product.currencyCode)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default HorizontalScroll
