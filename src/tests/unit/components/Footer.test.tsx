import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import { claimText } from '@/lib/catalog'
import { SOCIAL_LINKS } from '@/config/site'

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

  describe('about group', () => {
    it('shows "About" group heading', () => {
      render(<Footer />)
      expect(screen.getByText('About')).toBeTruthy()
    })

    it('links to Contact and FAQ', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe('/contact')
      expect(screen.getByRole('link', { name: 'FAQ' }).getAttribute('href')).toBe('/faq')
    })
  })

  describe('find us group', () => {
    it('links to the brand social accounts from site config', () => {
      render(<Footer />)
      expect(screen.getByRole('link', { name: 'Instagram' }).getAttribute('href')).toBe(
        SOCIAL_LINKS.instagram
      )
      expect(screen.getByRole('link', { name: 'TikTok' }).getAttribute('href')).toBe(
        SOCIAL_LINKS.tiktok
      )
    })

    it('opens social links in a new tab with noopener', () => {
      render(<Footer />)
      const link = screen.getByRole('link', { name: 'Instagram' })
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  describe('link integrity', () => {
    it('renders no placeholder or unrouted destinations', () => {
      const { container } = render(<Footer />)
      const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
      expect(hrefs).not.toContain('#')
      expect(hrefs).not.toContain('/care')
      expect(hrefs).not.toContain('/events')
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
