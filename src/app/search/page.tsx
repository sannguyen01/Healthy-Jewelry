'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ProductCard } from '@/components/product/ProductCard'
import { getAllProducts } from '@/lib/data/hj-data'

// ── Inner component that reads search params ───────────────────────────────

function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const allProducts = getAllProducts()

  const results =
    query.trim().length === 0
      ? []
      : allProducts.filter((p) => {
          const q = query.toLowerCase()
          return (
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.material.toLowerCase().includes(q) ||
            p.tags.some((tag) => tag.toLowerCase().includes(q)) ||
            p.collection.toLowerCase().includes(q)
          )
        })

  return (
    <main
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        minHeight: '100vh',
        paddingTop: '100px',
      }}
    >
      {/* ── Search header ───────────────────────────────────────────── */}
      <section
        style={{
          padding: 'clamp(32px, 5vw, 64px) clamp(24px, 6vw, 120px)',
          borderBottom: '1px solid var(--ash)',
        }}
      >
        <p className="label-eyebrow" style={{ marginBottom: '20px' }}>
          Search
        </p>

        <form
          method="get"
          action="/search"
          style={{ display: 'flex', gap: '0', maxWidth: '560px' }}
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search titanium, rings, niobium…"
            aria-label="Search products"
            style={{
              flex: 1,
              padding: '14px 20px',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--ink)',
              backgroundColor: 'var(--nacre)',
              border: '1px solid var(--ash)',
              borderRight: 'none',
              outline: 'none',
              fontWeight: 300,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '14px 28px',
              backgroundColor: 'var(--ink)',
              color: 'var(--bg)',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Search
          </button>
        </form>

        {query.trim().length > 0 && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--graphite)',
              fontWeight: 300,
              marginTop: '16px',
            }}
          >
            {results.length === 0
              ? `No results for "${query}"`
              : `${results.length} result${results.length === 1 ? '' : 's'} for "${query}"`}
          </p>
        )}
      </section>

      {/* ── Results or empty state ──────────────────────────────────── */}
      <section
        style={{
          padding: 'clamp(40px, 6vw, 80px) clamp(24px, 6vw, 120px)',
        }}
      >
        {query.trim().length === 0 ? (
          /* No query yet */
          <div
            style={{
              textAlign: 'center',
              padding: '60px 0',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
                margin: '0 0 24px',
              }}
            >
              Start typing to search
            </p>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                fontWeight: 300,
                margin: '0 0 32px',
              }}
            >
              Try &ldquo;titanium rings&rdquo;, &ldquo;niobium&rdquo;, &ldquo;earrings&rdquo;, or
              &ldquo;surgical steel&rdquo;.
            </p>
            <Link href="/shop" className="btn-ghost">
              Browse All Products
            </Link>
          </div>
        ) : results.length === 0 ? (
          /* No matches */
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 16px',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </p>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                fontWeight: 300,
                margin: '0 0 8px',
              }}
            >
              Try a different search term, or browse by category:
            </p>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: '28px',
              }}
            >
              {(['rings', 'necklaces', 'earrings', 'bracelets'] as const).map((cat) => (
                <Link
                  key={cat}
                  href={`/shop/${cat}`}
                  className="btn-ghost"
                  style={{ textTransform: 'capitalize' }}
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Results grid */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '2px',
            }}
          >
            {results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

// ── Page component with Suspense boundary ─────────────────────────────────

export default function SearchPage() {
  return (
    <>
      <Nav />
      <CartDrawer />

      <Suspense
        fallback={
          <main
            style={{
              backgroundColor: 'var(--bg)',
              minHeight: '100vh',
              paddingTop: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
              }}
            >
              Loading…
            </p>
          </main>
        }
      >
        <SearchResults />
      </Suspense>

      <Footer />
    </>
  )
}
