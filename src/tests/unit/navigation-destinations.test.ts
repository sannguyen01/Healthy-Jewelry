import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mainNav, footerGroups, legalLinks, byHref, type NavLink } from '@/config/navigation'

/**
 * Every internal destination the header, drawer and footer render has to be a real route.
 *
 * The redesign shipped `/care` and `/events` in the footer with no page behind either, and
 * `href="#"` for two social links. All three are the same defect — a link that goes nowhere —
 * and none was visible to a per-component test. Masterplan W2's known-bad example: add an
 * `/events` link back and this must fail.
 */
const APP = join(process.cwd(), 'src/app')

const rendered: Array<{ source: string; link: NavLink }> = [
  ...mainNav.map((link) => ({ source: 'mainNav', link })),
  ...footerGroups.flatMap((group) =>
    group.links.map((link) => ({ source: `footer:${group.title}`, link }))
  ),
  ...legalLinks.map((link) => ({ source: 'legal', link })),
]

/** A literal directory per segment, or a dynamic `[param]` one, ending in a page. */
const routeExists = (href: string): boolean => {
  const segments = href.split(/[?#]/)[0].split('/').filter(Boolean)
  let dir = APP
  for (const segment of segments) {
    const literal = join(dir, segment)
    if (existsSync(literal)) {
      dir = literal
      continue
    }
    const dynamic = readdirSync(dir).find((entry) => /^\[[^\]]+\]$/.test(entry))
    if (!dynamic) return false
    dir = join(dir, dynamic)
  }
  return existsSync(join(dir, 'page.tsx'))
}

describe('navigation destinations', () => {
  it('collects links from every navigation surface', () => {
    expect(rendered.length).toBeGreaterThan(10)
  })

  it.each(rendered.filter(({ link }) => !/^https?:/.test(link.href)))(
    '$source → $link.href resolves to a route',
    ({ link }) => {
      expect(routeExists(link.href), `${link.href} has no page under src/app`).toBe(true)
    }
  )

  it('never renders a placeholder href', () => {
    const placeholders = rendered.filter(({ link }) => link.href === '#' || link.href === '')
    expect(placeholders).toEqual([])
  })

  it('sends every external link to an absolute https URL', () => {
    const bad = rendered.filter(
      ({ link }) => link.external && !/^https:\/\//.test(link.href)
    )
    expect(bad).toEqual([])
  })

  it('the existence check can fail', () => {
    expect(routeExists('/events')).toBe(false)
  })

  it('byHref returns the matching mainNav entries in the order asked', () => {
    expect(byHref('/contact', '/shop').map((link) => link.href)).toEqual(['/contact', '/shop'])
  })

  it('byHref refuses a destination that is not in mainNav', () => {
    expect(() => byHref('/events')).toThrow(/not in mainNav/)
  })
})
