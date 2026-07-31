import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuantityStepper } from '@/components/product/QuantityStepper'

describe('QuantityStepper', () => {
  it('renders the current value', () => {
    render(<QuantityStepper value={3} onChange={vi.fn()} />)
    expect(screen.getByTestId('qty-display').textContent).toBe('3')
  })

  it('increments and decrements by one', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={3} onChange={onChange} label="Arc Band" />)
    fireEvent.click(screen.getByRole('button', { name: /increase quantity of arc band/i }))
    expect(onChange).toHaveBeenCalledWith(4)
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity of arc band/i }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('disables decrement at the minimum', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} min={1} onChange={onChange} />)
    const minus = screen.getByRole('button', { name: /decrease/i }) as HTMLButtonElement
    expect(minus.disabled).toBe(true)
    fireEvent.click(minus)
    expect(onChange).not.toHaveBeenCalled()
  })

  // Only one of the three hand-rolled steppers this replaced enforced a
  // maximum, so a held "+" could push an absurd quantity at the Shopify API.
  it('disables increment at the maximum and explains why', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={20} max={20} onChange={onChange} label="Arc Band" />)
    const plus = screen.getByRole('button', { name: /maximum quantity of 20/i })
    expect((plus as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(plus)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables both controls when disabled', () => {
    render(<QuantityStepper value={5} onChange={vi.fn()} disabled />)
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  // The stepper buttons keep focus across a change, so without a live region a
  // screen-reader user gets no confirmation the quantity moved.
  it('announces the quantity politely', () => {
    render(<QuantityStepper value={2} onChange={vi.fn()} label="Arc Band" />)
    const display = screen.getByTestId('qty-display')
    expect(display.getAttribute('aria-live')).toBe('polite')
    expect(display.getAttribute('aria-label')).toBe('Quantity of Arc Band: 2')
  })

  it('renders a compact variant without changing behaviour', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} onChange={onChange} size="sm" />)
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
