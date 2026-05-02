import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'

type ButtonVariant = 'primary' | 'ghost' | 'text'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--ink)] text-[var(--bg)]',
    'border border-[var(--ink)]',
    'hover:bg-[var(--mid)] hover:border-[var(--mid)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--ink)]',
    'border border-[var(--ink)]',
    'hover:bg-[var(--ink)] hover:text-[var(--bg)]',
  ].join(' '),
  text: [
    'bg-transparent text-[var(--ink)]',
    'border border-transparent',
    'hover:text-[var(--graphite)]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[0.7rem]',
  md: 'px-6 py-3 text-[0.78rem]',
  lg: 'px-8 py-4 text-[0.88rem]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base — all variants share this
          'inline-flex items-center justify-center',
          'font-[var(--font-display)] uppercase tracking-[0.14em]',
          'transition-all duration-200 cursor-pointer',
          'whitespace-nowrap select-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
