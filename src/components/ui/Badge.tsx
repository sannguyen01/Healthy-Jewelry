import { cn } from '@/lib/utils/cn'

type BadgeVariant = 'bestseller' | 'new' | 'sale'

interface BadgeProps {
  variant: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  bestseller: {
    color: 'var(--titanium-text)',
    backgroundColor: 'rgba(157,167,175,0.12)',
    border: '1px solid rgba(157,167,175,0.3)',
  },
  new: {
    // --sage-text, not --sage: this is 9px label copy needing 4.5:1, and raw
    // --sage is 2.16:1 over its own tint here. The tint and border below stay
    // on the accent — same split as `bestseller` above.
    color: 'var(--sage-text)',
    backgroundColor: 'rgba(140,168,154,0.12)',
    border: '1px solid rgba(140,168,154,0.3)',
  },
  sale: {
    color: 'var(--ink)',
    backgroundColor: 'var(--ash)',
    border: '1px solid var(--ash)',
  },
}

const variantLabels: Record<BadgeVariant, string> = {
  bestseller: 'Bestseller',
  new: 'New',
  sale: 'Sale',
}

export function Badge({ variant, className }: BadgeProps) {
  return (
    <span
      className={cn('inline-block', className)}
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '9px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '3px 7px',
        ...variantStyles[variant],
      }}
    >
      {variantLabels[variant]}
    </span>
  )
}

export default Badge
