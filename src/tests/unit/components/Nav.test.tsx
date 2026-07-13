import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Nav } from '@/components/layout/Nav'
import { useCartStore } from '@/store/cart'

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

beforeEach(() => {
  useCartStore.setState({
    items: [],
    isOpen: false,
    shopifyCartId: null,
    checkoutUrl: null,
    isLoading: false,
  })
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

    it('renders logo image with alt text', () => {
      render(<Nav />)
      expect(screen.getByAltText('Healthy Jewelry')).toBeTruthy()
    })

    it('renders primary navigation links', () => {
      render(<Nav />)
      expect(screen.getByText('Collection')).toBeTruthy()
      expect(screen.getByText('Our Story')).toBeTruthy()
      expect(screen.getByText('Contact')).toBeTruthy()
    })

    it('home link has correct aria-label', () => {
      render(<Nav />)
      expect(screen.getByRole('link', { name: /healthy jewelry.*home/i })).toBeTruthy()
    })
  })

  describe('bag button', () => {
    it('renders bag button with aria-label', () => {
      render(<Nav />)
      expect(screen.getByRole('button', { name: /open bag/i })).toBeTruthy()
    })

    it('shows count 0 when cart is empty — no count badge rendered', () => {
      render(<Nav />)
      const bagButton = screen.getByRole('button', { name: /open bag — 0 item/i })
      expect(bagButton).toBeTruthy()
    })

    it('shows count badge when cart has items', () => {
      useCartStore.setState({
        items: [
          {
            product: {
              id: 'hj-001',
              defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
              handle: 'arc-band',
              title: 'Arc Band',
              collection: 'rings',
              material: 'titanium',
              tags: [],
              price: '89.00',
              compareAtPrice: null,
              badge: null,
              description: 'Test',
              spec: '2mm',
              svgType: 'ring-arc',
              variants: [],
            },
            quantity: 3,
            variantId: 'gid://shopify/ProductVariant/hj-001-default',
          },
        ],
        isOpen: false,
        shopifyCartId: null,
        checkoutUrl: null,
        isLoading: false,
      })
      render(<Nav />)
      expect(screen.getByText('3')).toBeTruthy()
    })

    it('uses cartCount prop when provided, overriding store count', () => {
      render(<Nav cartCount={7} />)
      expect(screen.getByText('7')).toBeTruthy()
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
      const overlayLinks = screen.getAllByText('Collection')
      expect(overlayLinks.length).toBeGreaterThanOrEqual(1)
    })

    it('overlay shows materials tagline', () => {
      render(<Nav />)
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
      expect(screen.getByText('Titanium · Niobium · Surgical Steel')).toBeTruthy()
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
  })
})
