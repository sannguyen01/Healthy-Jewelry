'use client'

import { forwardRef } from 'react'
import Link from 'next/link'

interface GhostButtonProps {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  variant?: 'dark' | 'light'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  'aria-label'?: string
}

const GhostButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, GhostButtonProps>(
  (
    { children, href, onClick, variant = 'dark', className = '', type = 'button', disabled, ...rest },
    ref
  ) => {
    const cls = `btn-ghost${variant === 'light' ? ' btn-ghost-dark' : ''} ${className}`.trim()

    if (href) {
      return (
        <Link href={href} className={cls} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
          {children}
        </Link>
      )
    }

    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={cls}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...rest}
      >
        {children}
      </button>
    )
  }
)

GhostButton.displayName = 'GhostButton'

export { GhostButton }
export default GhostButton
