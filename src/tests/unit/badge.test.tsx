import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductBadge } from '@/components/product/ProductBadge'

/**
 * There is one badge: `ProductBadge`, drawn by `.badge` in globals.css, on the home strip, the listing
 * cards and the piece page. A second one (`ui/Badge`, a tinted fill with its own padding) lived on the
 * strip until 2026-10-09 and was deleted with its `sale` variant, which no record can carry.
 */
describe('ProductBadge', () => {
  it('renders "Bestseller" for the bestseller handle', () => {
    render(<ProductBadge badge="bestseller" />)
    expect(screen.getByText('Bestseller')).toBeInTheDocument()
  })

  it('renders "New" for the new handle', () => {
    render(<ProductBadge badge="new" />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders nothing for a piece with no badge', () => {
    const { container } = render(<ProductBadge badge={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('is a span carrying the shared .badge class and its variant', () => {
    const { container } = render(<ProductBadge badge="bestseller" />)
    const el = container.firstChild as HTMLElement
    expect(el.nodeName).toBe('SPAN')
    expect(el).toHaveClass('badge', 'badge-bestseller')
  })

  it('applies an extra className when provided', () => {
    render(<ProductBadge badge="new" className="custom-class" />)
    expect(screen.getByText('New')).toHaveClass('badge', 'badge-new', 'custom-class')
  })

  it('is set in capitals in the label voice, through inline style', () => {
    render(<ProductBadge badge="new" />)
    expect(screen.getByText('New')).toHaveStyle({ textTransform: 'uppercase', fontFamily: 'var(--font-ui)' })
  })
})
