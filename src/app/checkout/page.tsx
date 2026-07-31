'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCartStore, cartErrorMessage } from '@/store/cart'
import { useCartError } from '@/lib/hooks/useCart'

type Phase = 'preparing' | 'redirecting' | 'failed'

/**
 * Checkout hand-off interstitial.
 *
 * This page exists for the moment between "customer pressed Checkout" and
 * "Shopify's checkout has loaded". Its only job is to obtain a freshly
 * validated checkout URL and go there — but the failure path is what matters,
 * because that is where orders are lost. Previously a failed sync left this
 * page spinning on "Preparing checkout…" with the developer-facing note
 * "Connect your Shopify store to enable checkout", no retry, and no way back
 * to the bag.
 */
export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const prepareCheckout = useCartStore((s) => s.prepareCheckout)
  const error = useCartError()

  const [phase, setPhase] = useState<Phase>('preparing')
  // StrictMode double-invokes effects in development; without this guard the
  // hand-off fires twice and the second sync races the first.
  const startedRef = useRef(false)

  const attempt = useCallback(async () => {
    setPhase('preparing')
    const url = await prepareCheckout()
    if (url) {
      setPhase('redirecting')
      window.location.href = url
      return
    }
    setPhase('failed')
  }, [prepareCheckout])

  useEffect(() => {
    if (items.length === 0) {
      router.replace('/cart')
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    void attempt()
  }, [items.length, router, attempt])

  const isBusy = phase === 'preparing' || phase === 'redirecting'

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        padding: '24px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        {isBusy ? (
          <>
            <p
              role="status"
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
                margin: 0,
              }}
            >
              {phase === 'redirecting' ? 'Taking you to checkout…' : 'Preparing checkout…'}
            </p>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-xs)',
                fontWeight: 300,
                color: 'var(--graphite)',
                margin: '14px 0 0',
                lineHeight: 1.6,
              }}
            >
              You are being taken to our secure Shopify checkout. Please do not close this window.
            </p>
          </>
        ) : (
          <>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 16px',
              }}
            >
              We could not open checkout
            </h1>

            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                fontWeight: 300,
                color: 'var(--graphite)',
                lineHeight: 1.65,
                margin: '0 0 28px',
              }}
            >
              {error?.message ?? cartErrorMessage('unknown')}
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'stretch',
              }}
            >
              <button
                onClick={attempt}
                data-testid="checkout-retry"
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--ink)',
                  color: 'var(--bg)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.9rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>

              <Link
                href="/cart"
                style={{
                  padding: '14px',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--graphite)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                Back to your bag
              </Link>

              {/* A checkout that will not open is a lost order unless there is
                  another way to reach us. */}
              <Link
                href="/contact"
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
                Contact us to complete your order
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
