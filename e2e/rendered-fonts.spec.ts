import { test, expect, type Page } from './support/test'
import { settle } from './support/viewportFit'

/**
 * **Every piece of text on every page is drawn in a face the site shipped, at a weight and a
 * style it shipped, at a size it means.** ([ADR 050](../docs/adr/050-one-face-means-no-borrowed-ones.md),
 * extended to three voices by [ADR 051](../docs/adr/051-three-voices-one-archive.md))
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

/**
 * The three families the loaders ship, and the weights each has a file for. A platform font
 * reports the file's own name (weight and optical size included: "Bodoni Moda 96pt", "DM Sans
 * 9pt Medium"), so {@link family} reduces it to the family before it is looked up here.
 */
const SHIPPED: Record<string, number[]> = {
  'Bodoni Moda': [400],
  'DM Sans': [400, 500],
  'Barlow Condensed': [400, 500],
}
/** `--text-xs`'s minimum, 0.7rem: the smallest text the site sets (unit test: type-system-floor). */
const FLOOR_PX = 11
/**
 * The 96pt Bodoni cut is drawn for display sizes, where its hairlines are meant to be fine; below
 * this the same hairlines break up and the 24pt cut is the right one. The smallest display size
 * token is 38.4px, so a 96pt cut under 36px is a heading that took the wrong token (ADR 051).
 */
const DISPLAY_CUT_MIN_PX = 36

interface Drawn {
  tag: string
  cls: string
  text: string
  weight: number
  style: string
  size: number
  fonts: { familyName: string; isCustomFont: boolean }[]
}

const family = (platformName: string) =>
  platformName
    .replace(/\s+(Regular|Medium|Bold|Light|Italic|Book)$/i, '')
    .replace(/\s+\d+pt$/i, '')
/** The optical size a platform name carries ("Bodoni Moda 96pt Regular" → 96), or null. */
const opticalSize = (platformName: string): number | null => {
  const match = platformName.match(/\s(\d+)pt(?:\s|$)/i)
  return match ? Number(match[1]) : null
}

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

/**
 * **Each role is drawn in its own voice, not merely in a face the site ships.** The first rule of
 * {@link judge} cannot see a heading drawn in the wrong *allowed* face: on 2026-10-09 an unquoted
 * fallback name with a digit in it ("Bodoni 72") invalidated every `font-family: var(--font-display)`,
 * the browser fell back to the inherited family, and every heading and name on the site was drawn in
 * DM Sans. Every other guard passed, because DM Sans is a shipped face. These are the roles whose
 * voice is not in doubt; anything not listed is held only to "a shipped face".
 */
const VOICES: { match: (r: Drawn) => boolean; family: string; role: string }[] = [
  { match: (r) => r.tag === 'h1', family: 'Bodoni Moda', role: 'a page title' },
  { match: (r) => r.cls === 'hj-card-name', family: 'Bodoni Moda', role: 'a piece\'s name' },
  { match: (r) => r.cls === 'hj-menu-link', family: 'Bodoni Moda', role: 'a menu category' },
  { match: (r) => r.cls === 'hj-archive-metal-name', family: 'Bodoni Moda', role: 'a metal\'s name in the menu' },
  { match: (r) => r.cls === 'label-eyebrow', family: 'Barlow Condensed', role: 'an eyebrow label' },
  { match: (r) => r.cls === 'hj-lockup-text', family: 'Barlow Condensed', role: 'the brand name' },
  // Not `th`: the shipping and materials tables set their column heads as labels, on purpose.
  { match: (r) => ['strong', 'b'].includes(r.tag), family: 'DM Sans', role: 'emphasis' },
]

function judge(rows: Drawn[]): string[] {
  const findings: string[] = []
  for (const r of rows) {
    const where = `<${r.tag}${r.cls ? ` .${r.cls}` : ''}> "${r.text}"`
    for (const f of r.fonts) {
      const name = family(f.familyName)
      if (!(name in SHIPPED) || !f.isCustomFont) {
        findings.push(`${where}: drawn in "${f.familyName}"${f.isCustomFont ? '' : ' (a system font)'}`)
        continue
      }
      if (!SHIPPED[name].includes(r.weight))
        findings.push(`${where}: asks ${name} for weight ${r.weight}; it ships ${SHIPPED[name].join(' and ')}`)
      if (name === 'Bodoni Moda' && opticalSize(f.familyName) === 96 && r.size < DISPLAY_CUT_MIN_PX)
        findings.push(`${where}: ${r.size}px in the 96pt cut; below ${DISPLAY_CUT_MIN_PX}px it is the 24pt cut's size`)
    }
    if (r.fonts.length === 0) findings.push(`${where}: Chrome reports no face drew it`)
    for (const voice of VOICES) {
      if (voice.match(r) && r.fonts.some((f) => family(f.familyName) !== voice.family))
        findings.push(`${where}: ${voice.role} is ${voice.family}, drawn in ${r.fonts.map((f) => `"${f.familyName}"`).join(', ')}`)
    }
    if (r.style !== 'normal') findings.push(`${where}: asks for font-style ${r.style}; the site ships no italic`)
    if (r.size < FLOOR_PX) findings.push(`${where}: ${r.size}px, below the ${FLOOR_PX}px label floor`)
  }
  return findings
}

const EXPLAIN =
  'The site ships Bodoni Moda (400), DM Sans (400, 500) and Barlow Condensed (400, 500), and nothing ' +
  'else. A request for a weight or style outside that is faked by the browser, and a system font is ' +
  'a different typeface on every visitor\'s machine (ADR 050, 051).'

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

  test('form controls draw in one of the site\'s faces, not the browser\'s', async ({ page }) => {
    for (const path of ['/contact', '/search']) {
      await page.goto(path)
      const controls = await page.evaluate(() => {
        const first = (value: string) => value.split(',')[0].trim().replace(/["']/g, '')
        const root = getComputedStyle(document.documentElement)
        // Each loader sets its family on <html>; a control is in the site's faces when its first
        // family is one of those, and in the browser's own (Arial) when it is not.
        const ours = new Set(
          ['--font-bm96', '--font-bm24', '--font-dm', '--font-dm500', '--font-bc'].map((v) => first(root.getPropertyValue(v)))
        )
        return {
          ours: [...ours],
          controls: [...document.querySelectorAll('input, textarea, select, button')].map((el) => ({
            tag: el.tagName.toLowerCase(),
            name: el.getAttribute('name') ?? el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20) ?? '',
            ours: ours.has(first(getComputedStyle(el).fontFamily)),
          })),
        }
      })
      expect(controls.ours.length, 'the loaders set their families on <html>').toBe(5)
      expect(controls.controls.length, `${path} has controls`).toBeGreaterThan(1)
      expect(
        controls.controls.filter((c) => !c.ours).map((c) => `${path} <${c.tag}> ${c.name}`),
        'A form control does not inherit the page font unless the stylesheet says so; the browser\'s own is Arial.'
      ).toEqual([])
    }
  })
})
