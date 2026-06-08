'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCartStore } from '@/store/cart'
import { useCheckoutUrl, useCartIsLoading } from '@/lib/hooks/useCart'

export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((state) => state.items)
  const syncWithShopify = useCartStore((state) => state.syncWithShopify)
  const checkoutUrl = useCheckoutUrl()
  const isLoading = useCartIsLoading()

  useEffect(() => {
    if (items.length === 0) {
      router.push('/cart')
      return
    }
    // Kick off Shopify cart sync to get the real checkoutUrl
    syncWithShopify()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl
    }
  }, [checkoutUrl])

  const label = isLoading ? 'Syncing cart…' : 'Preparing checkout…'

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F7F5F1',
        color: '#1A1714',
        fontFamily: 'var(--font-display)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontSize: '1rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: 0.6,
          }}
        >
          {label}
        </p>
        {!isLoading && !checkoutUrl && items.length > 0 && (
          <p
            style={{
              marginTop: 16,
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              color: '#6B6762',
            }}
          >
            Connect your Shopify store to enable checkout.
          </p>
        )}
      </div>
    </main>
  )
}
