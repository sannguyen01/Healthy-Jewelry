'use client'

import { useState, useMemo } from 'react'
import type { CatalogProduct } from '@/lib/catalog'
import type { CollectionHandle } from '@/lib/catalog/schema'
import { ProductCard } from '@/components/product/ProductCard'

interface ProductGridProps {
  products: readonly CatalogProduct[]
  showFilters?: boolean
}

/**
 * `price-asc` and `price-desc` are gone: there is no price to sort on.
 *
 * Removed from the union rather than left unhandled, so a stale `?sort=price-asc` in a
 * bookmark is a type the component cannot represent instead of a silent no-op that looks
 * like a broken control.
 */
type SortKey = 'featured' | 'newest'

const COLLECTION_FILTERS: { label: string; value: CollectionHandle | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Rings', value: 'rings' },
  { label: 'Necklaces', value: 'necklaces' },
  { label: 'Earrings', value: 'earrings' },
  { label: 'Bracelets', value: 'bracelets' },
  { label: 'Charms', value: 'charms' },
]

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Featured', value: 'featured' },
  { label: 'Newest', value: 'newest' },
]

export function ProductGrid({ products, showFilters = false }: ProductGridProps) {
  const [activeCollection, setActiveCollection] = useState<CollectionHandle | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortKey>('featured')

  const filtered = useMemo(() => {
    let list = activeCollection === 'all'
      ? [...products]
      : products.filter((p) => p.collection === activeCollection)

    if (sortBy === 'newest') {
      list = [...list].filter((p) => p.badge === 'new').concat(
        [...list].filter((p) => p.badge !== 'new')
      )
    }

    return list
  }, [products, activeCollection, sortBy])

  return (
    <div>
      {showFilters && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: 'var(--space-gutter)',
          }}
        >
          {/* Collection filter buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {COLLECTION_FILTERS.map(({ label, value }) => {
              const isActive = activeCollection === value
              return (
                <button
                  key={value}
                  onClick={() => setActiveCollection(value)}
                  style={{
                    padding: '7px 16px',
                    border: '1px solid var(--ash)',
                    backgroundColor: isActive ? 'var(--ink)' : 'transparent',
                    color: isActive ? 'var(--bg)' : 'var(--ink)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    cursor: 'pointer',
                    transition: `background-color var(--duration-fast) var(--ease),
                                 color var(--duration-fast) var(--ease),
                                 border-color var(--duration-fast) var(--ease)`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      const btn = e.currentTarget as HTMLButtonElement
                      btn.style.borderColor = 'var(--ink)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      const btn = e.currentTarget as HTMLButtonElement
                      btn.style.borderColor = 'var(--ash)'
                    }
                  }}
                  aria-pressed={isActive}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            style={{
              padding: '7px 12px',
              border: '1px solid var(--ash)',
              backgroundColor: 'transparent',
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              outline: 'none',
            }}
            aria-label="Sort products"
          >
            {SORT_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 0',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--graphite)',
          }}
        >
          No products found
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--space-gutter)',
          }}
        >
          {filtered.map((product) => (
            <ProductCard key={product.handle} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}

export default ProductGrid
