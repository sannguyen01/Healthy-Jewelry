'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { QuantityStepper } from '@/components/product/QuantityStepper'
import { CartNotices } from '@/components/product/CartNotices'
import { DiscountCodeField } from '@/components/product/DiscountCodeField'
import { formatPrice } from '@/lib/utils/formatPrice'
import { describeVariant, cartLineLabel } from '@/lib/utils/cartLine'
import { useCartStore, MAX_LINE_QUANTITY } from '@/store/cart'

export default function CartPage() {
  const items = useCartStore((s) => s.items)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const total = useCartStore((s) => s.totalPrice())
  const totalItems = useCartStore((s) => s.totalItems())
  const currency = useCartStore((s) => s.currencyCode())
  const totals = useCartStore((s) => s.totals)
  const prepareCheckout = useCartStore((s) => s.prepareCheckout)
  const isLoading = useCartStore((s) => s.isLoading)

  const [checkoutFailed, setCheckoutFailed] = useState(false)

  async function handleCheckout() {
    setCheckoutFailed(false)
    const url = await prepareCheckout()
    if (url) {
      window.location.href = url
      return
    }
    setCheckoutFailed(true)
  }

  // Shopify's numbers win once the cart has synced. Before that we show the
  // locally computed subtotal and say plainly that it is not the final figure.
  const subtotalAmount = totals?.subtotal?.amount ?? String(total)
  const totalAmount = totals?.total?.amount ?? String(total)
  const displayCurrency = totals?.subtotal?.currencyCode ?? currency
  const hasShopifyTotals = totals !== null
  const taxAmount = totals?.tax?.amount ?? null

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

              <CartNotices showCheckoutFailure={checkoutFailed} />

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map((item) => {
                  const { product, quantity, variantId } = item
                  const variantLabel = describeVariant(item)
                  const lineLabel = cartLineLabel(product.title, item)
                  const unitPrice = item.unitPrice ?? product.price
                  const unitCurrency = product.currencyCode ?? currency
                  const lineTotal = parseFloat(unitPrice) * quantity

                  return (
                    <li
                      key={variantId}
                      data-testid="cart-line"
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
                        }}
                      >
                        <JewelrySVG
                          type={product.svgType}
                          style={{ width: '60%', height: '60%' }}
                        />
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/products/${product.handle}`}
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.95rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--ink)',
                            textDecoration: 'none',
                            display: 'block',
                            margin: '0 0 4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {product.title}
                        </Link>

                        <p
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--text-xs)',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--titanium)',
                            margin: '0 0 12px',
                          }}
                        >
                          {product.material.replace('-', ' ')}
                          {variantLabel && (
                            <>
                              {' · '}
                              <span data-testid="cart-line-variant">{variantLabel}</span>
                            </>
                          )}
                        </p>

                        {/* Qty controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <QuantityStepper
                            value={quantity}
                            min={1}
                            max={MAX_LINE_QUANTITY}
                            label={lineLabel}
                            onChange={(next) => updateQuantity(variantId, next)}
                          />

                          <button
                            onClick={() => removeItem(variantId)}
                            aria-label={`Remove ${lineLabel}`}
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
                          {formatPrice(lineTotal, unitCurrency)}
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
                            {formatPrice(unitPrice, unitCurrency)} each
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
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
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
                    data-testid="cart-subtotal"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      color: 'var(--ink)',
                      fontWeight: 300,
                    }}
                  >
                    {formatPrice(subtotalAmount, displayCurrency)}
                  </span>
                </div>

                {/* Only shown once Shopify has computed it — an anonymous cart
                    has no address, so there is no honest tax figure to give. */}
                {taxAmount !== null && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
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
                      Tax
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--ink)',
                        fontWeight: 300,
                      }}
                    >
                      {formatPrice(taxAmount, displayCurrency)}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
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
                    Shipping
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--graphite)',
                      fontWeight: 300,
                    }}
                  >
                    Calculated at checkout
                  </span>
                </div>

                <DiscountCodeField />

                <div style={{ height: '1px', backgroundColor: 'var(--ash)', margin: '4px 0' }} />

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
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
                    {hasShopifyTotals ? 'Total' : 'Estimated Total'}
                  </span>
                  <span
                    data-testid="cart-total"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-xl)',
                      letterSpacing: '0.06em',
                      color: 'var(--ink)',
                    }}
                  >
                    {formatPrice(totalAmount, displayCurrency)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isLoading}
                data-testid="checkout-button"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '18px',
                  backgroundColor: isLoading ? 'var(--graphite)' : 'var(--ink)',
                  color: 'var(--bg)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.9rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                {isLoading ? 'Preparing…' : 'Proceed to Checkout'}
              </button>

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
                Shipping and taxes are calculated at checkout. You will be taken to our secure
                Shopify checkout to complete your order.
              </p>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  )
}
