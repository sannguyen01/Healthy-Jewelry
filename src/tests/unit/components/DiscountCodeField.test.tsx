import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DiscountCodeField } from '@/components/product/DiscountCodeField'
import { useCartStore } from '@/store/cart'

beforeEach(() => {
  useCartStore.setState({ discountCodes: [] })
})

function expand() {
  const trigger = screen.queryByRole('button', { name: /add a promotion code/i })
  if (trigger) fireEvent.click(trigger)
}

describe('DiscountCodeField', () => {
  it('starts collapsed behind a single control', () => {
    render(<DiscountCodeField />)
    expect(screen.getByRole('button', { name: /add a promotion code/i })).toBeTruthy()
    expect(screen.queryByLabelText(/promotion code/i)).toBeNull()
  })

  it('reveals the input when expanded', () => {
    render(<DiscountCodeField />)
    expand()
    expect(screen.getByLabelText(/promotion code/i)).toBeTruthy()
  })

  it('disables Apply until something is typed', () => {
    render(<DiscountCodeField />)
    expand()
    const apply = screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/promotion code/i), { target: { value: 'X' } })
    expect(apply.disabled).toBe(false)
  })

  it('applies a valid code and clears the field', async () => {
    const applyDiscountCode = vi.fn().mockResolvedValue(true)
    useCartStore.setState({ applyDiscountCode })

    render(<DiscountCodeField />)
    expand()
    const input = screen.getByLabelText(/promotion code/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'TITANIUM10' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(applyDiscountCode).toHaveBeenCalledWith('TITANIUM10'))
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('explains a rejected code rather than failing silently', async () => {
    useCartStore.setState({ applyDiscountCode: vi.fn().mockResolvedValue(false) })

    render(<DiscountCodeField />)
    expand()
    fireEvent.change(screen.getByLabelText(/promotion code/i), { target: { value: 'NOPE' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/not valid/i)
    })
    expect(screen.getByLabelText(/promotion code/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('clears the error state as soon as the customer edits the code', async () => {
    useCartStore.setState({ applyDiscountCode: vi.fn().mockResolvedValue(false) })
    render(<DiscountCodeField />)
    expand()
    const input = screen.getByLabelText(/promotion code/i)
    fireEvent.change(input, { target: { value: 'NOPE' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    fireEvent.change(input, { target: { value: 'NOPE2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lists an applied code with a way to remove it', () => {
    useCartStore.setState({ discountCodes: [{ code: 'TITANIUM10', applicable: true }] })
    render(<DiscountCodeField />)
    expect(screen.getByText(/TITANIUM10 applied/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove promotion code titanium10/i })).toBeTruthy()
  })

  // Shopify echoes back a code it recognises but cannot apply to this bag;
  // showing it as "applied" would misrepresent the total.
  it('does not list a code Shopify reported as not applicable', () => {
    useCartStore.setState({ discountCodes: [{ code: 'SUMMER', applicable: false }] })
    render(<DiscountCodeField />)
    expect(screen.queryByText(/SUMMER applied/i)).toBeNull()
  })

  it('removes an applied code through the store', () => {
    const removeDiscountCode = vi.fn()
    useCartStore.setState({
      discountCodes: [{ code: 'TITANIUM10', applicable: true }],
      removeDiscountCode,
    })
    render(<DiscountCodeField />)
    fireEvent.click(screen.getByRole('button', { name: /remove promotion code titanium10/i }))
    expect(removeDiscountCode).toHaveBeenCalledWith('TITANIUM10')
  })
})
