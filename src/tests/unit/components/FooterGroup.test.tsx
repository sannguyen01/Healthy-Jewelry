import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FooterGroup } from '@/components/layout/FooterGroup'

describe('FooterGroup', () => {
  it('is a native disclosure that renders open, so no-JS visitors get every link', () => {
    const { container } = render(
      <FooterGroup title="Help" headStyle={{}}>
        <a href="/contact">Contact</a>
      </FooterGroup>
    )
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(true)
    expect(container.querySelector('summary')?.textContent).toContain('Help')
    expect(screen.getByRole('link', { name: 'Contact' })).toBeTruthy()
  })

  it('uses no checkbox to drive the disclosure', () => {
    const { container } = render(
      <FooterGroup title="Help" headStyle={{}}>
        <a href="/faq">FAQ</a>
      </FooterGroup>
    )
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  })
})
