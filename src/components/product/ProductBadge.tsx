import type { HJBadge } from '@/lib/shopify/types'

interface ProductBadgeProps {
  badge: HJBadge
  className?: string
}

export function ProductBadge({ badge, className }: ProductBadgeProps) {
  if (badge === null) return null

  const badgeClass =
    badge === 'Bestseller'
      ? 'badge badge-bestseller'
      : badge === 'New'
        ? 'badge badge-new'
        : 'badge badge-sale'

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
      {badge}
    </span>
  )
}

export default ProductBadge
