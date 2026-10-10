import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Hero } from '@/components/home/Hero'
import { heroMedia, type HeroMedia } from '@/lib/catalog'

vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
  // The real one defaults `loading` to "lazy" unless it is asked for something else (get-img-props.js: `isLazy`), and
  // returns what it was given as props. The mock says the same, so a test sees what the browser would be handed.
  getImageProps: ({
    src,
    alt,
    loading,
    fetchPriority,
  }: {
    src: string
    alt: string
    loading?: 'lazy' | 'eager'
    fetchPriority?: 'high' | 'low' | 'auto'
  }) => ({
    props: { src, alt, srcSet: `${src} 1x`, loading: loading ?? 'lazy', fetchPriority },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const LINES = ['Metal,', 'named', 'exactly.']
const ROOT = resolve(__dirname, '../../../..')

/** The committed record, with the parts a test varies. */
function record(change: (m: HeroMedia) => void = () => undefined): HeroMedia {
  const m = structuredClone(heroMedia())
  change(m)
  return m
}

const section = (c: HTMLElement) => c.querySelector('section') as HTMLElement

describe('Hero — one composition (ADR 054)', () => {
  it('has exactly one h1, set as block lines in a sentence, with no line-break element', () => {
    const { container } = render(<Hero media={record()} headlineLines={LINES} />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].textContent).toBe('Metal, named exactly.')
    expect(h1s[0].querySelectorAll('br')).toHaveLength(0)
    expect(h1s[0].querySelectorAll('.hj-hero-line')).toHaveLength(3)
  })

  it('names the metals by specification, says one factual sentence, and offers two calm next steps', () => {
    const { container } = render(<Hero media={record()} headlineLines={LINES} />)
    expect(container.textContent).toContain('Grade 23 Titanium · Niobium · 316L Steel')
    expect(container.textContent).toContain('No stones. No fillers. Pure material integrity.')
    const links = Array.from(container.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Explore the pieces', '/shop'],
      ['Our story', '/about'],
    ])
  })

  it('ends with a sentinel the header reads, and hides it from the accessibility tree', () => {
    const { container } = render(<Hero media={record()} headlineLines={LINES} />)
    const sentinels = container.querySelectorAll('[data-hero-end]')
    expect(sentinels).toHaveLength(1)
    expect(sentinels[0].getAttribute('aria-hidden')).toBe('true')
    expect(section(container).lastElementChild).toBe(sentinels[0])
  })

  it('describes the photograph with the record\'s own words, and is not hidden from assistive technology', () => {
    const media = record()
    const { container } = render(<Hero media={media} headlineLines={LINES} />)
    const img = container.querySelector('.hj-hero-media img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe(media.alt)
    expect(img.getAttribute('alt')).not.toBe('')
    expect(container.querySelector('.hj-hero-media')?.getAttribute('aria-hidden')).toBeNull()
    // One veil, the copy's, in the safe zone's last row beside what it protects. The bar's veil belongs to the bar.
    const veils = Array.from(container.querySelectorAll('.hj-hero-veil'))
    expect(veils.map((v) => v.getAttribute('data-edge'))).toEqual(['bottom'])
    for (const veil of veils) expect(veil.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.hj-hero-safe > .hj-hero-veil[data-edge="bottom"]')).toBeTruthy()
  })

  it('carries both variants and the record\'s focal points and corners as data, and leaves the header\'s tone to the header', () => {
    const media = record()
    const { container } = render(<Hero media={media} headlineLines={LINES} />)
    const el = section(container)
    expect(el.getAttribute('data-variant-wide')).toBe(media.desktop.variant)
    expect(el.getAttribute('data-variant-narrow')).toBe(media.mobile.variant)
    expect(el.hasAttribute('data-header-tone')).toBe(false)
    expect(el.style.getPropertyValue('--hj-focal-wide')).toBe('69% 45%')
    expect(el.style.getPropertyValue('--hj-focal-narrow')).toBe('80% 40%')
    expect(el.style.getPropertyValue('--hj-zone-wide')).toBe('start')
    const flipped = render(
      <Hero media={record((m) => { m.mobile.copyZone = 'bottom-end' })} headlineLines={LINES} />
    )
    expect(section(flipped.container).style.getPropertyValue('--hj-zone-narrow')).toBe('end')
  })

  it('uses a single photograph element while both crops share a file, and a picture when they differ', () => {
    const same = render(<Hero media={record()} headlineLines={LINES} />)
    expect(same.container.querySelector('picture')).toBeNull()
    expect(same.container.querySelectorAll('.hj-hero-media img')).toHaveLength(1)

    const differ = render(
      <Hero media={record((m) => { m.mobile.src = '/images/lifestyle/hero-portrait.jpg' })} headlineLines={LINES} />
    )
    const picture = differ.container.querySelector('picture') as HTMLElement
    expect(picture).toBeTruthy()
    expect(picture.className).toContain('hj-hero-picture')
    expect(picture.querySelector('source')?.getAttribute('media')).toBe('(max-width: 900px)')
    expect(picture.querySelector('source')?.getAttribute('srcset')).toContain('hero-portrait.jpg')
    expect(picture.querySelector('img')?.getAttribute('src')).toContain('hero-banner.jpg')
  })

  it('asks for the picture\'s file at once and at high priority, not lazily, when it has to be a picture', () => {
    // A preload would fetch both files and defeat the art direction, so the one <img> must say it is the first
    // screen. Left alone the framework defaults it to loading="lazy": the browser then holds the request until layout
    // says the box is in view, a delay on the largest thing on the page.
    const { container } = render(
      <Hero media={record((m) => { m.mobile.src = '/images/lifestyle/hero-portrait.jpg' })} headlineLines={LINES} />
    )
    const img = container.querySelector('picture img') as HTMLImageElement
    expect(img.getAttribute('loading')).toBe('eager')
    expect(img.getAttribute('fetchpriority')).toBe('high')
  })

  it('bounds the card by the token, and only when some crop is a card', () => {
    const { container } = render(<Hero media={record()} headlineLines={LINES} />)
    const copy = container.querySelector('.hj-hero-copy') as HTMLElement
    expect(copy.style.maxWidth).toBe('calc(var(--hj-hero-card-max-ratio) * 100%)')

    const none = render(
      <Hero media={record((m) => { m.desktop.variant = 'overlay' })} headlineLines={LINES} />
    )
    expect((none.container.querySelector('.hj-hero-copy') as HTMLElement).style.maxWidth).toBe('')
  })

  it('enters in order, by an index each child carries, and never starts transparent', () => {
    const { container } = render(<Hero media={record()} headlineLines={LINES} />)
    const children = Array.from(container.querySelector('.hj-hero-content')!.children) as HTMLElement[]
    expect(children.map((c) => c.style.getPropertyValue('--hj-i'))).toEqual(['0', '1', '2', '3'])
    expect(container.querySelectorAll('[style*="opacity"]')).toHaveLength(0)
  })

  it('is a server component: no client directive, no effect, no timer', () => {
    for (const file of ['src/components/home/Hero.tsx', 'src/components/home/HeroPicture.tsx']) {
      const source = readFileSync(resolve(ROOT, file), 'utf8')
      expect(source, file).not.toMatch(/['"]use client['"]/)
      expect(source, file).not.toMatch(/\buseEffect\b|\bsetTimeout\b|\buseState\b/)
    }
  })
})
