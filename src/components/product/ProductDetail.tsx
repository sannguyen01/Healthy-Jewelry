'use client'

import { useMemo, useState } from 'react'
import type { HJProduct } from '@/lib/shopify/types'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { ProductBadge } from '@/components/product/ProductBadge'
import { SizePicker, buildSizeOptions } from '@/components/product/SizePicker'
import { QuantityStepper } from '@/components/product/QuantityStepper'
import { formatPrice } from '@/lib/utils/formatPrice'
import { useCartStore, MAX_LINE_QUANTITY } from '@/store/cart'

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
  const [quantity, setQuantity] = useState(1)
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useCartStore((s) => s.openCart)

  // Whether this product is sized is a fact about its Shopify options, not
  // about its collection. Keying off the collection — as this did — meant a
  // ring published without size variants could never be added to the bag, and
  // a sized product in any other collection never got a picker.
  const sizeInfo = useMemo(
    () => buildSizeOptions(product.options, product.variants),
    [product.options, product.variants]
  )
  const requiresSize = sizeInfo !== null

  const selectedVariant = useMemo(() => {
    if (!requiresSize) {
      return product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0]
    }
    if (!selectedSize || !sizeInfo) return undefined
    return product.variants.find((v) =>
      v.selectedOptions.some(
        (o) =>
          o.name.trim().toLowerCase() === sizeInfo.name.trim().toLowerCase() &&
          o.value === selectedSize
      )
    )
  }, [requiresSize, selectedSize, sizeInfo, product.variants, product.defaultVariantId])

  // Price follows the chosen variant. A size 12 band can legitimately cost more
  // than the "from" price shown before a size is picked, and charging a
  // different number at checkout than the one on the page earns a chargeback.
  const displayPrice = selectedVariant?.price?.amount ?? product.price
  const displayCurrency = selectedVariant?.price?.currencyCode ?? product.currencyCode ?? 'USD'
  const displayCompareAt =
    selectedVariant?.compareAtPrice?.amount ?? (selectedVariant ? null : product.compareAtPrice)
  const isOnSale =
    displayCompareAt !== null &&
    displayCompareAt !== undefined &&
    parseFloat(displayCompareAt) > parseFloat(displayPrice)

  const soldOut = !product.availableForSale
  const variantSoldOut = selectedVariant !== undefined && !selectedVariant.availableForSale
  const canAddToBag = !soldOut && selectedVariant !== undefined && selectedVariant.availableForSale

  function handleAddToBag() {
    if (!canAddToBag || !selectedVariant) return
    addItem(product, quantity, selectedVariant.id)
    openCart()
  }

  const buttonLabel = soldOut
    ? 'Sold Out'
    : requiresSize && !selectedSize
      ? `Select a ${sizeInfo?.name ?? 'Size'}`
      : variantSoldOut
        ? 'Sold Out'
        : 'Add to Bag'

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
        {/* Left — SVG */}
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
          <JewelrySVG type={product.svgType} className="" style={{ width: '70%', height: '70%' }} />
          {soldOut && (
            <span
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--bg)',
                backgroundColor: 'var(--ink)',
                padding: '6px 10px',
              }}
            >
              Sold Out
            </span>
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
          {/* Badge */}
          {product.badge !== null && (
            <div>
              <ProductBadge badge={product.badge} />
            </div>
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

          {/* Spec */}
          {product.spec && (
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
              data-testid="product-price"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                color: 'var(--ink)',
              }}
            >
              {formatPrice(displayPrice, displayCurrency)}
            </span>

            {isOnSale && displayCompareAt && (
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 'var(--text-base)',
                  color: 'var(--graphite)',
                  textDecoration: 'line-through',
                }}
              >
                {formatPrice(displayCompareAt, displayCurrency)}
              </span>
            )}
          </div>

          {/* Size picker — rendered from Shopify's own option values */}
          {sizeInfo && (
            <SizePicker
              options={product.options}
              variants={product.variants}
              onSelect={setSelectedSize}
              selected={selectedSize}
            />
          )}

          {/* Quantity */}
          {!soldOut && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="label-eyebrow">Quantity</span>
              <QuantityStepper
                value={quantity}
                min={1}
                max={MAX_LINE_QUANTITY}
                onChange={setQuantity}
                label={product.title}
              />
            </div>
          )}

          {/* Add to Bag */}
          <button
            onClick={handleAddToBag}
            disabled={!canAddToBag}
            data-testid="add-to-bag"
            style={{
              width: '100%',
              padding: '18px',
              backgroundColor: canAddToBag ? 'var(--ink)' : 'var(--ash)',
              color: canAddToBag ? 'var(--bg)' : 'var(--graphite)',
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
              soldOut
                ? `${product.title} is sold out`
                : requiresSize && !selectedSize
                  ? `Select a size before adding ${product.title} to bag`
                  : `Add ${product.title} to bag`
            }
          >
            {buttonLabel}
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
                  color: 'var(--titanium)',
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
