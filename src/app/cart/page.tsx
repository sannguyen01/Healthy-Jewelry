'use client'

import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { ProductImage } from '@/components/product/ProductImage'
import { useCartStore, cartItemVariantLabel } from '@/store/cart'
import { formatPrice, cartCurrencyCode } from '@/lib/utils/formatPrice'

export default function CartPage() {
  const items = useCartStore((s) => s.items)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const total = useCartStore((s) => s.totalPrice())
  const shopifyTotal = useCartStore((s) => s.shopifyTotal)
  const cartCurrency = cartCurrencyCode(items)
  const totalItems = useCartStore((s) => s.totalItems())
  // See CartDrawer: Shopify's total is what will be charged; the local sum is
  // a snapshot from whenever each item was added.
  const displayTotal = shopifyTotal ?? total

  return (
    <>
      <Nav />
      <CartDrawer />

      <main
        style={{
          backgroundColor: 'var(--bg)',
          color: 'var(--ink)',
          minHeight: '100vh',
          paddingTop: '80px',
        }}
      >
        {items.length === 0 ? (
          /* ── Empty state ────────────────────────────────────────── */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'calc(100vh - 80px)',
              gap: '24px',
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            <JewelrySVG type="ring-arc" style={{ width: '80px', height: '80px', opacity: 0.18 }} />

            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              Your bag is empty
            </h1>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                fontWeight: 300,
                maxWidth: '360px',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              You have not added any pieces yet. Browse the collection to find something made for
              your body.
            </p>

            <Link href="/shop" className="btn-ghost" style={{ marginTop: '8px' }}>
              Continue Shopping
            </Link>
          </div>
        ) : (
          /* ── Cart with items ────────────────────────────────────── */
          <div
            style={{
              maxWidth: '1100px',
              margin: '0 auto',
              padding: 'clamp(40px, 6vw, 80px) clamp(24px, 5vw, 48px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 'clamp(40px, 6vw, 80px)',
              alignItems: 'start',
            }}
          >
            {/* ── Items list ──────────────────────────────────────── */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  marginBottom: '32px',
                  borderBottom: '1px solid var(--ash)',
                  paddingBottom: '20px',
                }}
              >
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-xl)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: 0,
                  }}
                >
                  Your Bag
                </h1>
                <span
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.1em',
                    color: 'var(--graphite)',
                  }}
                >
                  ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                </span>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map(({ product, quantity, variantId }) => {
                  const variantLabel = cartItemVariantLabel({ product, variantId })
                  return (
                    <li
                      key={variantId}
                      style={{
                        display: 'flex',
                        gap: '20px',
                        padding: '20px 0',
                        borderBottom: '1px solid var(--nacre)',
                        alignItems: 'center',
                      }}
                    >
                      {/* SVG thumbnail */}
                      <div
                        style={{
                          width: '80px',
                          height: '80px',
                          flexShrink: 0,
                          backgroundColor: 'var(--nacre)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        <ProductImage product={product} svgScale="60%" sizes="80px" />
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.95rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--ink)',
                            margin: '0 0 4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {product.title}
                        </p>

                        <p
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--text-xs)',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--titanium-text)',
                            margin: '0 0 12px',
                          }}
                        >
                          {product.material.replace('-', ' ')}
                          {variantLabel ? ` · ${variantLabel}` : ''}
                        </p>

                        {/* Qty controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button
                            onClick={() => updateQuantity(variantId, quantity - 1)}
                            aria-label="Decrease quantity"
                            style={{
                              width: '28px',
                              height: '28px',
                              border: '1px solid var(--ash)',
                              background: 'none',
                              cursor: 'pointer',
                              color: 'var(--ink)',
                              fontSize: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            −
                          </button>

                          <span
                            style={{
                              fontFamily: 'var(--font-ui)',
                              fontSize: 'var(--text-xs)',
                              letterSpacing: '0.1em',
                              color: 'var(--ink)',
                              minWidth: '20px',
                              textAlign: 'center',
                            }}
                          >
                            {quantity}
                          </span>

                          <button
                            onClick={() => updateQuantity(variantId, quantity + 1)}
                            aria-label="Increase quantity"
                            style={{
                              width: '28px',
                              height: '28px',
                              border: '1px solid var(--ash)',
                              background: 'none',
                              cursor: 'pointer',
                              color: 'var(--ink)',
                              fontSize: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            +
                          </button>

                          <button
                            onClick={() => removeItem(variantId)}
                            aria-label={`Remove ${product.title}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-ui)',
                              fontSize: 'var(--text-xs)',
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              color: 'var(--graphite)',
                              marginLeft: 'auto',
                              padding: '2px 0',
                              textDecoration: 'underline',
                              textUnderlineOffset: '3px',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Line price */}
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--text-base)',
                            color: 'var(--ink)',
                            fontWeight: 300,
                            margin: 0,
                          }}
                        >
                          {formatPrice(parseFloat(product.price) * quantity, cartCurrency)}
                        </p>
                        {quantity > 1 && (
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 'var(--text-xs)',
                              color: 'var(--graphite)',
                              fontWeight: 300,
                              margin: '4px 0 0',
                            }}
                          >
                            {formatPrice(product.price, cartCurrency)} each
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div style={{ marginTop: '24px' }}>
                <Link
                  href="/shop"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--graphite)',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  }}
                >
                  ← Continue Shopping
                </Link>
              </div>
            </div>

            {/* ── Order summary ────────────────────────────────────── */}
            <div
              style={{
                backgroundColor: 'var(--nacre)',
                padding: '36px',
                position: 'sticky',
                top: '100px',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-lg)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  margin: '0 0 28px',
                }}
              >
                Order Summary
              </h2>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  marginBottom: '28px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-xs)',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--graphite)',
                    }}
                  >
                    Subtotal
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      color: 'var(--ink)',
                      fontWeight: 300,
                    }}
                  >
                    {formatPrice(displayTotal, cartCurrency)}
                  </span>
                </div>

                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-xs)',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--graphite)',
                    }}
                  >
                    Estimated Shipping
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-sm)',
                      // 13.2-15.2px at weight 300 on bare --bg: ordinary body
                      // copy, and the only one of the four sage usages with no
                      // tint softening it. Was 2.36:1.
                      color: 'var(--sage-text)',
                      fontWeight: 300,
                    }}
                  >
                    Free
                  </span>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--ash)', margin: '4px 0' }} />

                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-base)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--ink)',
                    }}
                  >
                    Total
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-xl)',
                      letterSpacing: '0.06em',
                      color: 'var(--ink)',
                    }}
                  >
                    {formatPrice(displayTotal, cartCurrency)}
                  </span>
                </div>
              </div>

              <a
                href="/checkout"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '18px',
                  backgroundColor: 'var(--ink)',
                  color: 'var(--bg)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.9rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                Proceed to Checkout
              </a>

              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--graphite)',
                  fontWeight: 300,
                  textAlign: 'center',
                  margin: '16px 0 0',
                  lineHeight: 1.5,
                }}
              >
                Taxes calculated at checkout. Free shipping on all orders.
              </p>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  )
}
