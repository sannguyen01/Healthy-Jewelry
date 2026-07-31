'use client'

interface QuantityStepperProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** Name of the thing being counted, used to build accessible labels. */
  label?: string
  /** Compact variant for dense contexts like the cart drawer. */
  size?: 'sm' | 'md'
  disabled?: boolean
}

/**
 * The single quantity control for the whole site.
 *
 * The product page, cart drawer and cart page each had their own stepper with
 * subtly different behaviour — only one of them stopped at a maximum, none of
 * them announced the change to screen readers, and the drawer's decrement
 * silently removed the line at zero without saying so. One component means one
 * set of bounds and one set of semantics.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label = 'item',
  size = 'md',
  disabled = false,
}: QuantityStepperProps) {
  const box = size === 'sm' ? 24 : 28
  const canDecrease = !disabled && value > min
  const canIncrease = !disabled && value < max

  const buttonStyle = (enabled: boolean) =>
    ({
      width: `${box}px`,
      height: `${box}px`,
      border: '1px solid var(--ash)',
      background: 'none',
      cursor: enabled ? 'pointer' : 'not-allowed',
      color: enabled ? 'var(--ink)' : 'var(--mist)',
      fontFamily: 'var(--font-body)',
      fontSize: size === 'sm' ? '0.9rem' : '1rem',
      lineHeight: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      transition: 'border-color var(--duration-fast) var(--ease)',
    }) as const

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? '10px' : '12px' }}>
      <button
        type="button"
        onClick={() => canDecrease && onChange(value - 1)}
        disabled={!canDecrease}
        aria-label={`Decrease quantity of ${label}`}
        style={buttonStyle(canDecrease)}
      >
        −
      </button>

      {/* aria-live so a change announces itself; the stepper buttons keep focus,
          so without it a screen-reader user gets no feedback at all. */}
      <span
        data-testid="qty-display"
        role="status"
        aria-live="polite"
        aria-label={`Quantity of ${label}: ${value}`}
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: size === 'sm' ? '0.72rem' : 'var(--text-xs)',
          letterSpacing: '0.1em',
          color: 'var(--ink)',
          minWidth: size === 'sm' ? '16px' : '20px',
          textAlign: 'center',
        }}
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => canIncrease && onChange(value + 1)}
        disabled={!canIncrease}
        aria-label={
          canIncrease
            ? `Increase quantity of ${label}`
            : `Maximum quantity of ${max} reached for ${label}`
        }
        title={canIncrease ? undefined : `Limit ${max} per order`}
        style={buttonStyle(canIncrease)}
      >
        +
      </button>
    </div>
  )
}

export default QuantityStepper
