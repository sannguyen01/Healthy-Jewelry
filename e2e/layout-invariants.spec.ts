import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from './support/test'
import { OVERHANG_TOLERANCE_PX, settle } from './support/viewportFit'

/**
 * Layout invariants that a visual restyle (calmer, editorial, one listing crop, consistent
 * section rhythm) must not break. The crop was square until 2026-10-04 and is 3:4 since
 * (ADR 044); the card probe reads it from `--ratio-product` rather than restating it. Written BEFORE the restyle, so every number below is
 * derived from reading the CSS/TSX at the time, not from a run. Where a probe is expected
 * to be red against the pre-restyle build, the comment on it says so.
 *
 * Conventions follow homepage-composition / header-fit / product-image-fit: the `test` import
 * comes from './support/test' (egress boundary fixture), reduced motion collapses the
 * one-shot reveal, and every probe is geometric. Every probe THROWS (never passes) when it
 * cannot find what it measures.
 */

const WIDTHS = [320, 390, 768, 1024, 1440] as const
const TOUCH_WIDTHS: readonly number[] = [320, 390, 768]
const PATHS = ['/', '/shop'] as const
const HEIGHT = 900
const MIN_HIT_PX = 44
const RATIO_TOLERANCE = 0.02

test.use({ contextOptions: { reducedMotion: 'reduce' } })

async function visit(page: Page, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT })
  // Literal goto arguments, so spec-anchor-contract can resolve and check both routes.
  if (path === '/shop') await page.goto('/shop')
  else await page.goto('/')
  await expect(page.locator('main')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await settle(page)
}

/* ───────────────────────── 1. horizontal overflow ───────────────────────── */

interface OverflowReport {
  scrollWidth: number
  innerWidth: number
  offenders: string[]
}

/**
 * Two-part probe. (a) the literal `documentElement.scrollWidth <= innerWidth` the brief asks
 * for. (b) a geometric sweep, because globals.css sets `overflow-x: hidden` on html AND body:
 * body clips its own children, so (a) is clamped to innerWidth and is blind to anything
 * inside body (viewportFit.ts header comment; ADR 016). Elements under an ancestor whose
 * overflow-x is not `visible` (hero, care band, the strip scroller) are clipped by design
 * and skipped; the clipping ancestor itself is still measured.
 */
async function overflowProbe(page: Page): Promise<OverflowReport> {
  return page.evaluate((tolerance) => {
    const vw = window.innerWidth
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true
      }
      return false
    }
    const offenders: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (clipped(el)) continue
      if (box.right > vw + tolerance || box.left < -tolerance) {
        const id = el.id ? `#${el.id}` : ''
        const marker = el.getAttribute('data-hj-known-bad') ? '[known-bad]' : ''
        offenders.push(
          `${el.tagName.toLowerCase()}${id}${marker} "${(el.textContent ?? '').trim().slice(0, 24)}" ` +
            `x ${Math.round(box.left)}..${Math.round(box.right)} vs viewport ${vw}`
        )
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: vw,
      offenders,
    }
  }, OVERHANG_TOLERANCE_PX + 0.5)
}

test.describe('no horizontal overflow', () => {
  for (const path of PATHS) {
    test(`${path} fits every width (scrollWidth and element geometry)`, async ({ page }) => {
      const failures: string[] = []
      for (const width of WIDTHS) {
        await visit(page, path, width)
        const report = await overflowProbe(page)
        if (report.scrollWidth > report.innerWidth) {
          failures.push(
            `${width}px: scrollWidth ${report.scrollWidth} > innerWidth ${report.innerWidth}`
          )
        }
        for (const offender of report.offenders) failures.push(`${width}px: ${offender}`)
      }
      expect(failures, `horizontal overflow on ${path}:\n  ${failures.join('\n  ')}`).toEqual([])
    })
  }

  test('known-bad proof: a 2000px element is flagged by the geometric probe', async ({ page }) => {
    await visit(page, '/', 390)
    const before = await overflowProbe(page)
    await page.evaluate(() => {
      const bad = document.createElement('div')
      bad.setAttribute('data-hj-known-bad', '1')
      bad.style.cssText = 'width:2000px;height:10px;background:#000'
      document.querySelector('main')!.appendChild(bad)
    })
    const after = await overflowProbe(page)
    expect(
      after.offenders.filter((o) => o.includes('[known-bad]')),
      'the probe did not flag a 2000px-wide element; it cannot fail, so it proves nothing'
    ).toHaveLength(1)
    expect(after.offenders.length).toBeGreaterThan(before.offenders.length)
    // Recorded, not asserted either way: the scrollWidth half is expected to stay blind
    // here (body overflow-x: hidden), which is why the geometric half exists.
    test.info().annotations.push({
      type: 'scrollWidth with 2000px child',
      description: `${after.scrollWidth} vs innerWidth ${after.innerWidth}`,
    })
  })
})

/* ───────────────────────── 2. images vs containers ───────────────────────── */

test.describe('images match their containers', () => {
  for (const path of PATHS) {
    test(`${path}: every <img> in main has a box and its container's aspect ratio (+-2%)`, async ({
      page,
    }) => {
      const failures: string[] = []
      let inspected = 0
      for (const width of WIDTHS) {
        await visit(page, path, width)
        const rows = await page.evaluate(() =>
          // Not a brand mark: the care band's seal is an image beside the name in one container, a
          // lockup rather than a photograph filling a frame, so its container's shape is not its own.
          // visual-assets.spec.ts holds the mark to decoded, boxed, visible and transparent.
          [...document.querySelectorAll('main img:not([data-brand-mark])')].map((img) => {
            const a = img.getBoundingClientRect()
            const c = (img.parentElement as HTMLElement).getBoundingClientRect()
            return {
              src: (img.getAttribute('src') ?? '').slice(0, 50),
              iw: a.width,
              ih: a.height,
              cw: c.width,
              ch: c.height,
            }
          })
        )
        inspected += rows.length
        for (const r of rows) {
          if (r.iw === 0 || r.ih === 0 || r.cw === 0 || r.ch === 0) {
            failures.push(
              `${width}px ${r.src}: zero box (img ${r.iw}x${r.ih}, container ${r.cw}x${r.ch})`
            )
            continue
          }
          const drift = Math.abs(r.iw / r.ih / (r.cw / r.ch) - 1)
          if (drift > RATIO_TOLERANCE) {
            failures.push(
              `${width}px ${r.src}: img ${r.iw.toFixed(0)}x${r.ih.toFixed(0)} vs container ` +
                `${r.cw.toFixed(0)}x${r.ch.toFixed(0)} (drift ${(drift * 100).toFixed(1)}%)`
            )
          }
        }
      }
      // '/' always carries the hero + moment photographs. /shop may be all illustrations (svg).
      if (path === '/') expect(inspected, 'no <img> found in main on /').toBeGreaterThan(0)
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})

/* ───────────────────────── 3. /shop cards ───────────────────────── */

const CURRENCY = /[$€£¥₫]|\b(USD|EUR|GBP|VND|JPY|AUD|CAD)\b|\bprice\b|\b\d+[.,]\d{2}\b/i
const MATERIAL = /\b(titanium|niobium|steel)\b/i

/** `--ratio-product` as width / height, read from the stylesheet the cards are drawn with. */
const LISTING_RATIO = (() => {
  const css = readFileSync(join(__dirname, '../src/app/globals.css'), 'utf8')
  const match = css.match(/--ratio-product:\s*([\d.]+)\s*\/\s*([\d.]+);/)
  if (!match) throw new Error('--ratio-product is not a ratio in globals.css')
  return Number(match[1]) / Number(match[2])
})()

test.describe('/shop product cards', () => {
  test('take the listing crop, with name + material and no price', async ({ page }) => {
    const failures: string[] = []
    for (const width of WIDTHS) {
      await visit(page, '/shop', width)
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('main a[href^="/products/"]')].map((a) => {
          // The "tile" is the box that holds the picture: parent of the <img>/<svg>, else the
          // first block of the card. NOT the whole card, which also carries the text rows.
          const media = a.querySelector('img, svg')
          const tile =
            (media?.parentElement as HTMLElement | null) ??
            (a.querySelector('article')?.firstElementChild as HTMLElement | null) ??
            (a as HTMLElement)
          const box = tile.getBoundingClientRect()
          const lines = ((a as HTMLElement).innerText ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
          return { href: a.getAttribute('href') ?? '', w: box.width, h: box.height, lines }
        })
      )
      expect(cards.length, `no product cards found on /shop at ${width}px`).toBeGreaterThan(0)
      for (const card of cards) {
        const where = `${width}px ${card.href}`
        if (card.w === 0 || card.h === 0) {
          failures.push(`${where}: zero-size tile`)
        } else if (Math.abs(card.w / card.h - LISTING_RATIO) > RATIO_TOLERANCE) {
          failures.push(
            `${where}: tile ${card.w.toFixed(0)}x${card.h.toFixed(0)} is not the listing crop (${LISTING_RATIO.toFixed(3)})`
          )
        }
        if (card.lines.length < 2)
          failures.push(
            `${where}: expected a name line and a material line, got ${JSON.stringify(card.lines)}`
          )
        if (!card.lines.some((l) => MATERIAL.test(l)))
          failures.push(`${where}: no material text in ${JSON.stringify(card.lines)}`)
        const priced = card.lines.filter((l) => CURRENCY.test(l))
        if (priced.length) failures.push(`${where}: price/currency text ${JSON.stringify(priced)}`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

/* ───────────────────────── 4. controls: hit area + containment ───────────────────────── */

interface ControlBox {
  label: string
  width: number
  height: number
  left: number
  right: number
  /** Inside an overflow-x scroller (the homepage strip): horizontal containment is not expected. */
  scrolls: boolean
}

async function measureControls(page: Page, selector: string, what: string): Promise<ControlBox[]> {
  const found = await page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const style = getComputedStyle(el)
        const box = el.getBoundingClientRect()
        return (
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0 &&
          !el.closest('[inert]') &&
          !el.closest('[aria-hidden="true"]')
        )
      })
      .map((el) => {
        const box = el.getBoundingClientRect()
        let scrolls = false
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'auto' || ox === 'scroll') scrolls = true
        }
        const label =
          el.getAttribute('aria-label') ||
          ((el as HTMLElement).innerText || el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 30) ||
          el.tagName.toLowerCase()
        return {
          label,
          width: box.width,
          height: box.height,
          left: box.left,
          right: box.right,
          scrolls,
        }
      })
  }, selector)
  if (found.length === 0)
    throw new Error(`no visible controls matched "${selector}" (${what}); probe has no default`)
  return found
}

const REGIONS = {
  header: 'header a, header button',
  footer: 'footer a, footer button, footer summary',
  cards: 'main a[href^="/products/"], main .hj-coll-tile',
} as const

async function openDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open menu/i }).click()
  await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible()
  await settle(page)
}
// The navigation drawer only: the consent banner is also role="dialog" and its in-sentence
// Privacy link is an inline link, which WCAG 2.5.8 exempts from the target-size minimum.
const DRAWER = '[aria-label="Mobile navigation"] a, [aria-label="Mobile navigation"] button'

function judge(width: number, region: string, controls: ControlBox[], failures: string[]): void {
  for (const c of controls) {
    if (
      TOUCH_WIDTHS.includes(width) &&
      (c.width < MIN_HIT_PX - 0.5 || c.height < MIN_HIT_PX - 0.5)
    ) {
      failures.push(
        `${width}px ${region} "${c.label}": hit area ${c.width.toFixed(0)}x${c.height.toFixed(0)} < ${MIN_HIT_PX}`
      )
    }
    if (
      !c.scrolls &&
      (c.left < -OVERHANG_TOLERANCE_PX || c.right > width + OVERHANG_TOLERANCE_PX)
    ) {
      failures.push(
        `${width}px ${region} "${c.label}": x ${c.left.toFixed(0)}..${c.right.toFixed(0)} outside 0..${width}`
      )
    }
  }
}

test.describe('interactive controls', () => {
  // Expected RED before the restyle (from CSS, unrun): .hj-menu-btn/.hj-icon-btn/.hj-wordmark
  // have no padding or height (0.68rem text), footer links are display:block at ~14px type with
  // a 10px margin, and ProductGrid's minmax(280px,1fr) cannot fit a 272px column at 320px.
  for (const path of PATHS) {
    test(`${path}: header, footer and card controls (>=44px on touch widths, inside viewport)`, async ({
      page,
    }) => {
      const failures: string[] = []
      for (const width of WIDTHS) {
        await visit(page, path, width)
        for (const [region, selector] of Object.entries(REGIONS)) {
          judge(
            width,
            region,
            await measureControls(page, selector, `${region} on ${path}`),
            failures
          )
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })

    test(`${path}: opened drawer links (>=44px on touch widths, inside viewport)`, async ({
      page,
    }) => {
      const failures: string[] = []
      for (const width of WIDTHS) {
        await visit(page, path, width)
        await openDrawer(page)
        judge(width, 'drawer', await measureControls(page, DRAWER, `drawer on ${path}`), failures)
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})

/* ───────────────────────── 5. focus indicators ───────────────────────── */

interface Indicator {
  tag: string
  label: string
  focusVisible: boolean
  outlineStyle: string
  outlineWidth: number
  boxShadow: string
}

/** Reads the focused element's own computed indicator. globals.css: `:focus-visible` = 2px solid ink, 3px offset. */
async function activeIndicator(page: Page): Promise<Indicator> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const s = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 30),
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: s.outlineStyle,
      outlineWidth: parseFloat(s.outlineWidth) || 0,
      boxShadow: s.boxShadow,
    }
  })
}

function expectIndicator(ind: Indicator, where: string): void {
  expect(
    ind.focusVisible,
    `${where}: element did not match :focus-visible (keyboard modality lost): ${JSON.stringify(ind)}`
  ).toBe(true)
  const hasOutline = ind.outlineStyle !== 'none' && ind.outlineWidth > 0
  const hasShadow = ind.boxShadow !== 'none'
  expect(
    hasOutline || hasShadow,
    `${where}: no visible focus indicator ${JSON.stringify(ind)}`
  ).toBe(true)
}

/** Tab until focus lands inside `selector` (real keyboard path), capped. */
async function tabInto(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate((s) => !!document.activeElement?.closest(s), selector)) return
  }
  throw new Error(`Tab never reached "${selector}" within 12 stops`)
}

/** One real Tab sets keyboard modality; then focus the region's first visible control. */
async function focusFirstIn(page: Page, controlSelector: string): Promise<void> {
  await page.keyboard.press('Tab')
  const ok = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => {
      const b = e.getBoundingClientRect()
      return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'
    })
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    el.focus()
    return document.activeElement === el
  }, controlSelector)
  expect(ok, `could not focus a visible control matching "${controlSelector}"`).toBe(true)
}

test.describe('visible focus indicators', () => {
  for (const width of [390, 1440]) {
    for (const path of PATHS) {
      test(`${path} @${width}: header, drawer, footer and card first stops`, async ({ page }) => {
        await visit(page, path, width)

        // Header: genuine Tab from a fresh page.
        await tabInto(page, 'header')
        expectIndicator(await activeIndicator(page), `header first stop (${path} @${width})`)

        // Drawer: activate MENU from the keyboard, then read the first drawer link.
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible()
        await page
          .waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), undefined, {
            timeout: 2000,
          })
          .catch(() => page.keyboard.press('Tab'))
        expect(
          await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
        ).toBe(true)
        expect(
          (await activeIndicator(page)).tag,
          'drawer focus should be on a link or button'
        ).toMatch(/^(a|button)$/)
        expectIndicator(await activeIndicator(page), `drawer first stop (${path} @${width})`)
        await page.keyboard.press('Escape')
        await visit(page, path, width)

        await focusFirstIn(page, 'footer a')
        expectIndicator(await activeIndicator(page), `footer link (${path} @${width})`)

        await focusFirstIn(page, 'main a[href^="/products/"]')
        expectIndicator(await activeIndicator(page), `card link (${path} @${width})`)
      })
    }
  }
})

/* ───────────────────────── 5b. a control's edge is visible ───────────────────────── */

/**
 * **A bordered control's edge clears 3:1 against what it sits on** (WCAG 1.4.11, ADR 051).
 *
 * `--ash` is the hairline: 1.32:1 on `--bg`, which is right for a divider and wrong for the edge of
 * a button, a chip or an input, where it is the only thing that says "this is a control". The
 * Quiet Archive board's answer is a separate token, `--outline`, at 3.48:1. A token test can prove
 * the values; only a browser can see which one a control actually uses, so this measures it: for
 * every visible control that draws a border, the border colour against the opaque surface behind it,
 * unless the control is filled with a colour that is itself 3:1 against that surface (the ink
 * button, an active chip). A control with no border is not judged: its text is its boundary.
 */
const EDGE_MIN = 3
const EDGE_ROUTES = [{ path: '/' }, { path: '/shop' }, { path: '/contact' }, { path: '/search' }, { path: '/products/arc-hoops-titanium' }]

interface EdgeRow {
  label: string
  edge: number | null
  fill: number | null
  detail: string
}

async function controlEdges(page: Page): Promise<EdgeRow[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number]
    const parse = (value: string): Rgba | null => {
      const m = value.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
      return [r, g, b, a]
    }
    const over = (fg: Rgba, bg: Rgba): Rgba => {
      const a = fg[3]
      return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]
    }
    const lum = ([r, g, b]: Rgba) => {
      const c = [r, g, b].map((v) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    /** The first ancestor with an opaque fill, else the page's own. */
    const surface = (el: Element): Rgba => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const bg = parse(getComputedStyle(p).backgroundColor)
        if (bg && bg[3] >= 0.99) return bg
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]
    }
    const rows: EdgeRow[] = []
    const selector = 'button, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), a[class*="btn"]'
    for (const el of document.querySelectorAll(selector)) {
      const cs = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      if (cs.display === 'none' || cs.visibility === 'hidden' || box.width === 0 || box.height === 0) continue
      const width = Number.parseFloat(cs.borderTopWidth)
      const border = parse(cs.borderTopColor)
      const label = `<${el.tagName.toLowerCase()}> "${((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`
      const behind = surface(el)
      const fillColour = parse(cs.backgroundColor)
      const fill = fillColour && fillColour[3] >= 0.99 ? ratio(fillColour, behind) : null
      if (!(width > 0) || cs.borderTopStyle === 'none' || !border || border[3] === 0) {
        rows.push({ label, edge: null, fill, detail: 'no border' })
        continue
      }
      const edge = ratio(over(border, behind), behind)
      rows.push({ label, edge, fill, detail: `${cs.borderTopColor} on rgb(${behind.slice(0, 3).map(Math.round).join(', ')})` })
    }
    return rows
  })
}

const weakEdges = (rows: EdgeRow[]) =>
  rows.filter((r) => r.edge !== null && r.edge < EDGE_MIN && !(r.fill !== null && r.fill >= EDGE_MIN))

test.describe('control edges', () => {
  for (const { path } of EDGE_ROUTES) {
    test(`${path}: every bordered control's edge is at least ${EDGE_MIN}:1 against its surface`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: HEIGHT })
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await settle(page)
      const rows = await controlEdges(page)
      expect(rows.length, `${path}: no controls found, so nothing was judged`).toBeGreaterThan(0)
      expect(rows.some((r) => r.edge !== null), `${path}: no bordered control found`).toBe(true)
      expect(
        weakEdges(rows).map((r) => `${r.label}: edge ${r.edge?.toFixed(2)}:1 (${r.detail})`),
        'A control\'s edge is --outline (3.48:1), not --ash, the 1.32:1 hairline for dividers (ADR 051).'
      ).toEqual([])
    })
  }

  test('known-bad proof: a control edged in the hairline is flagged', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT })
    await page.goto('/')
    await expect(page.locator('main')).toBeVisible()
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.id = 'hj-known-bad-edge'
      button.textContent = 'Known bad'
      button.setAttribute('style', 'position:fixed;top:120px;left:20px;z-index:9999;padding:12px 24px;background:transparent;border:1px solid var(--ash)')
      document.body.appendChild(button)
    })
    const flagged = weakEdges(await controlEdges(page)).map((r) => r.label)
    expect(flagged.some((l) => l.includes('Known bad')), `the probe did not flag the hairline-edged control: ${flagged.join(' | ')}`).toBe(true)
  })
})

/* ───────────────────────── 6. one h1 ───────────────────────── */

test.describe('heading structure', () => {
  for (const path of PATHS) {
    test(`${path} has exactly one h1`, async ({ page }) => {
      for (const width of WIDTHS) {
        await visit(page, path, width)
        expect(await page.locator('h1').count(), `${path} @${width}px: h1 count`).toBe(1)
      }
    })
  }
})

/* ───────────────────────── 7. homepage vertical rhythm ───────────────────────── */

/**
 * Band, derived from the section TSX (not measured):
 *   gap(prev -> next) = padBottom(prev) + padTop(next) + borderBottom(prev) + borderTop(next)
 * with vertical padding per section (clamp(min, vw%, max), identical top and bottom):
 *   standard (materials, strip, collection-grid, follow-up) = --space-section 56/8vw/120
 *   editorial (care-band, real-moment) = --space-section-lg 96/12vw/160
 * Borders are read from computed style (every band but the dark one and the last draws a 1px
 * hairline under it; ADR 051).
 * A ruled row is content: the registry and the collection index close on a hairline, and the rule
 * is as much of the section as the words above it, so an element's own painted top and bottom
 * borders extend the content block (they used to be absent from the homepage, which had no ruled
 * lists). Band = [sum - 1, sum + 1 + 2*INNER_SLACK_PX]. Lower edge: leaf content cannot sit
 * closer than the padding. Upper slack: the content block is measured from in-flow leaf
 * elements, and an inline leaf (e.g. .material-tag span) has a rect shorter than its line box,
 * so each side may add a few px. 8px per side is a guess to be tuned once, from the first run;
 * padding itself must not be tuned. Hero seam excluded: min-height 100dvh with centred copy
 * makes it a function of viewport height, not of section padding. translateY transforms
 * (RealMoment media: 40px) are neutralised in-page so layout, not animation, is measured.
 */
const PAD_CLAMP: Record<string, [number, number, number]> = {
  // --space-section: clamp(56px, 8vw, 120px); --space-section-lg: clamp(96px, 12vw, 160px)
  materials: [56, 8, 120],
  'care-band': [96, 12, 160],
  collection: [56, 8, 120],
  strip: [56, 8, 120],
  'real-moment': [96, 12, 160],
  'follow-up': [56, 8, 120],
}
const INNER_SLACK_PX = 8

function pad(kind: string, vw: number): number {
  const [min, pct, max] = PAD_CLAMP[kind]
  return Math.min(max, Math.max(min, (vw * pct) / 100))
}

test.describe('homepage vertical rhythm', () => {
  for (const width of WIDTHS) {
    test(`section content gaps stay in the stated band @${width}px`, async ({ page }) => {
      await visit(page, '/', width)
      await page.addStyleTag({
        content: 'main *{transform:none !important;transition:none !important}',
      })
      await settle(page)

      const sections = await page.evaluate(() => {
        const kindOf = (s: Element) => {
          if (s.querySelector('h1')) return 'hero'
          const eyebrow = s.querySelector('.label-eyebrow')?.textContent?.trim() ?? ''
          if (/^care\s*&\s*craft$/i.test(eyebrow)) return 'care-band'
          if (/^the moment$/i.test(eyebrow)) return 'real-moment'
          if (/^materials$/i.test(eyebrow)) return 'materials'
          if (s.querySelector('a[href*="instagram"], a[href*="tiktok"]')) return 'follow-up'
          if (/^collections$/i.test(eyebrow)) return 'collection'
          return eyebrow ? 'strip' : 'unknown'
        }
        // Content block = union of in-flow leaves. A leaf has no in-flow element children
        // (absolute/fixed children do not count); <svg> is a leaf; absolute subtrees are skipped.
        const inFlow = (e: Element) => !['absolute', 'fixed'].includes(getComputedStyle(e).position)
        return [...document.querySelectorAll('main > section')].map((s) => {
          let top = Infinity
          let bottom = -Infinity
          for (const e of s.querySelectorAll('*')) {
            const owningSvg = e.closest('svg')
            if (e.tagName === 'BR' || (owningSvg !== null && owningSvg !== e)) continue
            let skip = false
            for (let p: Element | null = e; p && p !== s; p = p.parentElement) {
              if (!inFlow(p)) skip = true
            }
            if (skip) continue
            // A painted rule is content (see the band note above): a ruled row's closing hairline
            // sits below its last word, and the section really does end there.
            const own = getComputedStyle(e)
            const ownBox = e.getBoundingClientRect()
            if (own.display !== 'none' && own.visibility !== 'hidden' && ownBox.height > 0 && ownBox.width > 0) {
              if (own.borderTopStyle !== 'none' && parseFloat(own.borderTopWidth) > 0) {
                top = Math.min(top, ownBox.top + window.scrollY)
              }
              if (own.borderBottomStyle !== 'none' && parseFloat(own.borderBottomWidth) > 0) {
                bottom = Math.max(bottom, ownBox.bottom + window.scrollY)
              }
            }
            const isLeaf =
              e.tagName.toLowerCase() === 'svg' || ![...e.children].some((c) => inFlow(c))
            if (!isLeaf) continue
            const cs = getComputedStyle(e)
            const b = e.getBoundingClientRect()
            if (
              cs.display === 'none' ||
              cs.visibility === 'hidden' ||
              b.height === 0 ||
              b.width === 0
            )
              continue
            top = Math.min(top, b.top + window.scrollY)
            bottom = Math.max(bottom, b.bottom + window.scrollY)
          }
          const cs = getComputedStyle(s)
          return {
            kind: kindOf(s),
            top,
            bottom,
            borderTop: parseFloat(cs.borderTopWidth) || 0,
            borderBottom: parseFloat(cs.borderBottomWidth) || 0,
          }
        })
      })

      expect(
        sections.map((s) => s.kind),
        'unidentified or missing homepage sections'
      ).not.toContain('unknown')
      expect(sections.length, 'expected the seven-beat homepage').toBeGreaterThanOrEqual(7)
      const failures: string[] = []
      let seams = 0
      for (let i = 1; i < sections.length; i++) {
        const prev = sections[i - 1]
        const next = sections[i]
        if (prev.kind === 'hero') continue
        seams++
        const gap = next.top - prev.bottom
        const expected =
          pad(prev.kind, width) + pad(next.kind, width) + prev.borderBottom + next.borderTop
        const lo = expected - 1
        const hi = expected + 1 + 2 * INNER_SLACK_PX
        if (!(gap >= lo && gap <= hi)) {
          failures.push(
            `${prev.kind} -> ${next.kind}: gap ${gap.toFixed(1)}px outside [${lo.toFixed(1)}, ${hi.toFixed(1)}]`
          )
        }
      }
      expect(seams, 'no seams measured').toBeGreaterThanOrEqual(5)
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})

/* ───────────────────────── 8. no-JS: nothing hidden ───────────────────────── */

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false })

  test('every top-level section on / is opaque, visible and has content', async ({ page }) => {
    // useReveal starts visible=true (fails open) and only hides after mount.
    await page.setViewportSize({ width: 390, height: HEIGHT })
    await page.goto('/')
    const sections = await page.locator('main > section').evaluateAll((els) =>
      els.map((el, index) => ({
        index,
        label: (el.querySelector('h1, h2')?.textContent ?? 'section').trim().slice(0, 30),
        opacity: parseFloat(getComputedStyle(el).opacity),
        visibility: getComputedStyle(el).visibility,
        // Not getBoundingClientRect().height: Chromium evaluates `100dvh` to 0 when script is
        // disabled under viewport emulation, which collapses the hero and everything after it
        // in the measurement without any visitor ever seeing that.
        text: (el.textContent ?? '').trim().length,
        // Opacity, visibility and text all read normally inside a `[hidden]` ancestor, which is
        // how this test passed while the whole page shipped in `<div hidden id="S:0">` behind
        // the root loading.tsx fallback, and a visitor without JavaScript saw only "LOADING"
        // (found in review, 2026-10-04; the fallback is gone). So ask the question directly.
        hiddenAncestor: el.closest('[hidden]') !== null,
      }))
    )
    expect(sections.length, 'no sections rendered without JS').toBeGreaterThanOrEqual(7)
    expect(
      sections.filter((s) => s.opacity !== 1 || s.visibility !== 'visible' || s.text === 0 || s.hiddenAncestor),
      'a section is hidden or collapsed without JavaScript'
    ).toEqual([])

    const page_ = await page.evaluate(() => ({
      headerHidden: document.querySelector('header')?.closest('[hidden]') !== null,
      // A loading placeholder that is actually on screen: rendered, and not inside [hidden].
      loadingShown: [...document.querySelectorAll('body *')].some(
        (el) =>
          el.children.length === 0 &&
          /^loading$/i.test((el.textContent ?? '').trim()) &&
          el.closest('[hidden]') === null &&
          getComputedStyle(el).display !== 'none'
      ),
    }))
    expect(page_.headerHidden, 'the header is inside a hidden streamed segment without JavaScript').toBe(false)
    expect(page_.loadingShown, 'a "Loading" placeholder is what a visitor without JavaScript sees').toBe(false)
  })
})
