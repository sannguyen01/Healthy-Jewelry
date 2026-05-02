'use client'

import Link from 'next/link'
import type { HJProduct } from '@/lib/shopify/types'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { Badge } from '@/components/ui/Badge'

interface HorizontalScrollProps {
  label: string
  products: HJProduct[]
}

export function HorizontalScroll({ label, products }: HorizontalScrollProps) {
  return (
    <section
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(48px, 6vw, 80px) 0',
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
        <div
          style={{
            flex: 1,
            height: '1px',
            backgroundColor: 'var(--ash)',
          }}
        />
      </div>

      {/* Scrollable row */}
      <div
        className="hj3-noscroll"
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '24px',
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
              width: 'clamp(240px, 280px, 280px)',
              flexShrink: 0,
              textDecoration: 'none',
              transition: 'transform 0.3s var(--ease, cubic-bezier(0.00,0.00,0.30,1.00))',
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
                height: '320px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <JewelrySVG
                type={product.svgType}
                style={{ width: '60%', height: '60%' } as React.CSSProperties}
                className="w-3/5 h-3/5"
              />
              {product.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                  }}
                >
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
                  fontSize: '0.68rem',
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
                ${product.price}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default HorizontalScroll
