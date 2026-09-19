'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { HJProduct } from '@/lib/shopify/types'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'
import { SizePicker } from '@/components/product/SizePicker'
import { formatPrice } from '@/lib/utils/formatPrice'
import { track } from '@/lib/analytics'

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
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  // One view per mount. The ref guards React's development double-invoke, which
  // would otherwise double every page-view number and teach everyone to halve it.
  const viewReported = useRef(false)
  useEffect(() => {
    if (viewReported.current) return
    viewReported.current = true
    track({
      name: 'product_viewed',
      handle: product.handle,
      collection: product.collection,
      material: product.material,
      value: product.price,
      currency: product.currencyCode,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.handle])

  /**
   * The image currently shown, or `undefined` when the product has no photography
   * and the illustration should be drawn instead.
   *
   * Falls back to `featuredImage` when `images` is empty but a featured image
   * exists — Shopify can return one without the other, and a product whose only
   * photo lives in `featuredImage` must not silently render as a line drawing.
   * Indexed defensively so a shrinking gallery cannot strand the index out of
   * range.
   */
  const activeImage = product.images[activeImageIndex] ?? product.images[0] ?? product.featuredImage

  // `isSoldOut` is the only variant-derived value left, and it feeds the badge below.
  //
  // Everything else that used to live here — `requiresSize`, `selectedVariant`,
  // `relevantVariant`, `variantSoldOut`, `canAddToBag` — existed solely to decide whether
  // the Add to Bag button could be pressed and which of its three labels to show. The
  // button is gone, so resolving a size to a Shopify variant answers no question this page
  // still asks. Left in place they would be unread state that a reader has to walk before
  // discovering it goes nowhere.
  //
  // The size picker stays and stays interactive: it tells a visitor what sizes exist and
  // which one they picked. It simply no longer has to map that choice onto a variant id.
  const isSoldOut =
    product.variants.length > 0 && product.variants.every((v) => !v.availableForSale)

  const materialName = MATERIAL_FULL_NAMES[product.material] ?? product.material

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 'var(--space-gutter)',
      }}
    >
      {/* Columns and gap live in globals.css. They were inline here with a
          `<style>` tag overriding them at 768px — the `!important` existed only
          because an inline value cannot otherwise lose to a media query. */}
      <div className="hj-detail-grid">
        {/* Left — photograph, gallery, or illustration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card-tile hj-product-tile">
            {activeImage ? (
              <Image
                src={activeImage.url}
                alt={activeImage.altText?.trim() || product.title}
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1120px) 50vw, 560px"
                // The largest above-the-fold image on the page it belongs to,
                // and the reason someone opened it.
                priority
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <ProductImage
                product={product}
                svgScale="70%"
                sizes="(max-width: 767px) 100vw, (max-width: 1120px) 50vw, 560px"
                priority
              />
            )}
          </div>

          {/*
            Thumbnails only when there is a choice to make. A single-image gallery
            is a row of one button that changes nothing — visual noise that reads
            as broken.
          */}
          {product.images.length > 1 && (
            <div role="group" aria-label="Product images" style={{ display: 'flex', gap: '8px' }}>
              {product.images.map((image, index) => {
                const isActive = index === activeImageIndex
                return (
                  <button
                    key={image.url}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`View image ${index + 1} of ${product.images.length}`}
                    aria-pressed={isActive}
                    className="card-tile"
                    style={{
                      position: 'relative',
                      width: '72px',
                      height: '72px',
                      flexShrink: 0,
                      cursor: 'pointer',
                      padding: 0,
                      // --titanium, not --titanium-text: this is a border, and
                      // the contrast rule applies to text (CLAUDE.md).
                      border: `1px solid ${isActive ? 'var(--titanium)' : 'var(--ash)'}`,
                      transition: `border-color var(--duration-fast) var(--ease)`,
                    }}
                  >
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      sizes="72px"
                      style={{ objectFit: 'contain' }}
                    />
                  </button>
                )
              })}
            </div>
          )}
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
          {/* Badge — sold-out status pre-empts promotional badges */}
          {isSoldOut ? (
            <div>
              <span className="badge">Sold Out</span>
            </div>
          ) : (
            product.badge !== null && (
              <div>
                <ProductBadge badge={product.badge} />
              </div>
            )
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

          {/* Spec — Shopify products carry this in the `custom.spec` metafield,
              which is optional. An empty one used to render a blank uppercase
              line with its own margins, so the layout showed a gap where a
              measurement should be. */}
          {product.spec.trim() !== '' && (
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
          )}

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
              {formatPrice(product.price, product.currencyCode)}
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
                {formatPrice(product.compareAtPrice, product.currencyCode)}
              </span>
            )}
          </div>

          {/* Size picker — only for rings and bracelets */}
          <SizePicker
            collection={product.collection}
            onSelect={setSelectedSize}
            selected={selectedSize}
          />

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
                  color: 'var(--titanium-text)',
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
