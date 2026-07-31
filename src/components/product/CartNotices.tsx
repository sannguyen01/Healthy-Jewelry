'use client'

import { useCartStore } from '@/store/cart'
import { cartErrorMessage } from '@/store/cart'

interface CartNoticesProps {
  /** Set when a checkout attempt failed but the store carries no specific error. */
  showCheckoutFailure?: boolean
}

/**
 * Surfaces cart problems to the customer.
 *
 * Every cart failure used to be a `console.warn`. From the customer's side that
 * meant a checkout button that did nothing, a bag that quietly lost an item, or
 * a quantity that reset itself with no explanation. These are the moments an
 * order is won or lost, so they get real, specific copy.
 */
export function CartNotices({ showCheckoutFailure = false }: CartNoticesProps) {
  const error = useCartStore((s) => s.error)
  const adjustments = useCartStore((s) => s.adjustments)
  const clearError = useCartStore((s) => s.clearError)
  const dismissAdjustments = useCartStore((s) => s.dismissAdjustments)

  const hasError = error !== null || showCheckoutFailure
  const hasAdjustments = adjustments.length > 0

  if (!hasError && !hasAdjustments) return null

  return (
    <div style={{ margin: '16px 0 0' }}>
      {hasError && (
        <div
          role="alert"
          data-testid="cart-error"
          style={{
            border: '1px solid var(--ash)',
            borderLeft: '2px solid var(--ink)',
            backgroundColor: 'var(--nacre)',
            padding: '14px 16px',
            marginBottom: hasAdjustments ? '10px' : 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <p
            style={{
              flex: 1,
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              fontWeight: 300,
              lineHeight: 1.5,
              color: 'var(--ink)',
            }}
          >
            {error?.message ?? cartErrorMessage('unknown')}
          </p>
          <button
            onClick={clearError}
            aria-label="Dismiss error"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--graphite)',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {hasAdjustments && (
        <div
          role="status"
          data-testid="cart-adjustments"
          style={{
            border: '1px solid var(--ash)',
            borderLeft: '2px solid var(--sage)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <ul style={{ flex: 1, listStyle: 'none', padding: 0, margin: 0 }}>
            {adjustments.map((note) => (
              <li
                key={note}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 300,
                  lineHeight: 1.5,
                  color: 'var(--graphite)',
                }}
              >
                {note}
              </li>
            ))}
          </ul>
          <button
            onClick={dismissAdjustments}
            aria-label="Dismiss bag updates"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--graphite)',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default CartNotices
