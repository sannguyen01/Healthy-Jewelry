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
    expect(badge).toHaveStyle({ color: 'var(--titanium-text)' })
  })

  it('new badge has sage color style', () => {
    render(<Badge variant="new" />)
    const badge = screen.getByText('New')
    expect(badge).toHaveStyle({ color: 'var(--sage)' })
  })
})
