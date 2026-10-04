import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Nav } from '@/components/layout/Nav'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

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

vi.mock('@/lib/hooks/useScrolled', () => ({
  useScrolled: vi.fn(() => false),
}))

// jsdom has no app router mounted, so `useRouter()` throws on render.
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

beforeEach(() => {
})

describe('Nav', () => {
  describe('structure', () => {
    it('renders a header element', () => {
      render(<Nav />)
      expect(document.querySelector('header')).toBeTruthy()
    })

    it('renders the brand wordmark', () => {
      render(<Nav />)
      expect(screen.getByText('HEALTHY JEWELLERY')).toBeTruthy()
    })

    it('renders the contact link in the header bar', () => {
      render(<Nav />)
      expect(screen.getByRole('link', { name: 'CONTACT' })).toBeTruthy()
    })

    it('home link has correct aria-label', () => {
      render(<Nav />)
      expect(screen.getByRole('link', { name: /healthy jewelry.*home/i })).toBeTruthy()
    })
  })

  describe('mobile menu', () => {
    it('renders menu toggle button', () => {
      render(<Nav />)
      expect(screen.getByRole('button', { name: /open menu/i })).toBeTruthy()
    })

    it('toggles mobile overlay open on click', () => {
      render(<Nav />)
      const menuBtn = screen.getByRole('button', { name: /open menu/i })
      fireEvent.click(menuBtn)
      expect(screen.getByRole('dialog', { name: /mobile navigation/i })).toBeTruthy()
    })

    it('menu button shows "Close" text when overlay is open', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      expect(screen.getByRole('button', { name: /close menu/i })).toBeTruthy()
    })

    it('closes overlay when close button is clicked again', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      fireEvent.click(screen.getByRole('button', { name: /close menu/i }))
      expect(screen.queryByRole('dialog', { name: /mobile navigation/i })).toBeNull()
    })

    it('overlay shows primary nav links', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      const dialog = screen.getByRole('dialog', { name: /mobile navigation/i })
      for (const label of ['Pieces', 'Our metals', 'Our story', 'Find us', 'Contact']) {
        expect(within(dialog).getByText(label)).toBeTruthy()
      }
    })

    it('hides the closed drawer from assistive technology and the tab order', () => {
      render(<Nav />)
      const drawer = document.querySelector('.hj-menu-drawer')
      expect(drawer?.getAttribute('aria-hidden')).toBe('true')
      expect(drawer?.hasAttribute('inert')).toBe(true)
    })

    it('Escape closes the open drawer and returns focus to the menu button', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: /mobile navigation/i })).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }))
    })

    it('Tab from the last drawer link wraps to the menu button instead of leaving the dialog', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      const dialog = screen.getByRole('dialog', { name: /mobile navigation/i })
      const controls = dialog.querySelectorAll<HTMLElement>('a[href], button')
      controls[controls.length - 1].focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      // Wraps to the first header control, which is the menu button, never out of the dialog.
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /close menu/i }))
    })

    it('choosing a drawer link hands focus to the menu button, not <body>', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      const dialog = screen.getByRole('dialog', { name: /mobile navigation/i })
      fireEvent.click(dialog.querySelectorAll('a')[0])
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }))
    })

    it('clicking overlay nav link closes the menu', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      const dialog = screen.getByRole('dialog', { name: /mobile navigation/i })
      const overlayLink = dialog.querySelectorAll('a')[0]
      fireEvent.click(overlayLink)
      expect(screen.queryByRole('dialog', { name: /mobile navigation/i })).toBeNull()
    })
  })

  describe('search button', () => {
    it('renders search button with aria-label', () => {
      render(<Nav />)
      expect(screen.getByRole('button', { name: /search/i })).toBeTruthy()
    })

    it('navigates to /search when clicked', () => {
      // This control shipped with no click handler at all: it rendered, it was
      // focusable, it was correctly labelled, and it did nothing. Rendering
      // assertions cannot tell the difference — this one can.
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /search/i }))
      expect(push).toHaveBeenCalledWith('/search')
    })
  })
})
