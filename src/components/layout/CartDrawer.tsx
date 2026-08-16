'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useCartStore, cartItemVariantLabel } from '@/store/cart'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { ProductImage } from '@/components/product/ProductImage'
import {
  checkoutMessage,
  supportMailto,
  SUPPORT_EMAIL,
  ORDER_CONFIRMATION,
} from '@/lib/utils/checkoutMessages'
import { formatPrice, cartCurrencyCode } from '@/lib/utils/formatPrice'

export function CartDrawer() {
  const isOpen = useCartStore((s) => s.isOpen)
  const items = useCartStore((s) => s.items)
  const closeCart = useCartStore((s) => s.closeCart)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const total = useCartStore((s) => s.totalPrice())
  const syncWithShopify = useCartStore((s) => s.syncWithShopify)
  const isLoading = useCartStore((s) => s.isLoading)
  const checkoutError = useCartStore((s) => s.checkoutError)
  const justCompleted = useCartStore((s) => s.justCompleted)
  const shopifyTotal = useCartStore((s) => s.shopifyTotal)
  const cartCurrency = cartCurrencyCode(items)
  // Shopify's figure when we have one, the local sum only until the first
  // sync. `total` is summed from prices captured in localStorage when each
  // item was added, which for a bag left open across a price change is not
  // what the customer will be charged.
  const displayTotal = shopifyTotal ?? total

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

  if (!isOpen) return null

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
                {/* An empty bag means two very different things depending on
                    whether the customer just paid. "Your bag is empty" is a
                    cold thing to show someone thirty seconds after they were
                    charged. */}
                {justCompleted ? ORDER_CONFIRMATION.title : 'Your bag is empty'}
              </p>
              {justCompleted && (
                <p
                  role="status"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 300,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--graphite)',
                    lineHeight: 1.7,
                    textAlign: 'center',
                    maxWidth: '30ch',
                    margin: 0,
                  }}
                >
                  {ORDER_CONFIRMATION.body}
                </p>
              )}
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
              {items.map(({ product, quantity, variantId }) => {
                const variantLabel = cartItemVariantLabel({ product, variantId })
                return (
                  <li
                    key={variantId}
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
                        position: 'relative',
                      }}
                    >
                      <ProductImage product={product} svgScale="80%" sizes="64px" />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.88rem',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {product.title}
                      </p>
                      {variantLabel && (
                        <p
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.72rem',
                            color: 'var(--titanium-text)',
                            marginTop: '2px',
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
                        {formatPrice(product.price, product.currencyCode)}
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
                        <button
                          onClick={() => updateQuantity(variantId, quantity - 1)}
                          aria-label="Decrease quantity"
                          style={{
                            width: '24px',
                            height: '24px',
                            border: '1px solid var(--ash)',
                            background: 'none',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.9rem',
                            color: 'var(--ink)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          −
                        </button>
                        <span
                          data-testid="qty-display"
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: '0.72rem',
                            letterSpacing: '0.1em',
                            color: 'var(--ink)',
                            minWidth: '16px',
                            textAlign: 'center',
                          }}
                        >
                          {quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(variantId, quantity + 1)}
                          aria-label="Increase quantity"
                          style={{
                            width: '24px',
                            height: '24px',
                            border: '1px solid var(--ash)',
                            background: 'none',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.9rem',
                            color: 'var(--ink)',
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
                marginBottom: '16px',
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
                Total
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  color: 'var(--ink)',
                }}
              >
                {formatPrice(displayTotal, cartCurrency)}
              </span>
            </div>
            {checkoutError && (
              <div
                role="alert"
                style={{
                  marginBottom: '16px',
                  padding: '14px 16px',
                  border: '1px solid var(--ash)',
                  backgroundColor: 'var(--nacre)',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: '0 0 6px',
                  }}
                >
                  {checkoutMessage(checkoutError).title}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 300,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--graphite)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {checkoutMessage(checkoutError).body}{' '}
                  <a
                    href={supportMailto(
                      items
                        .map((i) => {
                          const label = cartItemVariantLabel(i)
                          return `${i.quantity} × ${i.product.title}${label ? ` (${label})` : ''}`
                        })
                        .join('\n')
                    )}
                    style={{ color: 'var(--ink)', textDecoration: 'underline' }}
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              </div>
            )}

            <button
              onClick={async () => {
                await syncWithShopify()
                const { checkoutUrl, checkoutError: err, beginCheckout } = useCartStore.getState()
                if (checkoutUrl) {
                  // Record which cart we are sending them to pay for. Shopify
                  // deletes a cart once an order is created from it, so this id
                  // is the only way to tell a completed purchase apart from an
                  // expired cart when they come back.
                  beginCheckout()
                  window.location.href = checkoutUrl
                  return
                }
                // Previously this navigated to /checkout regardless, where the
                // same sync failed again and left the customer on a spinner.
                // With no URL the error is shown here instead, beside the bag
                // that is still intact.
                if (!err) {
                  window.location.href = '/checkout'
                }
              }}
              disabled={isLoading}
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
          </div>
        )}
      </aside>
    </>
  )
}

export default CartDrawer
