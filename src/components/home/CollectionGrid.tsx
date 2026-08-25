'use client'

import Link from 'next/link'
import Image from 'next/image'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import type { HJSvgType } from '@/lib/shopify/types'

const COLLECTION_PHOTOS: Partial<Record<string, string>> = {
  charms: '/images/collections/charms.jpg',
  earrings: '/images/collections/earrings.jpg',
}

/**
 * One tile, resolved by the server before this component renders.
 *
 * `svgType` used to be read here via `getProductsByCollection` from the
 * *static* catalogue — a catalogue lookup in a `'use client'` component, which
 * can never see a Shopify product, so tiles were illustrated by whatever the
 * bundled fixture happened to contain. A client component cannot await
 * Shopify, so the resolved value arrives as a prop instead.
 */
export interface CollectionTile {
  handle: string
  title: string
  /** Illustration for collections with no photograph yet. Null renders no mark. */
  svgType: HJSvgType | null
}

export function CollectionGrid({ tiles }: { tiles: CollectionTile[] }) {
  return (
    <section
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(48px, 6vw, 80px) var(--space-gutter, clamp(20px,4vw,64px))',
        // Matches the hairline HorizontalScroll draws. Without it the seam below this
        // section was the only light-on-light boundary on the homepage with no divider,
        // while its two structural twins had one — because the rule lived on the strip
        // component rather than on the boundary, so it applied wherever a strip happened to
        // end. Asserted in e2e/homepage-composition.spec.ts.
        borderBottom: '1px solid var(--ash)',
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
        {/* Also an h2: this section rendered h3 tile titles with no heading above them,
            so its tiles hung off the previous section's outline. See HorizontalScroll. */}
        <h2 className="label-eyebrow" style={{ margin: 0 }}>
          Collections
        </h2>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ash)' }} />
      </div>

      {/* 4-column horizontal bar */}
      <div className="hj-coll-grid" style={{ gap: '2px' }}>
        {tiles.map((collection) => {
          const svgType = collection.svgType
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
                svgType && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'var(--nacre)',
                      pointerEvents: 'none',
                    }}
                  >
                    <JewelrySVG type={svgType} className="w-2/3 h-2/3" style={{ opacity: 0.45 }} />
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
                  height: '42%',
                  background:
                    'linear-gradient(180deg, rgba(247,245,241,0) 0%, rgba(247,245,241,0.85) 68%, var(--bg) 100%)',
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
