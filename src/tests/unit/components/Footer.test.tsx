import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import { claimText } from '@/lib/catalog'

/**
 * The tagline is the positioning line, and the positioning line is a pending claim — "Metal
 * that works with your body" implies biocompatibility. These assertions used to pin that
 * wording; they now pin whatever the registry resolves, so approving the claim changes the
 * footer without editing this file, and assert separately that the pending wording does
 * not render today.
 */
const TAGLINE = claimText('brand-positioning', { kind: 'site' })

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
      expect(screen.getByText(new RegExp(`^${TAGLINE}`), { selector: 'p' })).toBeTruthy()
    })

    it('does not render the positioning claim while it is pending', () => {
      render(<Footer />)
      expect(screen.queryAllByText(/works with your body/i)).toHaveLength(0)
    })
  })

  describe('shop column', () => {
    it('shows "Shop" column heading', () => {
      render(<Footer />)
      expect(screen.getByText('Shop')).toBeTruthy()
    })

    it('links to all 5 collection pages', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Rings' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Necklaces' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Earrings' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Bracelets' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Charms' })).toBeTruthy()
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
      const taglines = screen.getAllByText(new RegExp(TAGLINE))
      expect(taglines.length).toBeGreaterThanOrEqual(2)
    })
  })
})
