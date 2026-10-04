import { test, expect, type Page } from './support/test'
import { settle } from './support/viewportFit'

/**
 * **Every page route, at every width a project stands for, measured rather than looked at.**
 *
 * The geometric specs before this one each watched a part of the site: the header
 * (`header-fit`), the hero (`hero-legibility`), the product tile (`product-image-fit`), and
 * `/` and `/shop` (`layout-invariants`). The pages between them were seen only by whoever
 * happened to open them. A sweep of all fourteen routes on 2026-10-04 found what that left:
 *
 * - `/search` at 320px pushed its SEARCH button 17px past the viewport: an `<input>` will not
 *   shrink below its default intrinsic width unless it is given `min-width: 0`;
 * - `/about`'s rule ran 24–77px past the viewport at every width (`width: 100%` plus a margin);
 * - "View All", the breadcrumb links and "Contact an ambassador" were 16–20px tall.
 *
 * Neither overflow was visible, because `globals.css` sets `overflow-x: hidden` on the page:
 * the browser clips instead of scrolling, so the only symptom is a control cut in half. That
 * is why every probe here is geometric — boxes against `window.innerWidth` — as in ADR 016.
 *
 * Four invariants, per route and width:
 * 1. **Nothing runs past the viewport** unless an ancestor that is itself in view clips it
 *    (the product strip scrolls; its cards are meant to leave its box).
 * 2. **Every standalone control is at least 24 × 24** (WCAG 2.5.8). A link inside a sentence is
 *    exempt, as the criterion exempts it; so is a footer group heading where the footer shows
 *    its groups open and the heading is not a control (`tabindex="-1"`, no pointer events).
 * 3. **No two controls overlap** — a tap meant for one cannot land on another.
 * 4. **No page error and no console error.**
 */

const ROUTES = [
  { path: '/' },
  { path: '/shop' },
  { path: '/shop/earrings' },
  { path: '/products/arc-hoops-titanium' },
  { path: '/about' },
  { path: '/materials' },
  { path: '/search?q=titanium' },
  { path: '/contact' },
  { path: '/faq' },
  { path: '/shipping' },
  { path: '/terms' },
  { path: '/privacy' },
  { path: '/legal' },
  { path: '/stores' },
]

/** The widths each project stands for: a phone project sweeps phones and tablets, a desktop one desktops. */
const WIDTHS: Record<string, readonly number[]> = {
  mobile: [320, 360, 390, 412, 768],
  chromium: [769, 1024, 1440, 1920],
}

const MIN_TARGET_PX = 24

test.use({ contextOptions: { reducedMotion: 'reduce' } })

interface Findings {
  overflow: string[]
  smallTargets: string[]
  overlaps: string[]
}

async function measure(page: Page): Promise<Findings> {
  return page.evaluate((minTarget) => {
    const vw = window.innerWidth
    const shown = (el: Element) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && !el.closest('[inert], [aria-hidden="true"]')
    }
    const label = (el: Element) => {
      const text = ((el as HTMLElement).getAttribute('aria-label') || (el as HTMLElement).innerText || '').trim()
      return `${el.tagName.toLowerCase()}${text ? ` "${text.replace(/\s+/g, ' ').slice(0, 40)}"` : ''}`
    }
    const clippedInView = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflow}`)) {
          const r = a.getBoundingClientRect()
          if (r.left >= -1 && r.right <= vw + 1) return true
        }
      }
      return false
    }

    const overflow: string[] = []
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || getComputedStyle(el).position === 'fixed') continue
      const r = el.getBoundingClientRect()
      if ((r.right > vw + 1 || r.left < -1) && !clippedInView(el))
        overflow.push(`${label(el)} spans ${Math.round(r.left)}–${Math.round(r.right)}px of ${vw}`)
    }

    const controls = [
      ...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [role="button"]'),
    ].filter((el) => shown(el) && getComputedStyle(el).pointerEvents !== 'none' && el.tabIndex !== -1)

    const inSentence = (el: HTMLElement) => {
      const parent = el.parentElement
      if (!parent || getComputedStyle(el).display !== 'inline') return false
      return (parent.innerText ?? '').trim().length > (el.innerText ?? '').trim().length + 3
    }
    const smallTargets: string[] = []
    for (const el of controls) {
      const r = el.getBoundingClientRect()
      if (!inSentence(el) && (r.width < minTarget || r.height < minTarget))
        smallTargets.push(`${label(el)} is ${Math.round(r.width)}×${Math.round(r.height)}`)
    }

    const overlaps: string[] = []
    const fixed = (el: Element) => {
      for (let a: Element | null = el; a; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return true
      return false
    }
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]
        const b = controls[j]
        if (a.contains(b) || b.contains(a) || fixed(a) !== fixed(b)) continue
        const p = a.getBoundingClientRect()
        const q = b.getBoundingClientRect()
        const w = Math.min(p.right, q.right) - Math.max(p.left, q.left)
        const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
        if (w > 2 && h > 2) overlaps.push(`${label(a)} overlaps ${label(b)} by ${Math.round(w)}×${Math.round(h)}`)
      }
    }
    return { overflow, smallTargets, overlaps }
  }, MIN_TARGET_PX)
}

test.describe('Responsive sweep', () => {
  test.beforeEach(async ({ context }) => {
    // The consent banner is fixed over the page by design until answered; its own layout is
    // analytics.spec's subject. Answering it here measures the page beneath.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('hj-analytics-consent', 'denied')
      } catch {
        /* storage unavailable: the banner stays, and is fixed, so it is not measured as overflow */
      }
    })
  })

  for (const { path } of ROUTES) {
    test(`${path} holds at every width`, async ({ page }, testInfo) => {
      test.slow()
      const widths = WIDTHS[testInfo.project.name]
      expect(widths, `no widths declared for project ${testInfo.project.name}`).toBeDefined()

      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`)
      })

      const failures: string[] = []
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await page.evaluate(() => document.fonts.ready)
        await settle(page)
        const found = await measure(page)
        for (const [kind, items] of Object.entries(found)) for (const item of items) failures.push(`${width}px ${kind}: ${item}`)
      }

      expect(failures, `${path} breaks at some width`).toEqual([])
      expect(errors, `${path} logged errors`).toEqual([])
    })
  }
})
