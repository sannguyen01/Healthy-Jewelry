import { test, expect, type Page } from './support/test'
import { settle } from './support/viewportFit'

/**
 * **Every piece of text on every page is drawn in a face the site shipped, at a weight and a
 * style it shipped, at a size it means.** ([ADR 050](../docs/adr/050-one-face-means-no-borrowed-ones.md))
 *
 * `glyph-coverage.spec.ts` asks whether the *characters* are in the face and whether the face
 * loaded. This asks what Chrome actually used, node by node, which is the only place the
 * difference between what CSS *requests* and what is *drawn* shows. On 2026-10-09 that
 * difference was invisible to every other guard:
 *
 * - `<strong>` and `<th>` requested 700 and the site ships 400 and 500, so Chrome drew a faked
 *   bold; the footer tagline on every page requested italic from an upright gothic, so Chrome
 *   drew a slant. The computed `font-family` was right in both cases and so was the platform
 *   font's *name*. Only the requested weight and style gave them away;
 * - the 410 page was set in `system-ui`, which is a different typeface on every visitor's
 *   machine.
 *
 * The platform font is read through the DevTools protocol (`CSS.getPlatformFontsForNode`), the
 * same call the Rendered Fonts pane in Chrome's inspector makes, so a fallback face shows up as a
 * name that is not ours and `isCustomFont: false`. Both projects are Chromium, so both can ask.
 *
 * Placeholders are not text nodes and the protocol does not report them, so form controls are
 * held to a different test: they must compute the same family as the page, because a control
 * does not inherit a font unless the stylesheet says so, and the browser's own is Arial.
 */

/** Every page route, and the three documents that are not ordinary pages. Literal, as in glyph-coverage. */
const ROUTES = [
  { path: '/', status: 200, min: 40 },
  { path: '/shop', status: 200, min: 40 },
  { path: '/shop/rings', status: 200, min: 40 },
  { path: '/products/arc-hoops-titanium', status: 200, min: 25 },
  { path: '/about', status: 200, min: 40 },
  { path: '/materials', status: 200, min: 40 },
  { path: '/search?q=titanium', status: 200, min: 25 },
  { path: '/contact', status: 200, min: 25 },
  { path: '/faq', status: 200, min: 40 },
  { path: '/shipping', status: 200, min: 25 },
  { path: '/terms', status: 200, min: 40 },
  { path: '/privacy', status: 200, min: 40 },
  { path: '/legal', status: 200, min: 25 },
  { path: '/stores', status: 200, min: 25 },
  // The 404 the app renders, and the 410 a retired URL answers with: a plain document, outside
  // the layout, with a heading and a few lines and nothing else to measure.
  { path: '/this-page-does-not-exist', status: 404, min: 8 },
  { path: '/checkout', status: 410, min: 3 },
]

/** The two families the loaders ship. A platform font reports the file's own name, weight included. */
const FACES = ['Zen Kaku Gothic Antique', 'Barlow Condensed']
const SHIPPED_WEIGHTS = [400, 500]
/** `--text-xs`'s minimum, 0.7rem: the smallest text the site sets (unit test: type-system-floor). */
const FLOOR_PX = 11

interface Drawn {
  tag: string
  cls: string
  text: string
  weight: number
  style: string
  size: number
  fonts: { familyName: string; isCustomFont: boolean }[]
}

const family = (platformName: string) => platformName.replace(/\s+(Regular|Medium|Bold|Light|Italic|Book)$/i, '')

/** What Chrome drew every text-bearing element in, with what its CSS asked for. */
async function drawn(page: Page): Promise<Drawn[]> {
  // A page measured before it arrived has its copy in a hidden streamed segment, and the 404
  // was measured at four text nodes instead of its dozen about one load in three (ADR 042).
  await settle(page)
  await page.evaluate(() => document.fonts.ready)
  // Mark, in document order, every element that owns a visible text node.
  const marked = await page.evaluate(() => {
    const out: Omit<Drawn, 'fonts'>[] = []
    let n = 0
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
      const own = [...el.childNodes].filter((c) => c.nodeType === 3 && (c.textContent ?? '').trim())
      if (!own.length) continue
      const cs = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      if (cs.display === 'none' || cs.visibility === 'hidden' || (box.width === 0 && box.height === 0)) continue
      // Text Chrome has not laid out has no face to report: the links inside a collapsed
      // <details> (the phone footer's groups) keep a box but are never rendered. Measure what
      // is rendered. The open menu has its own test, where its links are.
      if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue
      el.setAttribute('data-rendered-font', String(n++))
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').split(' ')[0],
        text: own.map((c) => (c.textContent ?? '').trim()).join(' ').slice(0, 40),
        weight: Number(cs.fontWeight),
        style: cs.fontStyle,
        size: Number.parseFloat(cs.fontSize),
      })
    }
    return out
  })

  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    // querySelectorAll answers in document order, which is the order they were marked in.
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-rendered-font]' })
    expect(nodeIds.length, 'every marked element is found again by the protocol').toBe(marked.length)
    const rows: Drawn[] = []
    for (let i = 0; i < marked.length; i += 1) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[i] })
      rows.push({ ...marked[i], fonts: fonts.map((f) => ({ familyName: f.familyName, isCustomFont: f.isCustomFont })) })
    }
    // The page can change between marking an element and asking about it: below 769px the
    // footer's groups arrive open from the server and collapse after hydration, and a link that
    // has since lost its box has no face to report. That is the page settling, not a missing
    // face, so an element with nothing drawn is kept only if it still has a box.
    const empty = rows.flatMap((r, i) => (r.fonts.length === 0 ? [i] : []))
    if (empty.length > 0) {
      const boxes = await page.evaluate(
        (indexes) => indexes.map((i) => document.querySelector(`[data-rendered-font="${i}"]`)?.getClientRects().length ?? 0),
        empty
      )
      const gone = new Set(empty.filter((_, k) => boxes[k] === 0))
      return rows.filter((_, i) => !gone.has(i))
    }
    return rows
  } finally {
    await cdp.detach()
  }
}

function judge(rows: Drawn[]): string[] {
  const findings: string[] = []
  for (const r of rows) {
    const where = `<${r.tag}${r.cls ? ` .${r.cls}` : ''}> "${r.text}"`
    for (const f of r.fonts) {
      if (!FACES.includes(family(f.familyName)) || !f.isCustomFont) {
        findings.push(`${where}: drawn in "${f.familyName}"${f.isCustomFont ? '' : ' (a system font)'}`)
      }
    }
    if (r.fonts.length === 0) findings.push(`${where}: Chrome reports no face drew it`)
    if (!SHIPPED_WEIGHTS.includes(r.weight)) findings.push(`${where}: asks for weight ${r.weight}; the site ships ${SHIPPED_WEIGHTS.join(' and ')}`)
    if (r.style !== 'normal') findings.push(`${where}: asks for font-style ${r.style}; the site ships no italic`)
    if (r.size < FLOOR_PX) findings.push(`${where}: ${r.size}px, below the ${FLOOR_PX}px label floor`)
  }
  return findings
}

const EXPLAIN =
  'The site ships Zen Kaku Gothic Antique at 400 and 500, and Barlow Condensed for the name, and ' +
  'nothing else. A request for a weight or style outside that is faked by the browser, and a ' +
  'system font is a different typeface on every visitor\'s machine (ADR 050).'

test.describe('rendered fonts', () => {
  for (const { path, status, min } of ROUTES) {
    test(`${path} draws every text node in a shipped face`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(status)
      const rows = await drawn(page)
      // A page that measured nothing would pass every rule below, so each route says how much
      // text it has at least (a page that lost half its text is also worth knowing about).
      expect(rows.length, `${path} has text to measure`).toBeGreaterThanOrEqual(min)
      expect(judge(rows), EXPLAIN).toEqual([])
    })
  }

  test('the open menu draws every text node in a shipped face', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /menu/i }).first().click()
    // The overlay is the thing under test: wait for it to be the thing on screen.
    await expect(page.locator('.hj-menu-link').first()).toBeVisible()
    await page.waitForTimeout(500)
    const rows = await drawn(page)
    expect(rows.some((r) => r.cls === 'hj-menu-link'), 'the overlay\'s links were measured').toBe(true)
    expect(judge(rows), EXPLAIN).toEqual([])
  })

  test('form controls draw in the page\'s face, not the browser\'s', async ({ page }) => {
    for (const path of ['/contact', '/search']) {
      await page.goto(path)
      const controls = await page.evaluate(() => {
        const body = getComputedStyle(document.body).fontFamily
        return [...document.querySelectorAll('input, textarea, select, button')].map((el) => ({
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute('name') ?? el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20) ?? '',
          inherits: getComputedStyle(el).fontFamily === body,
        }))
      })
      expect(controls.length, `${path} has controls`).toBeGreaterThan(1)
      expect(
        controls.filter((c) => !c.inherits).map((c) => `${path} <${c.tag}> ${c.name}`),
        'A form control does not inherit the page font unless the stylesheet says so; the browser\'s own is Arial.'
      ).toEqual([])
    }
  })
})
