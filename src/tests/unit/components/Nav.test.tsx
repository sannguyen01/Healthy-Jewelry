import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { Nav } from '@/components/layout/Nav'
import { SITE_NAME } from '@/config/site'

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
      expect(screen.getByText(SITE_NAME)).toBeTruthy()
    })

    it('renders the contact link in the header bar', () => {
      render(<Nav />)
      expect(screen.getByRole('link', { name: 'CONTACT' })).toBeTruthy()
    })

    it('home link has correct aria-label', () => {
      render(<Nav />)
      expect(screen.getByRole('link', { name: `${SITE_NAME} — home` })).toBeTruthy()
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

/**
 * The header's state and tone (ADR 054). The state follows the hero's own end marker; the tone is the record's;
 * and while the menu is open the page behind it is inert, so the dialog is a modal to a screen reader and not
 * only to a Tab key.
 */
describe('Nav — state, tone and the modal', () => {
  type Entry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect' | 'rootBounds'>
  let callback: ((entries: Entry[]) => void) | undefined

  beforeEach(() => {
    callback = undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Entry[]) => void) {
          callback = cb
        }
        observe() {}
        disconnect() {}
      }
    )
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const bar = () => document.querySelector('header.hj-header') as HTMLElement
  const withHero = () => {
    document.body.insertAdjacentHTML('beforeend', '<main id="main"><div data-hero-end></div></main><footer></footer>')
  }

  it('is solid, with no tone, on a page that has no hero', () => {
    render(<Nav />)
    expect(bar().getAttribute('data-state')).toBe('solid')
    expect(bar().hasAttribute('data-bar-tone')).toBe(false)
  })

  it('overlays the hero from its first paint on a page that asks for one, and carries the record\'s tone', () => {
    withHero()
    render(<Nav heroTone="light" />)
    expect(bar().getAttribute('data-state')).toBe('hero-overlay')
    expect(bar().getAttribute('data-bar-tone')).toBe('light')
  })

  it('turns solid when the hero\'s marker has passed the top, and back when it returns', () => {
    withHero()
    render(<Nav heroTone="light" />)
    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: -20 } as DOMRectReadOnly, rootBounds: null }]))
    expect(bar().getAttribute('data-state')).toBe('solid')
    act(() => callback?.([{ isIntersecting: true, boundingClientRect: { top: 30 } as DOMRectReadOnly, rootBounds: null }]))
    expect(bar().getAttribute('data-state')).toBe('hero-overlay')
  })

  it('is menu-open while the menu is open, and returns to the hero state when it closes', () => {
    withHero()
    render(<Nav heroTone="light" />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(bar().getAttribute('data-state')).toBe('menu-open')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(bar().getAttribute('data-state')).toBe('hero-overlay')
  })

  it('makes main and the footer inert while the menu is open, and restores them when it closes', () => {
    withHero()
    render(<Nav heroTone="light" />)
    const main = document.getElementById('main') as HTMLElement
    const footer = document.querySelector('footer') as HTMLElement
    expect(main.hasAttribute('inert')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(main.hasAttribute('inert')).toBe(true)
    expect(footer.hasAttribute('inert')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(main.hasAttribute('inert')).toBe(false)
    expect(footer.hasAttribute('inert')).toBe(false)
  })

  it('does not leave the page inert if the header unmounts with the menu open', () => {
    withHero()
    const { unmount } = render(<Nav heroTone="light" />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    unmount()
    expect(document.getElementById('main')?.hasAttribute('inert')).toBe(false)
    expect(document.querySelector('footer')?.hasAttribute('inert')).toBe(false)
  })

  it('leaves alone a page that was already inert before the menu opened', () => {
    withHero()
    document.getElementById('main')?.setAttribute('inert', '')
    render(<Nav heroTone="light" />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.getElementById('main')?.hasAttribute('inert')).toBe(true)
  })
})
