'use client'

import Link from 'next/link'
import { hjCollections, getProductsByCollection } from '@/lib/data/hj-data'
import { JewelrySVG } from '@/components/svg/JewelrySVG'

export function CollectionGrid() {
  return (
    <section
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(48px, 6vw, 80px) var(--space-gutter, clamp(20px,4vw,64px))',
      }}
    >
      {/* Section eyebrow */}
      <div
        style={{
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <span className="label-eyebrow">Collections</span>
        <div
          style={{
            flex: 1,
            height: '1px',
            backgroundColor: 'var(--ash)',
          }}
        />
      </div>

      {/* 2×2 grid */}
      <div
        className="hj-collection-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-gutter, clamp(16px,2vw,32px))',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {hjCollections.map((collection) => {
          const firstProduct = getProductsByCollection(collection.handle)[0]
          return (
            <Link
              key={collection.handle}
              href={`/shop/${collection.handle}`}
              style={{
                display: 'block',
                position: 'relative',
                aspectRatio: '3 / 4',
                overflow: 'hidden',
                textDecoration: 'none',
                transition: 'transform 0.4s var(--ease, cubic-bezier(0.00,0.00,0.30,1.00))',
              }}
              className="card-tile hj-collection-tile"
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.02)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.00)'
              }}
            >
              {/* Background SVG illustration */}
              {firstProduct && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.15,
                    pointerEvents: 'none',
                  }}
                >
                  <JewelrySVG type={firstProduct.svgType} className="w-2/3 h-2/3" />
                </div>
              )}

              {/* Bottom overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '24px',
                  background: 'linear-gradient(to top, rgba(26,23,20,0.08) 0%, transparent 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.4rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: 0,
                  }}
                >
                  {collection.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 300,
                    fontSize: '0.82rem',
                    color: 'var(--graphite)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {collection.description}
                </p>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.62rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    marginTop: '8px',
                    alignSelf: 'flex-end',
                  }}
                >
                  Shop →
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      <style>{`
        @media (max-width: 600px) {
          .hj-collection-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  )
}

export default CollectionGrid
