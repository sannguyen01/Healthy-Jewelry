import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { ProductCard } from '@/components/product/ProductCard'
import { headers } from 'next/headers'
import { searchProducts } from '@/lib/shopify'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'
import { TrackView } from '@/components/analytics/TrackView'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search titanium, niobium and surgical steel jewelry.',
}

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

/**
 * A server component now, because this page used to search
 * `getAllProducts()` — the *static* catalogue — from the browser.
 *
 * The static and Shopify catalogues are nearly disjoint, so site search
 * returned products that 404 on click and could not find a single one of the
 * 22 products actually for sale. `searchProducts()` had been sitting in
 * `src/lib/shopify/index.ts` fully implemented and called from nowhere.
 */
/**
 * The ceiling on search, and why it is on the page rather than on a route.
 *
 * `/api/search` used to exist as a public JSON endpoint doing exactly what this
 * component does, with no limiter, no query cap and no cache — and **no
 * callers**: this page has always called `searchProducts` directly. It was
 * deleted rather than hardened, because an untested, uncalled, unlimited
 * endpoint that spends the store's Shopify quota is surface area with negative
 * value. `e2e/COVERAGE.md` had it classified as "exercised through the /search
 * page", which was not true in either direction.
 *
 * Deleting it does not close the exposure, though — this page has the same
 * property. `/search` is dynamic by construction (it reads `searchParams`), so
 * every distinct query is a Shopify round-trip. Caching (60s, keyed on the
 * normalised query) turns that from one call per visitor into one call per
 * distinct query per minute; this limiter is what bounds the number of distinct
 * queries one caller can mint.
 *
 * `onError: 'allow'`. If Upstash cannot be consulted, a customer who cannot
 * search is a worse outcome than quota spent on one who can.
 */
const searchLimiter = createRateLimiter({
  limit: 30,
  window: '1 m',
  prefix: 'hj:search',
  onError: 'allow',
})

async function SearchResults({ query }: { query: string }) {
  // `searchProducts` treats an empty query as "match everything" and returns
  // the whole static catalogue, so the empty case is answered here instead —
  // preserving the "Start typing to search" state this page has always had.
  const isRealQuery = query.trim().length > 0

  // Only a real query is metered. The empty state costs nothing and refusing it
  // would turn a navigation into an error.
  const throttled = isRealQuery && (await searchLimiter.isLimited(clientIp(await headers())))

  const results = !isRealQuery || throttled ? [] : await searchProducts(query)

  return (
    <>
      {/*
        What people search for, and whether they find anything, is the most
        actionable question a small catalogue can ask of itself — a query with
        zero results is either a product to stock or a word to add to a
        description. Only reported for a real query; the empty state is not a
        search.
      */}
      {isRealQuery && !throttled && (
        <TrackView event={{ name: 'search_performed', query, resultCount: results.length }} />
      )}
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
              {throttled
                ? 'Too many searches just now'
                : results.length === 0
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
          ) : throttled ? (
            /*
             * Refused, not empty — and the distinction is the whole point.
             *
             * Falling through to "No results" here would tell a customer the
             * product does not exist when the truth is that we declined to look.
             * That is the exact defect `searchProducts` was already fixed for:
             * it used to return `[]` on a Shopify failure, which rendered as a
             * confident `No results for "titanium"`. Re-creating it one layer up,
             * in the same file, would be a poor trade for a rate limiter.
             */
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
                Too many searches just now
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
                We have not looked for &ldquo;{query}&rdquo; — this is a limit on how often
                searches run, not a statement about the catalogue. Try again in a moment, or
                browse the full collection.
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
                {(['rings', 'necklaces', 'earrings', 'bracelets', 'charms'] as const).map((cat) => (
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
    </>
  )
}

// ── Page component with Suspense boundary ─────────────────────────────────

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const query = q ?? ''

  return (
    <>
      <Nav />

      {/* Keyed on the query so navigating between searches re-suspends and
          shows the fallback, rather than holding the previous results on
          screen while the next fetch runs. */}
      <Suspense
        key={query}
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
        <SearchResults query={query} />
      </Suspense>

      <Footer />
    </>
  )
}
