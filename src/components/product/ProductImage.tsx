import Image from 'next/image'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * A product's picture: its photograph when Shopify has one, its illustration when not.
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
 * ## Presence is not visibility
 *
 * `e2e/visual-assets.spec.ts` exists because this project once shipped collection tiles
 * that were present, requested successfully, and rendered at `opacity: 0.12`. Product
 * imagery is checked the same way there, and `verify-production.mjs` asserts the
 * converse against the live store: a product that *has* a photo in Shopify must show a
 * `cdn.shopify.com` URL on its page. That direction is the one that will actually happen
 * — an upload that never reaches the page is silent and looks exactly like "no photo
 * yet".
 */

interface ProductImageProps {
  product: HJProduct
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
  const photo = product.featuredImage

  if (!photo) {
    return (
      <JewelrySVG
        type={product.svgType}
        className={className ?? ''}
        style={{ width: svgScale, height: svgScale }}
      />
    )
  }

  return (
    <Image
      src={photo.url}
      // Never empty. An empty alt tells a screen reader the image is decorative,
      // which is a lie about the one thing on the page the customer is buying —
      // and Shopify's altText is unset far more often than it is set.
      alt={photo.altText?.trim() || product.title}
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
