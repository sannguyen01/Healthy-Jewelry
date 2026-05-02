import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GhostButton } from './GhostButton'

describe('GhostButton', () => {
  it('renders as a button by default', () => {
    render(<GhostButton>Click me</GhostButton>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('renders as a link when href is provided', () => {
    render(<GhostButton href="/stones">View Stones</GhostButton>)
    expect(screen.getByRole('link', { name: 'View Stones' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<GhostButton onClick={handleClick}>Click me</GhostButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('applies dark variant class by default', () => {
    render(<GhostButton>Button</GhostButton>)
    expect(screen.getByRole('button')).toHaveClass('btn-ghost')
  })

  it('applies light variant class when variant="light"', () => {
    render(<GhostButton variant="light">Button</GhostButton>)
    expect(screen.getByRole('button')).toHaveClass('btn-ghost-dark')
  })

  it('is disabled when disabled prop is set', () => {
    render(<GhostButton disabled>Button</GhostButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('renders with submit type', () => {
    render(<GhostButton type="submit">Submit</GhostButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
