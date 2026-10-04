import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from './support/test'
import { describeWoff2, uncoveredCharacters } from '../src/lib/design/fontFile'

/**
 * **Every character a page renders is one the brand face draws, and the brand face is the one
 * drawing it.**
 *
 * The site ships only the latin slice of its typeface (`src/app/fonts/README.md`): 219
 * characters. A character outside them is not an error anywhere — the browser takes that one
 * glyph from the fallback face, so an arrow, a check mark or an accented name renders in Arial
 * in the middle of a line. `font-files.test.ts` holds the catalogue and claims content to the
 * slice; this holds what the routes actually render, which also includes every string written
 * into a component.
 *
 * And the face has to arrive. A typeface that 404s, or a loader the stylesheet no longer
 * points at, leaves every page in the fallback and every check above still green, because the
 * characters are measured against the file rather than against the screen. So the second test
 * asks the browser which face it used for each role, and whether it loaded.
 */

const COVERAGE = describeWoff2(
  readFileSync(join(__dirname, '../src/app/fonts/zen-kaku-gothic-antique-latin-400.woff2'))
).codepoints

/** Every page route, at one representative URL each. Literal, so spec-anchor-contract resolves them. */
const ROUTES = [
  { path: '/' },
  { path: '/shop' },
  { path: '/shop/rings' },
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

async function renderedText(page: Page): Promise<string> {
  // innerText, not textContent: what is laid out and visible, without script or JSON-LD.
  // Form controls' placeholders and values are drawn in the face too, so they count.
  return page.evaluate(() => {
    const fields = [...document.querySelectorAll('input, textarea')].flatMap((el) => {
      const field = el as HTMLInputElement
      return [field.placeholder, field.value]
    })
    return [document.body.innerText, ...fields].join('\n')
  })
}

test.describe('glyph coverage', () => {
  test('every route renders only characters the brand face draws', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const findings: string[] = []
    for (const { path } of ROUTES) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      const missing = uncoveredCharacters(await renderedText(page), COVERAGE)
      if (missing.length > 0)
        findings.push(`${path}: ${missing.map((c) => `${c} U+${(c.codePointAt(0) as number).toString(16).toUpperCase()}`).join(', ')}`)
    }
    expect(
      findings,
      'These characters render in the fallback face. Replace them with characters the latin ' +
        'slice draws (see src/app/fonts/README.md), or ship the slice that has them.'
    ).toEqual([])
  })

  test('headings, labels and body text all use the brand face, and it loaded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const report = await page.evaluate(() => {
      const first = (el: Element | null) => (el ? getComputedStyle(el).fontFamily.split(',')[0].trim() : null)
      const roles = {
        heading: first(document.querySelector('h1')),
        label: first(document.querySelector('.label-eyebrow')),
        body: first(document.querySelector('main p')),
        nav: first(document.querySelector('header .hj-icon-btn, header .hj-menu-btn')),
      }
      const loaded = [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => ({ family: face.family.replace(/["']/g, ''), weight: face.weight }))
      return { roles, loaded }
    })

    const families = Object.values(report.roles)
    expect(families, 'a role found no element to measure').not.toContain(null)
    expect(new Set(families).size, `roles resolved to different faces: ${JSON.stringify(report.roles)}`).toBe(1)

    const family = (families[0] as string).replace(/["']/g, '')
    const weights = report.loaded.filter((face) => face.family === family).map((face) => face.weight)
    // The hero heading is 500 and everything else 400: both faces are in use above the fold.
    expect(weights.sort(), `faces loaded for ${family}: ${JSON.stringify(report.loaded)}`).toEqual(['400', '500'])
  })
})
