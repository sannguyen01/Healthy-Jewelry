'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCartStore } from '@/store/cart'
import { useCheckoutUrl, useCartIsLoading, useCheckoutError } from '@/lib/hooks/useCart'
import { checkoutMessage, supportMailto } from '@/lib/utils/checkoutMessages'

/**
 * The handoff to Shopify's hosted checkout.
 *
 * On success this page is a doorway — it syncs the bag to Shopify, gets a
 * checkoutUrl back, and redirects. Payment and the order confirmation email are
 * Shopify's, which is why no confirmation screen lives here.
 *
 * The part that matters is what happens when that fails. It used to render
 * "Preparing checkout…" forever, then a line telling the customer to connect a
 * Shopify store. Now a failure says so plainly, keeps the bag, and offers a
 * route to a human.
 */
export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((state) => state.items)
  const syncWithShopify = useCartStore((state) => state.syncWithShopify)
  const checkoutUrl = useCheckoutUrl()
  const isLoading = useCartIsLoading()
  const checkoutError = useCheckoutError()
  const hasHydrated = useCartStore((state) => state.hasHydrated)

  // Waits for the persisted bag to be read back before acting. The previous
  // version ran once on mount with an empty dependency array, so it always saw
  // `items === []` — rehydration had not finished — and redirected every
  // visitor to /cart, including ones with a full bag. That made this page
  // unreachable by direct navigation or refresh.
  useEffect(() => {
    if (!hasHydrated) return
    if (items.length === 0) {
      router.push('/cart')
      return
    }
    syncWithShopify()
  }, [hasHydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl
    }
  }, [checkoutUrl])

  const itemSummary = items
    .map((item) => `${item.quantity} × ${item.product.title}`)
    .join('\n')

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        padding: 'clamp(24px, 6vw, 80px)',
      }}
    >
      {checkoutError ? (
        <CheckoutFailure error={checkoutError} itemSummary={itemSummary} onRetry={syncWithShopify} />
      ) : (
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--graphite)',
          }}
        >
          {isLoading ? 'Syncing bag…' : 'Preparing checkout…'}
        </p>
      )}
    </main>
  )
}

function CheckoutFailure({
  error,
  itemSummary,
  onRetry,
}: {
  error: NonNullable<ReturnType<typeof useCheckoutError>>
  itemSummary: string
  onRetry: () => void
}) {
  const { title, body, retryable } = checkoutMessage(error)

  return (
    <div style={{ maxWidth: '460px', textAlign: 'center' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 500,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--ink)',
          lineHeight: 1.1,
          margin: '0 0 16px',
        }}
      >
        {title}
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-base)',
          color: 'var(--graphite)',
          lineHeight: 1.7,
          margin: '0 0 32px',
        }}
      >
        {body}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'center',
        }}
      >
        {retryable && (
          <button
            onClick={onRetry}
            style={{
              padding: '14px 32px',
              backgroundColor: 'var(--ink)',
              color: 'var(--bg)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        )}

        <a href={supportMailto(itemSummary)} className="btn-ghost">
          Email us
        </a>

        <Link href="/cart" className="btn-ghost">
          Back to bag
        </Link>
      </div>
    </div>
  )
}
