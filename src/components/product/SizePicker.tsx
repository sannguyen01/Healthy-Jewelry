'use client'

import type { ProductVariant, ProductOption } from '@/lib/shopify/types'

export interface SizeOption {
  /** The option value exactly as Shopify stores it — e.g. "9" or "M (175mm)". */
  value: string
  /** Short label for the swatch — e.g. "9" or "M". */
  label: string
  /** False when no variant carrying this value can currently be bought. */
  available: boolean
  /** True when Shopify lists the value but ships no variant for it at all. */
  missing: boolean
}

interface SizePickerProps {
  /** Shopify's option definitions for the product. */
  options: ProductOption[]
  /** Every variant of the product, used to resolve availability per size. */
  variants: ProductVariant[]
  onSelect: (size: string) => void
  selected?: string
  /** Which option to render. Defaults to the product's size option. */
  optionName?: string
}

// Shopify merchants name the size option inconsistently across markets.
const SIZE_OPTION_NAMES = ['size', 'ring size', 'kích cỡ', 'cỡ']

function isSizeOption(name: string): boolean {
  return SIZE_OPTION_NAMES.includes(name.trim().toLowerCase())
}

/**
 * Shortens a Shopify option value for the swatch face: "M (175mm)" → "M".
 * The full value stays in the aria-label and is what gets matched to a variant.
 */
export function shortSizeLabel(value: string): string {
  const parenIndex = value.indexOf(' (')
  return parenIndex > 0 ? value.slice(0, parenIndex) : value
}

/**
 * Builds the pickable size list from Shopify's own option values and variants.
 *
 * This used to be a hardcoded array of US ring sizes 5–12 with no connection to
 * the store's actual catalog. A size with no variant looked pickable but left
 * "Add to Bag" permanently disabled with no explanation, and a sold-out size
 * looked identical to an in-stock one right up until Shopify refused the
 * checkout. Deriving from the catalog makes both states impossible to render
 * wrongly.
 *
 * Exported for direct unit testing.
 */
export function buildSizeOptions(
  options: ProductOption[],
  variants: ProductVariant[],
  optionName?: string
): { name: string; sizes: SizeOption[] } | null {
  const option = optionName
    ? options.find((o) => o.name.trim().toLowerCase() === optionName.trim().toLowerCase())
    : options.find((o) => isSizeOption(o.name))

  if (!option || option.values.length === 0) return null

  // A single-value option ("Title: Default Title") is Shopify's placeholder for
  // an unsized product — there is nothing to choose, so render nothing.
  if (option.values.length === 1) return null

  const sizes: SizeOption[] = option.values.map((value) => {
    const matching = variants.filter((v) =>
      v.selectedOptions.some(
        (o) => o.name.trim().toLowerCase() === option.name.trim().toLowerCase() && o.value === value
      )
    )
    return {
      value,
      label: shortSizeLabel(value),
      available: matching.some((v) => v.availableForSale),
      missing: matching.length === 0,
    }
  })

  return { name: option.name, sizes }
}

export function SizePicker({ options, variants, onSelect, selected, optionName }: SizePickerProps) {
  const built = buildSizeOptions(options, variants, optionName)
  if (!built) return null

  const { name, sizes } = built

  // A size Shopify lists but has no variant for is not a size the customer can
  // buy — hide it entirely rather than render a permanently dead swatch.
  const pickable = sizes.filter((s) => !s.missing)
  if (pickable.length === 0) return null

  const allSoldOut = pickable.every((s) => !s.available)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <span className="label-eyebrow" style={{ display: 'block' }}>
          {name}
        </span>
        {selected && (
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.08em',
              color: 'var(--graphite)',
            }}
          >
            {selected}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={name}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
      >
        {pickable.map(({ value, label, available }) => {
          const isSelected = selected === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!available}
              disabled={!available}
              onClick={() => available && onSelect(value)}
              data-testid={`size-${value}`}
              data-available={available}
              title={available ? undefined : `${value} — sold out`}
              style={{
                minWidth: '40px',
                height: '40px',
                padding: label.length > 2 ? '0 14px' : '0',
                border: `1px solid ${isSelected ? 'var(--ink)' : 'var(--ash)'}`,
                backgroundColor: isSelected ? 'var(--ink)' : 'transparent',
                color: isSelected ? 'var(--bg)' : available ? 'var(--ink)' : 'var(--mist)',
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                cursor: available ? 'pointer' : 'not-allowed',
                // A diagonal strike is the conventional sold-out treatment and
                // survives being read at a glance, unlike opacity alone.
                backgroundImage: available
                  ? undefined
                  : 'linear-gradient(to top left, transparent calc(50% - 0.5px), var(--ash) calc(50% - 0.5px), var(--ash) calc(50% + 0.5px), transparent calc(50% + 0.5px))',
                transition: `border-color var(--duration-fast) var(--ease),
                             background-color var(--duration-fast) var(--ease),
                             color var(--duration-fast) var(--ease)`,
              }}
              onMouseEnter={(e) => {
                if (!isSelected && available) {
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && available) {
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ash)'
                }
              }}
              aria-label={available ? `${name} ${value}` : `${name} ${value} — sold out`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {allSoldOut && (
        <p
          role="status"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            color: 'var(--graphite)',
            fontWeight: 300,
            margin: '10px 0 0',
          }}
        >
          Every size is currently sold out. Contact us to be notified when this piece returns.
        </p>
      )}
    </div>
  )
}

export default SizePicker
