import Image from 'next/image'
import { productMaterialNotes, type CatalogProduct } from '@/lib/catalog'
import { ProductImage } from '@/components/product/ProductImage'
import { ProductBadge } from '@/components/product/ProductBadge'
import {
  ProductSizeSelection,
  ProductViewTracker,
} from '@/components/product/ProductDetailInteractive'

interface ProductDetailProps {
  product: CatalogProduct
}

/**
 * A server component. It was `'use client'` until 2026-09-26, for two hooks — the view
 * event and the size selection — which now live in `ProductDetailInteractive.tsx`. The
 * reason for the move is the notes row below: it renders claims, claims resolve against a
 * Zod-validated registry, and resolving them in the browser would ship both to every visitor.
 */
export function ProductDetail({ product }: ProductDetailProps) {
  // `activeImageIndex` was here, driving the thumbnail gallery. The media union holds at
  // most one photograph, so there was never a second thumbnail to switch to — see the note
  // where the gallery used to render. State nothing can change is state that misleads a
  // reader about what the component does.

  /**
   * The notes under the piece: its exact designation, a standard only where documentation
   * covers this piece, and any claim approved for it.
   *
   * This row was `TRUST_SIGNALS = ['·IMPLANT GRADE·', '·HYPOALLERGENIC·', '·MRI SAFE·']`,
   * rendered identically on all seventeen product pages until 2026-09-26 — a regulatory, an
   * allergen and a medical-imaging claim, with no evidence behind any, on niobium and 316L
   * pieces as well as titanium ones. The retired `/faq` itself called 316L only
   * "MRI-conditional". The three are pending in the claims registry and render here the
   * moment one is approved for this piece; until then the designation is the whole row,
   * because it is the one thing on it that needs no document.
   */
  const notes = productMaterialNotes(product)

  /**
   * The photograph, when the catalogue record carries one.
   *
   * The media union holds **at most one** image per product, which is a deliberate
   * narrowing: Shopify returned a `featuredImage` and an `images` array that could
   * disagree, and reconciling them here was how a product whose only photo lived in
   * `featuredImage` could silently render as a line drawing. One field cannot disagree
   * with itself. A gallery returns when there is real photography to put in it, and the
   * schema is where that decision belongs.
   */
  const activeImage = product.media.kind === 'photo' ? product.media : null

  // `isSoldOut` was the last variant-derived value here, and it is gone with the inventory
  // signal that produced it: `every variant unavailable`, read from Shopify per variant.
  // Nothing can check stock any more, so a Sold Out badge would be an invented fact rather
  // than a stale one. `availability` on the record carries what the site can honestly say.
  //
  // Everything else that used to live here — `requiresSize`, `selectedVariant`,
  // `relevantVariant`, `variantSoldOut`, `canAddToBag` — went with the Add to Bag button in
  // PR #75. The size picker stays and stays interactive: it tells a visitor what sizes exist
  // and which one they picked, without mapping that choice onto anything purchasable.

  /**
   * The material as the brand publishes it, read from the record rather than derived.
   *
   * This was a `MATERIAL_FULL_NAMES` lookup keyed on `product.material` — three rows
   * mapping `titanium` to "Grade 23 Titanium" and so on. `schema.ts` argues against
   * exactly that: the handle is an identifier this repository owns, the label is
   * published copy making a claim about metallurgy, and deriving the second from the
   * first put the only statement of that claim in a constant inside a component.
   *
   * The catalogue stores `materialLabel` on every record, and the seventeen values agree
   * with the table this replaced, so nothing on the page changes today. What changes is
   * where a correction would have to be made: a content file, not a component.
   */
  const materialName = product.materialLabel

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 'var(--space-gutter)',
      }}
    >
      {/* Columns and gap live in globals.css. They were inline here with a
          `<style>` tag overriding them at 768px — the `!important` existed only
          because an inline value cannot otherwise lose to a media query. */}
      <ProductViewTracker product={product} />
      <div className="hj-detail-grid">
        {/* Left — photograph, gallery, or illustration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card-tile hj-product-tile">
            {activeImage ? (
              <Image
                src={activeImage.src}
                alt={activeImage.alt}
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1120px) 50vw, 560px"
                // The largest above-the-fold image on the page it belongs to,
                // and the reason someone opened it.
                priority
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <ProductImage
                product={product}
                svgScale="70%"
                sizes="(max-width: 767px) 100vw, (max-width: 1120px) 50vw, 560px"
                priority
              />
            )}
          </div>

          {/*
            The thumbnail gallery was here.

            The media union holds at most one photograph, so there is never a second
            thumbnail to switch to — a gallery of one is a row of one button that
            changes nothing, which `e2e/visual-assets.spec.ts` already asserts must not
            render. It comes back with the schema change that allows more than one image,
            not before.
          */}
        </div>

        {/* Right — Info panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            justifyContent: 'center',
          }}
        >
          {/* Badge. Sold Out is gone with the inventory signal — see the note above. */}
          {product.badge !== null && (
            <div>
              <ProductBadge badge={product.badge} />
            </div>
          )}

          {/* Title */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display)',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              lineHeight: 1.05,
            }}
          >
            {product.title}
          </h1>

          {/* Material line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-tag">{materialName}</span>
          </div>

          {/* Spec — Shopify products carry this in the `custom.spec` metafield,
              which is optional. An empty one used to render a blank uppercase
              line with its own margins, so the layout showed a gap where a
              measurement should be. */}
          {product.specification.trim() !== '' && (
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                color: 'var(--graphite)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {product.specification}
            </p>
          )}

          {/* Description */}
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 'var(--text-base)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              marginTop: '16px',
            }}
          >
            {product.description}
          </p>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: 'var(--ash)',
            }}
            role="separator"
          />

          {/*
            The price block was here.

            Nothing on this page can be bought, so a number with a currency symbol on it
            is a claim the site cannot honour. `availability` is the honest field and it
            reads `ask-an-ambassador` for every piece in the catalogue today.
          */}

          {/* Size picker — only for rings and bracelets */}
          <ProductSizeSelection collection={product.collection} />

          {/* Material notes — see `notes` above. `data-testid` because the E2E suite uses
              this row as the foot of the detail column, and its text now depends on what
              has been approved. */}
          <ul
            data-testid="material-notes"
            aria-label="Material notes"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: '8px',
              listStyle: 'none',
              margin: 0,
              paddingLeft: 0,
            }}
          >
            {/* A designation is case-sensitive — Ti-6Al-4V is not TI-6AL-4V — so it is the
                one note not set in capitals. */}
            <li style={{ ...NOTE_STYLE, textTransform: 'none' }}>{notes.designation}</li>
            {notes.standard !== null && <li style={NOTE_STYLE}>{notes.standard}</li>}
            {notes.claims.map((claim) => (
              <li key={claim} style={NOTE_STYLE}>
                ·{claim}·
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const NOTE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: 'var(--titanium-text)',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

export default ProductDetail
