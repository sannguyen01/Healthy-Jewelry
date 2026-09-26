'use client'

import { useEffect, useRef, useState } from 'react'
import type { CatalogProduct } from '@/lib/catalog'
import { SizePicker } from '@/components/product/SizePicker'
import { track } from '@/lib/analytics'

/**
 * The two interactive parts of the product page, split out so `ProductDetail` can be a
 * server component.
 *
 * `ProductDetail` was `'use client'` in full because of these two hooks. That was harmless
 * until it had to render claims: the claims registry is Zod-validated, and resolving a claim
 * inside a client component ships Zod and the whole registry to the browser for the sake of
 * a row of notes. So the page renders on the server, where the registry already is, and only
 * what genuinely needs the browser — a view event and a size selection — lives here.
 *
 * Behaviour is unchanged: the same `product_viewed` event once per mount, the same picker.
 */

/** Reports one `product_viewed` per mount. Renders nothing. */
export function ProductViewTracker({ product }: { product: CatalogProduct }) {
  // The ref guards React's development double-invoke, which would otherwise double every
  // page-view number and teach everyone to halve it.
  const viewReported = useRef(false)
  useEffect(() => {
    if (viewReported.current) return
    viewReported.current = true
    track({
      name: 'product_viewed',
      handle: product.handle,
      collection: product.collection,
      material: product.material,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.handle])
  return null
}

/**
 * The size picker and the one piece of state it needs.
 *
 * It tells a visitor what sizes exist and which one they picked, without mapping that choice
 * onto anything purchasable — Add to Bag and everything variant-derived went in PR #75.
 */
export function ProductSizeSelection({ collection }: { collection: CatalogProduct['collection'] }) {
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined)
  return <SizePicker collection={collection} onSelect={setSelectedSize} selected={selectedSize} />
}

export default ProductSizeSelection
