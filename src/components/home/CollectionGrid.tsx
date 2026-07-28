'use client'

import Link from 'next/link'
import Image from 'next/image'
import { hjCollections, getProductsByCollection } from '@/lib/data/hj-data'
import { JewelrySVG } from '@/components/svg/JewelrySVG'

const COLLECTION_PHOTOS: Partial<Record<string, string>> = {
  charms: '/images/collections/charms.jpg',
  earrings: '/images/collections/earrings.jpg',
}

export function CollectionGrid() {
  return (
    <section
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(48px, 6vw, 80px) var(--space-gutter, clamp(20px,4vw,64px))',
      }}
    >
      <div
        style={{
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <span className="label-eyebrow">Collections</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ash)' }} />
      </div>

      {/* 4-column horizontal bar */}
      <div className="hj-coll-grid" style={{ gap: '2px' }}>
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
                transition: 'opacity 0.3s var(--ease)',
              }}
              className="card-tile hj-coll-tile"
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLAnchorElement).style.opacity = '1'
              }}
            >
              {/* Background photo or SVG illustration */}
              {COLLECTION_PHOTOS[collection.handle] ? (
                <Image
                  src={COLLECTION_PHOTOS[collection.handle] as string}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                firstProduct && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0.12,
                      pointerEvents: 'none',
                    }}
                  >
                    <JewelrySVG type={firstProduct.svgType} className="w-2/3 h-2/3" />
                  </div>
                )
              )}

              {/* Bottom scrim — ensures label stays legible over photo backgrounds */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '58%',
                  background:
                    'linear-gradient(180deg, rgba(247,245,241,0) 0%, rgba(247,245,241,0.85) 72%, var(--bg) 100%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Bottom label */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '20px 16px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.1rem',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: '0 0 4px',
                  }}
                >
                  {collection.title}
                </h3>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--graphite)',
                  }}
                >
                  Shop →
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default CollectionGrid
