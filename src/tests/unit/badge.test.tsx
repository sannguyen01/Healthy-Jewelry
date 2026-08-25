import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/Badge'

describe('Badge', () => {
  it('renders "Bestseller" for variant="bestseller"', () => {
    render(<Badge variant="bestseller" />)
    expect(screen.getByText('Bestseller')).toBeInTheDocument()
  })

  it('renders "New" for variant="new"', () => {
    render(<Badge variant="new" />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders "Sale" for variant="sale"', () => {
    render(<Badge variant="sale" />)
    expect(screen.getByText('Sale')).toBeInTheDocument()
  })

  it('renders a span element', () => {
    const { container } = render(<Badge variant="bestseller" />)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })

  it('applies extra className when provided', () => {
    render(<Badge variant="new" className="custom-class" />)
    const badge = screen.getByText('New')
    expect(badge).toHaveClass('custom-class')
  })

  it('renders text in uppercase via inline style', () => {
    render(<Badge variant="sale" />)
    const badge = screen.getByText('Sale')
    expect(badge).toHaveStyle({ textTransform: 'uppercase' })
  })

  it('bestseller badge has titanium color style', () => {
    render(<Badge variant="bestseller" />)
    const badge = screen.getByText('Bestseller')
    // The text-safe titanium, not the raw accent — badge copy is 4.5:1 content,
    // and --titanium is 2.25:1 on --bg. See design-tokens-contrast.test.ts.
    expect(badge).toHaveStyle({ color: 'var(--titanium-text)' })
  })

  it('new badge has sage color style', () => {
    render(<Badge variant="new" />)
    const badge = screen.getByText('New')
    // The text-safe sage, not the raw accent — mirroring the bestseller case
    // above and for the same reason. This asserted `var(--sage)` until
    // 2026-08-25, faithfully pinning what shipped: 9px label copy at 2.16:1 over
    // its own tint, which is worse than the 2.25:1 titanium case that had
    // already motivated the split.
    expect(badge).toHaveStyle({ color: 'var(--sage-text)' })
  })
})
