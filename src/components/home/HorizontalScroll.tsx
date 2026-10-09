'use client'

import Link from 'next/link'
import type { CatalogProduct } from '@/lib/catalog'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'
import { ArrowIcon } from '@/components/ui/ArrowIcon'
import { useReveal } from '@/lib/hooks/useReveal'

interface HorizontalScrollProps {
  /**
   * The strip's name. With a `title` it is the label above it (the board's "The pieces"); on its
   * own it is the strip's heading, set in the label voice ("You may also like" on a piece's page).
   */
  label: string
  /** The strip's title, in the display voice. Optional: a strip that is only a list needs no title. */
  title?: string
  products: readonly CatalogProduct[]
  viewAllHref?: string
}

export function HorizontalScroll({
  label,
  title,
  products,
  viewAllHref = '/shop',
}: HorizontalScrollProps) {
  const [sectionRef, visible] = useReveal(0.08)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="hj-band hj-band-strip"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity var(--duration-slow) var(--ease), transform var(--duration-slow) var(--ease)',
      }}
    >
      <div className="hj-strip-head">
        <div>
          {/* The heading is the title when there is one, and the label otherwise: this is what
              tells a reader which strip they are in, and until 2026-08 the strips contributed no
              heading at all, so a screen-reader outline of the homepage never mentioned the
              products. `margin: 0` because .label-eyebrow carries none and an h2 brings its own. */}
          {title ? (
            <>
              <p className="label-eyebrow">{label}</p>
              <h2 className="hj-h2">{title}</h2>
            </>
          ) : (
            <h2 className="label-eyebrow" style={{ margin: 0 }}>
              {label}
            </h2>
          )}
        </div>
        <Link href={viewAllHref} className="hj-link" style={{ flexShrink: 0 }}>
          View all
          <ArrowIcon />
        </Link>
      </div>

      {/* Scrollable row. `overflowX` is inline on purpose: `.hj3-noscroll` (which hides the bar on
          touch) sets `overflow: hidden` in the utilities layer, and a layer outranks any rule in an
          earlier one whatever its specificity, so the same declaration in `.hj-strip-row` lost to it
          and the strip stopped scrolling on the first build of this band. */}
      <div className="hj3-noscroll hj-strip-row" style={{ overflowX: 'auto' }}>
        {products.map((product) => (
          <Link
            key={product.handle}
            href={`/products/${product.handle}`}
            className="hj-strip-card"
          >
            {/* Card image area */}
            <div
              className="card-tile"
              style={{
                aspectRatio: 'var(--ratio-product)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ProductImage
                product={product}
                svgScale="60%"
                // The card is fluid — `clamp(200px, 68vw, 320px)` — so the hint follows the same
                // shape: 320px is the ceiling, and the viewport term governs below 471px.
                sizes="(max-width: 470px) 68vw, 320px"
              />
              {product.badge && (
                <div style={{ position: 'absolute', top: '16px', left: '16px' }}>
                  {/*
                    One badge for a piece, on the strip, the listing cards and the piece page
                    alike (`ProductBadge`, `.badge` in globals.css). The strip carried a second
                    implementation of its own, a tinted fill with a different padding, so the
                    same "Bestseller" looked one way on the home page and another on /shop.
                  */}
                  <ProductBadge badge={product.badge} />
                </div>
              )}
            </div>

            {/* Card info */}
            <div className="hj-strip-caption">
              <p className="hj-card-name" style={{ margin: 0 }}>
                {product.title}
              </p>
              <p className="hj-spec">
                {/*
                  The published label off the record. This was a three-way ternary on
                  `product.material` whose final arm was an unguarded `: 'Grade 23
                  Titanium'` — so a material the chain did not recognise rendered as
                  titanium rather than as nothing, which is a metallurgy claim made by a
                  fallback on a brand whose entire promise is knowing which metal touches
                  your skin. `schema.ts` keeps `material` and `materialLabel` as separate
                  fields precisely so the claim lives in content.
                */}
                {product.materialLabel}
              </p>
              {/*
                The price was here. A browse-only strip shows what a piece is and what
                it is made of; what it costs is a conversation, not a number the site
                can stand behind.
              */}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default HorizontalScroll
