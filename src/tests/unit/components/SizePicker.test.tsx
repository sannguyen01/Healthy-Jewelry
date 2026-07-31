import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SizePicker } from '@/components/product/SizePicker'
import { makeSizedVariants } from '@/test/factories'
import type { ProductOption } from '@/lib/shopify/types'

function renderPicker(
  values: string[],
  opts: { unavailable?: string[]; selected?: string; onSelect?: (s: string) => void } = {}
) {
  const { option, variants } = makeSizedVariants(values, { unavailable: opts.unavailable })
  const onSelect = opts.onSelect ?? vi.fn()
  render(
    <SizePicker
      options={[option]}
      variants={variants}
      onSelect={onSelect}
      selected={opts.selected}
    />
  )
  return { onSelect }
}

describe('SizePicker — rendering', () => {
  it('renders one swatch per available option value', () => {
    renderPicker(['7', '8', '9'])
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('labels the group with Shopify\'s own option name', () => {
    renderPicker(['7', '8'])
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeTruthy()
  })

  it('shortens a measurement value on the swatch face but keeps it in the label', () => {
    renderPicker(['S (165mm)', 'M (175mm)'])
    const swatch = screen.getByRole('radio', { name: 'Size M (175mm)' })
    expect(swatch.textContent).toBe('M')
  })

  it('renders nothing when the product has no size option', () => {
    const { container } = render(
      <SizePicker options={[]} variants={[]} onSelect={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the selected value alongside the label', () => {
    renderPicker(['7', '8'], { selected: '8' })
    expect(screen.getByRole('radio', { name: 'Size 8' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('SizePicker — availability', () => {
  it('disables a sold-out size', () => {
    renderPicker(['7', '8'], { unavailable: ['8'] })
    const soldOut = screen.getByRole('radio', { name: /Size 8 — sold out/ })
    expect((soldOut as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not fire onSelect for a sold-out size', () => {
    const { onSelect } = renderPicker(['7', '8'], { unavailable: ['8'] })
    fireEvent.click(screen.getByRole('radio', { name: /Size 8 — sold out/ }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('fires onSelect with the full option value for an available size', () => {
    const { onSelect } = renderPicker(['S (165mm)', 'M (175mm)'])
    fireEvent.click(screen.getByRole('radio', { name: 'Size M (175mm)' }))
    // The full value is what resolves to a Shopify variant; the short label
    // ("M") would not match.
    expect(onSelect).toHaveBeenCalledWith('M (175mm)')
  })

  it('tells the customer when every size is sold out', () => {
    renderPicker(['7', '8'], { unavailable: ['7', '8'] })
    expect(screen.getByRole('status').textContent).toMatch(/sold out/i)
  })

  // The hardcoded picker offered sizes 5-12 whether or not the catalog had
  // them; a value with no variant left the buy button dead with no reason given.
  it('hides an option value that has no matching variant', () => {
    const { variants } = makeSizedVariants(['7'])
    const option: ProductOption = { id: 'o', name: 'Size', values: ['7', '12'] }
    render(<SizePicker options={[option]} variants={variants} onSelect={vi.fn()} />)
    expect(screen.queryByRole('radio', { name: /Size 12/ })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })

  it('renders nothing when no value has a variant behind it', () => {
    const option: ProductOption = { id: 'o', name: 'Size', values: ['7', '12'] }
    const { container } = render(
      <SizePicker options={[option]} variants={[]} onSelect={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})
