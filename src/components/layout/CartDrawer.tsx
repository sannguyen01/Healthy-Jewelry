'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useCartStore, MAX_LINE_QUANTITY } from '@/store/cart'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { QuantityStepper } from '@/components/product/QuantityStepper'
import { CartNotices } from '@/components/product/CartNotices'
import { formatPrice } from '@/lib/utils/formatPrice'
import { describeVariant, cartLineLabel } from '@/lib/utils/cartLine'

export function CartDrawer() {
  const isOpen = useCartStore((s) => s.isOpen)
  const items = useCartStore((s) => s.items)
  const closeCart = useCartStore((s) => s.closeCart)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const total = useCartStore((s) => s.totalPrice())
  const currency = useCartStore((s) => s.currencyCode())
  const totals = useCartStore((s) => s.totals)
  const prepareCheckout = useCartStore((s) => s.prepareCheckout)
  const isLoading = useCartStore((s) => s.isLoading)

  const panelRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [checkoutFailed, setCheckoutFailed] = useState(false)

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeCart])

  // Move focus into the dialog on open and trap it there. The drawer declares
  // aria-modal, so without a real trap a keyboard user tabs straight out into
  // the page behind it and loses track of where they are.
  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleTab)
    return () => {
      window.removeEventListener('keydown', handleTab)
      previouslyFocused?.focus?.()
    }
  }, [isOpen])

  async function handleCheckout() {
    setCheckoutFailed(false)
    const url = await prepareCheckout()
    if (url) {
      window.location.href = url
      return
    }
    // Previously this fell through to `window.location.href = '/checkout'`,
    // where the same sync failed again and the customer was left staring at
    // "Preparing checkout…" forever. Fail in place, where the bag is still
    // visible and the error is actionable.
    setCheckoutFailed(true)
  }

  if (!isOpen) return null

  // Shopify's subtotal is authoritative once synced; before that we show the
  // locally computed figure and label it an estimate.
  const displaySubtotal = totals?.subtotal?.amount ?? String(total)
  const displayCurrency = totals?.subtotal?.currencyCode ?? currency

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={closeCart}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 95,
          backgroundColor: 'rgba(26,23,20,0.4)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 96,
          width: 'min(420px, 100vw)',
          backgroundColor: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 40px rgba(0,0,0,0.08)',
          animation: 'hj-drawer-in 0.38s cubic-bezier(0.00,0.00,0.30,1.00) both',
        }}
      >
        <style>{`
          @keyframes hj-drawer-in {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            aside[aria-label="Shopping bag"] { animation: none !important; }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--ash)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
            }}
          >
            Your Bag
            {items.length > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  color: 'var(--graphite)',
                  marginLeft: '10px',
                  fontWeight: 400,
                }}
              >
                ({items.reduce((s, i) => s + i.quantity, 0)})
              </span>
            )}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={closeCart}
            aria-label="Close bag"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--graphite)',
              fontSize: '1.4rem',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Items or empty state */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          <CartNotices showCheckoutFailure={checkoutFailed} />

          {items.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '20px',
                paddingBottom: '80px',
              }}
            >
              <JewelrySVG type="ring-arc" className="w-16 h-16 opacity-20" />
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--graphite)',
                }}
              >
                Your bag is empty
              </p>
              <Link
                href="/shop"
                onClick={closeCart}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.7rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  borderBottom: '1px solid var(--ink)',
                  paddingBottom: '2px',
                  textDecoration: 'none',
                }}
              >
                Shop Now
              </Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
              {items.map((item) => {
                const { product, quantity, variantId } = item
                const variantLabel = describeVariant(item)
                const lineLabel = cartLineLabel(product.title, item)
                const unitCurrency = product.currencyCode ?? currency
                return (
                  // Keyed by variant: two sizes of the same ring are two lines,
                  // and keying by product id made React reuse one row for both.
                  <li
                    key={variantId}
                    data-testid="cart-line"
                    style={{
                      display: 'flex',
                      gap: '16px',
                      padding: '16px 0',
                      borderBottom: '1px solid var(--nacre)',
                      alignItems: 'center',
                    }}
                  >
                    {/* SVG preview */}
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        flexShrink: 0,
                        backgroundColor: 'var(--nacre)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <JewelrySVG type={product.svgType} className="w-4/5 h-4/5" />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={`/products/${product.handle}`}
                        onClick={closeCart}
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.88rem',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--ink)',
                          textDecoration: 'none',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {product.title}
                      </Link>

                      {/* Which size — the fact a ring buyer most needs to verify */}
                      {variantLabel && (
                        <p
                          data-testid="cart-line-variant"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.65rem',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--titanium-text)',
                            margin: '3px 0 0',
                          }}
                        >
                          {variantLabel}
                        </p>
                      )}

                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.75rem',
                          color: 'var(--graphite)',
                          marginTop: '2px',
                          fontWeight: 300,
                        }}
                      >
                        {formatPrice(item.unitPrice ?? product.price, unitCurrency)}
                      </p>

                      {/* Quantity controls */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          marginTop: '8px',
                        }}
                      >
                        <QuantityStepper
                          value={quantity}
                          min={1}
                          max={MAX_LINE_QUANTITY}
                          size="sm"
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
                            fontSize: '0.62rem',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--graphite)',
                            marginLeft: 'auto',
                            padding: '2px 0',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer — total + checkout */}
        {items.length > 0 && (
          <div
            style={{
              padding: '20px 24px',
              borderTop: '1px solid var(--ash)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.72rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--graphite)',
                }}
              >
                Subtotal
              </span>
              <span
                data-testid="cart-subtotal"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  color: 'var(--ink)',
                }}
              >
                {formatPrice(displaySubtotal, displayCurrency)}
              </span>
            </div>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                color: 'var(--graphite)',
                fontWeight: 300,
                margin: '0 0 16px',
              }}
            >
              Shipping and taxes calculated at checkout.
            </p>

            <button
              onClick={handleCheckout}
              disabled={isLoading}
              data-testid="checkout-button"
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: isLoading ? 'var(--graphite)' : 'var(--ink)',
                color: 'var(--bg)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textAlign: 'center',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isLoading)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--mid)'
              }}
              onMouseLeave={(e) => {
                if (!isLoading)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--ink)'
              }}
            >
              {isLoading ? 'Preparing…' : 'Checkout'}
            </button>

            <Link
              href="/cart"
              onClick={closeCart}
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: '12px',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              View full bag
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}

export default CartDrawer
