import Link from 'next/link'
import type { CatalogProduct } from '@/lib/catalog'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'

interface ProductCardProps {
  product: CatalogProduct
  className?: string
}

/**
 * A listing card is one link whose accessible name is what is written on it: the badge, the piece's
 * name and its metal.
 *
 * It was an `<article>` inside the `<a>`, and Chrome does not build a link's name through an
 * `article`: on `/shop`, the collection pages and `/search` all 29 piece links had **no accessible
 * name** (read from the accessibility tree, `CSS`-visible text and all). axe passed, because axe
 * reads the DOM's text and not the tree the browser hands a screen reader. A `<div>` is name-from-
 * content transparent. The hover specification is `aria-hidden`: it is a duplicate of what the piece
 * page prints and, first in the DOM, it made the name begin "2 mm 1.8 g". It is revealed by CSS for a
 * pointer *and* for keyboard focus (`.hj-card-link`), so a keyboard user is not shown less than a
 * mouse user; no script is involved, which is why this is no longer a client component.
 */
export function ProductCard({ product, className }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.handle}`}
      className="hj-card-link"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div
        className={'card-tile' + (className ? ` ${className}` : '')}
        style={{
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        {/* Photograph when Shopify has one, illustration when not — see ProductImage. */}
        <div
          style={{
            aspectRatio: 'var(--ratio-product)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--nacre)',
            position: 'relative',
          }}
        >
          <ProductImage
            product={product}
            svgScale="65%"
            // Grid is 1 / 2 / 3 columns at the ProductGrid breakpoints.
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />

          {/* Spec overlay — revealed on hover and on keyboard focus (`.hj-card-link` in globals.css). The
              same datum the detail page prints under the name, so the same voice (`.hj-spec`: label
              capitals, meta tracking) rather than a tracked mixed-case line of body text. Decorative
              to a screen reader, which has the piece page for it. */}
          <p
            data-spec
            aria-hidden="true"
            className="hj-spec"
            style={{
              position: 'absolute',
              bottom: '10px',
              left: 0,
              right: 0,
              textAlign: 'center',
              color: 'var(--graphite)',
              pointerEvents: 'none',
            }}
          >
            {product.specification}
          </p>
        </div>

        {/*
          Badge — absolute top-left.
          The Sold Out state is gone with the inventory signal that produced it: it read
          `every variant unavailable` from Shopify, and there is no inventory system left
          to read. Claiming a piece is sold out on a catalogue that cannot check would be
          an invented fact; `availability` carries the honest answer instead, and it is
          `ask-an-ambassador` for every product today.
        */}
        {product.badge !== null && (
          <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
            <ProductBadge badge={product.badge} />
          </div>
        )}

        {/* Info bar */}
        <div style={{ padding: '16px' }}>
          <p className="hj-card-name" style={{ marginBottom: '4px' }}>
            {product.title}
          </p>

          <span className="material-tag">{product.material.replace('-', ' ').toUpperCase()}</span>

          {/*
            The price row was here.

            A browse-only catalogue publishes no prices: there is nothing to pay and
            nothing to pay it with. `material` above and `specification` on hover are
            what a card can honestly say about a piece; what it costs is a
            conversation with an ambassador, which is what `availability` records.
          */}
        </div>
      </div>
    </Link>
  )
}

export default ProductCard
