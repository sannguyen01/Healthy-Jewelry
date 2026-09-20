import Image from 'next/image'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import type { CatalogProduct } from '@/lib/catalog'
import type { HJSvgType } from '@/lib/svg/types'

/**
 * A product's picture, driven by the catalogue's three-state media union.
 *
 * ## Why this is one component and not a conditional in five places
 *
 * Five surfaces show a product image — the card, the detail page, the homepage strips,
 * the cart drawer, and the cart page — and until now every one of them hardcoded
 * `<JewelrySVG>`. Not as a fallback: as the only option. `PRODUCT_FRAGMENT` requested
 * no image field at all, and `HJProduct` had nowhere to put one, so **a fully
 * photographed store would still have rendered zero photographs.**
 *
 * The half-built plumbing around that gap is the tell: `next.config.ts` already
 * allowlists `cdn.shopify.com`, and `CART_FRAGMENT` already fetches `images(first: 3)`
 * — so the bag was capable of showing a photo the product page structurally could not.
 *
 * One decision point means uploading a photo in Shopify Admin is the whole task. No code
 * change, no redeploy, and no possibility of four surfaces switching over while the
 * fifth quietly keeps drawing a ring outline.
 *
 * ## Three states, because two could not tell them apart
 *
 * `featuredImage: null` used to mean both *this piece is drawn, deliberately* and
 * *nobody has decided what this looks like*. The catalogue schema splits them
 * ([ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md)) and this switch is
 * exhaustive over the union, so a fourth state cannot be added without every surface
 * being told what to draw for it.
 *
 * `illustration-pending` renders nothing rather than guessing an illustration. A wrong
 * drawing on a real product is a worse failure than an empty frame: it is a claim about
 * the object, made by a default.
 *
 * ## Presence is not visibility
 *
 * `e2e/visual-assets.spec.ts` exists because this project once shipped collection tiles
 * that were present, requested successfully, and rendered at `opacity: 0.12`. Product
 * imagery is checked the same way there.
 */

interface ProductImageProps {
  product: CatalogProduct
  /**
   * How much of the tile the illustration fills. Photographs always fill the frame;
   * the illustrations are line art and need air around them, and each surface had
   * already tuned its own value (65% on cards, 70% on the detail page).
   */
  svgScale?: string
  /**
   * `sizes` for the photograph. Getting this wrong means Next serves a 1200px image
   * into a 280px card, so it is required of every caller rather than defaulted to
   * something plausible.
   */
  sizes: string
  /** True for the largest above-the-fold image on the page. */
  priority?: boolean
  className?: string
}

export function ProductImage({
  product,
  svgScale = '65%',
  sizes,
  priority = false,
  className,
}: ProductImageProps) {
  const { media } = product

  if (media.kind === 'illustration') {
    return (
      <JewelrySVG
        type={media.svgType as HJSvgType}
        className={className ?? ''}
        style={{ width: svgScale, height: svgScale }}
      />
    )
  }

  if (media.kind === 'illustration-pending') {
    // Nothing, deliberately. See the note above: a default illustration on a real piece
    // is a claim about the object made by a fallback. The empty frame keeps the tile's
    // geometry (`aspect-ratio: 1 / 1`, per CLAUDE.md) so the grid does not reflow.
    return <div className={className} aria-hidden="true" />
  }

  return (
    <Image
      src={media.src}
      // The schema refuses an empty alt, so this cannot be the empty string. An empty
      // alt tells a screen reader the image is decorative — a lie about the one thing
      // on the page the customer came to look at.
      alt={media.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      // Jewellery photography is shot to frame the piece; cropping to fill would
      // cut the ends off a necklace. `contain` keeps the whole object, matching
      // how the illustrations sit in the same box.
      style={{ objectFit: 'contain' }}
    />
  )
}

export default ProductImage
