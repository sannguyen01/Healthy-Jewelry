'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { HJProduct } from '@/lib/shopify/types'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'
import { SizePicker } from '@/components/product/SizePicker'
import { formatPrice } from '@/lib/utils/formatPrice'
import { useCartStore } from '@/store/cart'
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
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useCartStore((s) => s.openCart)

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

  // Rings and bracelets are sized — a size must resolve to a real Shopify
  // variant before the correct item can be added to the cart.
  const requiresSize = product.collection === 'rings' || product.collection === 'bracelets'
  const selectedVariant = selectedSize
    ? product.variants.find((v) =>
        v.selectedOptions.some((o) => o.name === 'Size' && o.value === selectedSize)
      )
    : undefined
  // Unsized products carry exactly one ('Default') variant — that one stands
  // in for "the product" when checking availability outside a size context.
  const relevantVariant = requiresSize ? selectedVariant : product.variants[0]
  const isSoldOut =
    product.variants.length > 0 && product.variants.every((v) => !v.availableForSale)
  const variantSoldOut = relevantVariant !== undefined && !relevantVariant.availableForSale
  const canAddToBag = requiresSize
    ? selectedVariant !== undefined && !variantSoldOut
    : !variantSoldOut

  function handleAddToBag() {
    if (!canAddToBag) return
    addItem(product, 1, selectedVariant?.id)
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
        {/* Left — photograph, gallery, or illustration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            className="card-tile"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '480px',
              aspectRatio: '1 / 1',
              position: 'relative',
            }}
          >
            {activeImage ? (
              <Image
                src={activeImage.url}
                alt={activeImage.altText?.trim() || product.title}
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
                // The largest above-the-fold image on the page it belongs to,
                // and the reason someone opened it.
                priority
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <ProductImage
                product={product}
                svgScale="70%"
                sizes="(max-width: 900px) 100vw, 50vw"
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

          {/* Add to Bag */}
          <button
            onClick={handleAddToBag}
            disabled={!canAddToBag}
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: canAddToBag ? 'var(--ink)' : 'var(--ash)',
              color: 'var(--bg)',
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              border: 'none',
              cursor: canAddToBag ? 'pointer' : 'not-allowed',
              transition: `background-color var(--duration-fast) var(--ease)`,
              marginTop: '8px',
            }}
            onMouseEnter={(e) => {
              if (canAddToBag) {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--mid)'
              }
            }}
            onMouseLeave={(e) => {
              if (canAddToBag) {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--ink)'
              }
            }}
            aria-label={
              requiresSize && !selectedVariant
                ? `Select a size before adding ${product.title} to bag`
                : variantSoldOut
                  ? `${product.title} is sold out`
                  : `Add ${product.title} to bag`
            }
          >
            {requiresSize && !selectedVariant
              ? 'Select a Size'
              : variantSoldOut
                ? 'Sold Out'
                : 'Add to Bag'}
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
