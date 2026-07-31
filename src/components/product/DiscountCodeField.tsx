'use client'

import { useState } from 'react'
import { useCartStore } from '@/store/cart'

type Status = 'idle' | 'applying' | 'applied' | 'invalid'

/**
 * Promotion code entry for the cart.
 *
 * The storefront previously had nowhere to enter a discount code, so every
 * promotion the store ran was only discoverable at Shopify's own checkout —
 * after the customer had already seen an undiscounted total and decided whether
 * it was worth it. Applying at the cart means the discount is visible in the
 * summary before the decision, and Shopify validates it server-side.
 */
export function DiscountCodeField() {
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode)
  const removeDiscountCode = useCartStore((s) => s.removeDiscountCode)
  const discountCodes = useCartStore((s) => s.discountCodes)

  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [expanded, setExpanded] = useState(false)

  const applied = discountCodes.filter((d) => d.applicable)

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setStatus('applying')
    const ok = await applyDiscountCode(code)
    setStatus(ok ? 'applied' : 'invalid')
    if (ok) setCode('')
  }

  if (!expanded && applied.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--graphite)',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
        }}
      >
        Add a promotion code
      </button>
    )
  }

  return (
    <div>
      {applied.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {applied.map((d) => (
            <li
              key={d.code}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--sage)',
                }}
              >
                {d.code} applied
              </span>
              <button
                type="button"
                onClick={() => removeDiscountCode(d.code)}
                aria-label={`Remove promotion code ${d.code}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--graphite)',
                  padding: 0,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleApply} style={{ display: 'flex', gap: '8px' }}>
        <label htmlFor="hj-discount-code" className="sr-only">
          Promotion code
        </label>
        <input
          id="hj-discount-code"
          name="discountCode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="Promotion code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={status === 'invalid'}
          aria-describedby={status === 'invalid' ? 'hj-discount-error' : undefined}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 12px',
            border: `1px solid ${status === 'invalid' ? 'var(--ink)' : 'var(--ash)'}`,
            backgroundColor: 'var(--bg)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          disabled={status === 'applying' || !code.trim()}
          style={{
            padding: '10px 16px',
            border: '1px solid var(--ink)',
            backgroundColor: 'transparent',
            color: 'var(--ink)',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: status === 'applying' || !code.trim() ? 'not-allowed' : 'pointer',
            opacity: status === 'applying' || !code.trim() ? 0.5 : 1,
          }}
        >
          {status === 'applying' ? '…' : 'Apply'}
        </button>
      </form>

      {status === 'invalid' && (
        <p
          id="hj-discount-error"
          role="alert"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink)',
            fontWeight: 300,
            margin: '8px 0 0',
          }}
        >
          That code is not valid for the items in your bag.
        </p>
      )}
    </div>
  )
}

export default DiscountCodeField
