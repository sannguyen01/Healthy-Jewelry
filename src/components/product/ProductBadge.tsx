import type { Badge } from '@/lib/catalog/schema'

interface ProductBadgeProps {
  badge: Badge | null
  className?: string
}

/** Display text for each badge. The stored value is a handle; this is the label. */
const LABEL: Record<Badge, string> = {
  bestseller: 'Bestseller',
  new: 'New',
}

/**
 * `sale` is absent from the vocabulary, not merely unhandled here.
 *
 * It was derived — "if neither tag is present but the product has an active compare-at
 * price" — and a browse-only catalogue publishes no prices, so there is nothing for a
 * product to be cheaper *than*. One piece carried it (`split-ring-titanium`) and is now
 * unbadged rather than being given a badge it never earned. See
 * [ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md).
 *
 * `.badge-sale` stays in `globals.css` for now; removing a class is a separate change from
 * removing the reason to apply it, and conflating the two is how a stylesheet ends up
 * describing a system that no longer exists.
 */
export function ProductBadge({ badge, className }: ProductBadgeProps) {
  if (badge === null) return null

  const badgeClass = badge === 'bestseller' ? 'badge badge-bestseller' : 'badge badge-new'

  return (
    <span
      className={badgeClass + (className ? ` ${className}` : '')}
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '9px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
      }}
    >
      {LABEL[badge]}
    </span>
  )
}

export default ProductBadge
