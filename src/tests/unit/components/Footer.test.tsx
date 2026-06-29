import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Footer', () => {
  describe('structure', () => {
    it('renders a footer element', () => {
      render(<Footer />)
      expect(screen.getByRole('contentinfo')).toBeTruthy()
    })

    it('renders brand name as a link', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: /healthy jewelry — home/i })).toBeTruthy()
    })

    it('renders brand tagline copy', () => {
      render(<Footer />)
      expect(
        screen.getByText(/metal that works with your body/i, { selector: 'p' }),
      ).toBeTruthy()
    })
  })

  describe('shop column', () => {
    it('shows "Shop" column heading', () => {
      render(<Footer />)
      expect(screen.getByText('Shop')).toBeTruthy()
    })

    it('links to all 4 collection pages', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Rings' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Necklaces' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Earrings' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Bracelets' })).toBeTruthy()
    })

    it('ring link points to /shop/rings', () => {
      render(<Footer />)
      const link = screen.getByRole('link', { name: 'Rings' })
      expect(link.getAttribute('href')).toBe('/shop/rings')
    })
  })

  describe('info column', () => {
    it('shows "Info" column heading', () => {
      render(<Footer />)
      expect(screen.getByText('Info')).toBeTruthy()
    })

    it('links to About, Materials, Contact', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Our Story' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Materials' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Contact' })).toBeTruthy()
    })
  })

  describe('legal column', () => {
    it('shows "Legal" column heading', () => {
      render(<Footer />)
      expect(screen.getByText('Legal')).toBeTruthy()
    })

    it('links to Privacy Policy', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy()
    })

    it('links to Terms of Service', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeTruthy()
    })

    it('links to Shipping & Returns', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Shipping & Returns' })).toBeTruthy()
    })
  })

  describe('bottom bar', () => {
    it('shows copyright year', () => {
      render(<Footer />)
      expect(screen.getByText(/© 2026 Healthy Jewelry/i)).toBeTruthy()
    })

    it('shows tagline in bottom bar', () => {
      render(<Footer />)
      const taglines = screen.getAllByText(/metal that works with your body/i)
      expect(taglines.length).toBeGreaterThanOrEqual(2)
    })
  })
})
