'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { useCartStore } from '@/store/cart'

/**
 * Post-purchase landing page.
 *
 * Shopify hosts the checkout, so the browser leaves this site to pay and comes
 * back with the local bag exactly as it was. Without this page the customer
 * returns to a full bag after a completed order — which reads as "the payment
 * failed" and invites a duplicate purchase. Point Shopify's post-purchase
 * redirect here (see docs/SHOPIFY-ADMIN-RUNBOOK.md) so the bag is cleared at
 * the one moment we know the order is real.
 */
function OrderConfirmedContent() {
  const params = useSearchParams()
  const clearCart = useCartStore((s) => s.clearCart)
  const [clearedCount, setClearedCount] = useState<number | null>(null)

  // Shopify's Liquid order-status template can pass the order number through.
  const orderNumber = params.get('order') ?? params.get('order_number')

  useEffect(() => {
    const count = useCartStore.getState().totalItems()
    clearCart()
    setClearedCount(count)
  }, [clearCart])

  return (
    <main
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        minHeight: '100vh',
        paddingTop: '80px',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          margin: '0 auto',
          padding: 'clamp(48px, 8vw, 96px) clamp(24px, 5vw, 48px)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <JewelrySVG type="ring-arc" style={{ width: '72px', height: '72px', opacity: 0.25 }} />

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
          Thank you
        </h1>

        {orderNumber && (
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--titanium)',
              margin: 0,
            }}
          >
            Order {orderNumber}
          </p>
        )}

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            fontWeight: 300,
            color: 'var(--graphite)',
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          Your order is confirmed. A receipt is on its way to your inbox, and you will get a second
          email with tracking as soon as your pieces ship.
        </p>

        {/* Stated explicitly so a customer who glances at the bag icon and sees
            zero knows why, rather than wondering whether something was lost. */}
        {clearedCount !== null && clearedCount > 0 && (
          <p
            role="status"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              fontWeight: 300,
              color: 'var(--mist)',
              margin: 0,
            }}
          >
            Your bag has been emptied.
          </p>
        )}

        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: 'var(--ash)',
            margin: '8px 0',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'center',
          }}
        >
          <Link href="/shop" className="btn-ghost">
            Continue Shopping
          </Link>
          <Link
            href="/contact"
            style={{
              alignSelf: 'center',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Questions about your order
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function OrderConfirmedPage() {
  return (
    <>
      <Nav />
      {/* useSearchParams needs a Suspense boundary for static prerendering */}
      <Suspense fallback={null}>
        <OrderConfirmedContent />
      </Suspense>
      <Footer />
    </>
  )
}
