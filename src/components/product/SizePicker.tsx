'use client'

import type { HJCollectionHandle } from '@/lib/shopify/types'

interface SizePickerProps {
  collection: HJCollectionHandle
  onSelect: (size: string) => void
  selected?: string
}

const RING_SIZES: string[] = ['5', '6', '7', '8', '9', '10', '11', '12']

const BRACELET_SIZES: { label: string; value: string }[] = [
  { label: 'XS', value: 'XS (155mm)' },
  { label: 'S', value: 'S (165mm)' },
  { label: 'M', value: 'M (175mm)' },
  { label: 'L', value: 'L (185mm)' },
  { label: 'XL', value: 'XL (195mm)' },
]

export function SizePicker({ collection, onSelect, selected }: SizePickerProps) {
  if (collection !== 'rings' && collection !== 'bracelets') return null

  const sizeLabel = collection === 'rings' ? 'US Ring Size' : 'Bracelet Size'

  return (
    <div>
      <span
        className="label-eyebrow"
        style={{ marginBottom: '10px', display: 'block' }}
      >
        {sizeLabel}
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {collection === 'rings'
          ? RING_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => onSelect(size)}
                style={{
                  width: '40px',
                  height: '40px',
                  border: `1px solid ${selected === size ? 'var(--ink)' : 'var(--ash)'}`,
                  backgroundColor: selected === size ? 'var(--ink)' : 'transparent',
                  color: selected === size ? 'var(--bg)' : 'var(--ink)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: `border-color var(--duration-fast) var(--ease),
                               background-color var(--duration-fast) var(--ease),
                               color var(--duration-fast) var(--ease)`,
                }}
                onMouseEnter={(e) => {
                  if (selected !== size) {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selected !== size) {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ash)'
                  }
                }}
                aria-pressed={selected === size}
                aria-label={`Ring size ${size}`}
              >
                {size}
              </button>
            ))
          : BRACELET_SIZES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => onSelect(value)}
                style={{
                  padding: '8px 14px',
                  border: `1px solid ${selected === value ? 'var(--ink)' : 'var(--ash)'}`,
                  backgroundColor: selected === value ? 'var(--ink)' : 'transparent',
                  color: selected === value ? 'var(--bg)' : 'var(--ink)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: `border-color var(--duration-fast) var(--ease),
                               background-color var(--duration-fast) var(--ease),
                               color var(--duration-fast) var(--ease)`,
                }}
                onMouseEnter={(e) => {
                  if (selected !== value) {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selected !== value) {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ash)'
                  }
                }}
                aria-pressed={selected === value}
                aria-label={`Bracelet size ${label}`}
              >
                {label}
              </button>
            ))}
      </div>
    </div>
  )
}

export default SizePicker
