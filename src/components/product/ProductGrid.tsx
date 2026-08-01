'use client'

import { useState, useMemo } from 'react'
import type { HJProduct, HJCollectionHandle } from '@/lib/shopify/types'
import { ProductCard } from '@/components/product/ProductCard'

interface ProductGridProps {
  products: HJProduct[]
  showFilters?: boolean
}

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest'

const COLLECTION_FILTERS: { label: string; value: HJCollectionHandle | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Rings', value: 'rings' },
  { label: 'Necklaces', value: 'necklaces' },
  { label: 'Earrings', value: 'earrings' },
  { label: 'Bracelets', value: 'bracelets' },
  { label: 'Charms', value: 'charms' },
]

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Featured', value: 'featured' },
  { label: 'Price: Low → High', value: 'price-asc' },
  { label: 'Price: High → Low', value: 'price-desc' },
  { label: 'Newest', value: 'newest' },
]

export function ProductGrid({ products, showFilters = false }: ProductGridProps) {
  const [activeCollection, setActiveCollection] = useState<HJCollectionHandle | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortKey>('featured')

  const filtered = useMemo(() => {
    let list = activeCollection === 'all'
      ? [...products]
      : products.filter((p) => p.collection === activeCollection)

    if (sortBy === 'price-asc') {
      list = [...list].sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
    } else if (sortBy === 'price-desc') {
      list = [...list].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    } else if (sortBy === 'newest') {
      list = [...list].filter((p) => p.badge === 'New').concat(
        [...list].filter((p) => p.badge !== 'New')
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
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}

export default ProductGrid
