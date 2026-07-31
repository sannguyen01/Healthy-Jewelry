import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CartNotices } from '@/components/product/CartNotices'
import { useCartStore } from '@/store/cart'

beforeEach(() => {
  useCartStore.setState({ error: null, adjustments: [] })
})

describe('CartNotices', () => {
  it('renders nothing when the cart is healthy', () => {
    const { container } = render(<CartNotices />)
    expect(container.firstChild).toBeNull()
  })

  // Every cart failure used to be a console.warn, so from the customer's side
  // the checkout button simply did nothing.
  it('renders the cart error as an alert', () => {
    useCartStore.setState({ error: { code: 'network', message: 'We could not reach checkout.' } })
    render(<CartNotices />)
    expect(screen.getByRole('alert').textContent).toContain('We could not reach checkout.')
  })

  it('dismisses the error when the close control is used', () => {
    useCartStore.setState({ error: { code: 'network', message: 'offline' } })
    render(<CartNotices />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss error/i }))
    expect(useCartStore.getState().error).toBeNull()
  })

  it('shows a generic message when a checkout attempt failed with no stored error', () => {
    render(<CartNotices showCheckoutFailure />)
    expect(screen.getByRole('alert').textContent).toBeTruthy()
  })

  it('lists the adjustments Shopify made to the bag', () => {
    useCartStore.setState({
      adjustments: [
        'Arc Band is limited to 2 — your bag was updated.',
        'Dome Ring sold out and was removed from your bag.',
      ],
    })
    render(<CartNotices />)
    const status = screen.getByTestId('cart-adjustments')
    expect(status.textContent).toContain('limited to 2')
    expect(status.textContent).toContain('sold out')
  })

  it('dismisses adjustments independently of the error', () => {
    useCartStore.setState({
      error: { code: 'network', message: 'offline' },
      adjustments: ['note'],
    })
    render(<CartNotices />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss bag updates/i }))
    expect(useCartStore.getState().adjustments).toEqual([])
    expect(useCartStore.getState().error).not.toBeNull()
  })

  it('uses role=status for adjustments so they do not interrupt', () => {
    useCartStore.setState({ adjustments: ['note'] })
    render(<CartNotices />)
    expect(screen.getByTestId('cart-adjustments').getAttribute('role')).toBe('status')
  })
})
