import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from './support/test'
import { describeWoff2, uncoveredCharacters } from '../src/lib/design/fontFile'

/**
 * **Every character a page renders is one the site's faces draw, and the right face is the one
 * drawing it.**
 *
 * The site ships only the latin slice of each typeface (`src/app/fonts/README.md`). A character
 * outside it is not an error anywhere — the browser takes that one glyph from the fallback face,
 * so an arrow, a check mark or an accented name renders in Arial in the middle of a line.
 * `font-files.test.ts` holds the catalogue and claims content to the slice; this holds what the
 * routes actually render, which also includes every string written into a component.
 *
 * And the faces have to arrive. A typeface that 404s, or a loader the stylesheet no longer
 * points at, leaves every page in the fallback and every check above still green, because the
 * characters are measured against the file rather than against the screen. So the second test
 * asks the browser which face it used for each of the three voices (ADR 051), and whether it
 * loaded.
 *
 * The brand name keeps Barlow Condensed (the owner's ruling, ADR 048), now the label voice as
 * well. The third test holds the logotype to it in both of its places, at the weights it was
 * given: 500 in the header, 400 in the footer.
 */

/**
 * The characters *every* face draws. A character any one face lacks might be set in that face
 * on some page, so the safe set is the intersection, not the union.
 */
const FACE_FILES = [
  'bodoni-moda-96pt-latin-400.woff2',
  'bodoni-moda-24pt-latin-400.woff2',
  'dm-sans-9pt-latin-400.woff2',
  'dm-sans-9pt-latin-500.woff2',
  'barlow-condensed-latin-400.woff2',
  'barlow-condensed-latin-500.woff2',
]
const COVERAGE: ReadonlySet<number> = FACE_FILES.map(
  (file) => describeWoff2(readFileSync(join(__dirname, '../src/app/fonts', file))).codepoints
).reduce((common, next) => new Set([...common].filter((cp) => next.has(cp))))

const BRAND_COVERAGE = describeWoff2(
  readFileSync(join(__dirname, '../src/app/fonts/barlow-condensed-latin-500.woff2'))
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
  test('every route renders only characters every face draws', async ({ page }) => {
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

  test('each voice is drawn by its own face, and each face loaded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const report = await page.evaluate(() => {
      const first = (el: Element | null) => (el ? getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/["']/g, '') : null)
      // next/font names each face after its loader (`bodoniDisplay`), so the family is read from
      // the variable the loader sets on <html> rather than spelled here.
      const family = (variable: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(variable).split(',')[0].trim().replace(/["']/g, '')
      const expected = {
        display: family('--font-bm96'),
        title: family('--font-bm24'),
        body: family('--font-dm'),
        label: family('--font-bc'),
      }
      const roles = {
        display: first(document.querySelector('h1')),
        title: first(document.querySelector('.hj-card-name')),
        body: first(document.querySelector('main p')),
        label: first(document.querySelector('.label-eyebrow')),
        nav: first(document.querySelector('header .hj-icon-btn, header .hj-menu-btn')),
      }
      const loaded = [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => ({ family: face.family.replace(/["']/g, ''), weight: face.weight }))
      return { expected, roles, loaded }
    })

    expect(Object.values(report.expected).every(Boolean), `a loader set no family: ${JSON.stringify(report.expected)}`).toBe(true)
    expect(Object.values(report.roles), 'a role found no element to measure').not.toContain(null)
    expect(report.roles.display, 'the hero heading is the 96pt cut').toBe(report.expected.display)
    expect(report.roles.title, 'a piece name is the 24pt cut').toBe(report.expected.title)
    expect(report.roles.body, 'running text is DM Sans').toBe(report.expected.body)
    expect(report.roles.label, 'an eyebrow is Barlow Condensed').toBe(report.expected.label)
    expect(report.roles.nav, 'the bar\'s controls are Barlow Condensed').toBe(report.expected.label)

    const weightsOf = (name: string) => report.loaded.filter((face) => face.family === name).map((face) => face.weight).sort()
    expect(weightsOf(report.expected.display), `display faces loaded: ${JSON.stringify(report.loaded)}`).toEqual(['400'])
    expect(weightsOf(report.expected.title), `title faces loaded: ${JSON.stringify(report.loaded)}`).toEqual(['400'])
    expect(weightsOf(report.expected.body), `body faces loaded: ${JSON.stringify(report.loaded)}`).toEqual(['400'])
  })

  test('the brand name is set in the label voice at the weights it was given, and both weights loaded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const report = await page.evaluate(() => {
      const first = (el: Element) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/["']/g, '')
      const brandFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-bc').split(',')[0].trim().replace(/["']/g, '')
      const names = [...document.querySelectorAll('header .hj-lockup-text, footer .hj-lockup-text')].map((el) => ({
        family: first(el),
        weight: getComputedStyle(el).fontWeight,
        transform: getComputedStyle(el).textTransform,
        text: (el as HTMLElement).innerText,
      }))
      const loaded = [...document.fonts]
        .filter((face) => face.status === 'loaded' && face.family.replace(/["']/g, '') === brandFamily)
        .map((face) => face.weight)
      return { brandFamily, names, loaded }
    })

    expect(report.brandFamily, 'the label loader\'s family').toMatch(/barlow/i)
    expect(report.names.map((n) => n.family), 'the header and footer logotypes').toEqual([report.brandFamily, report.brandFamily])
    // As the name was set before the Songmont reference: 500 in the header, 400 in the footer.
    expect(report.names.map((n) => n.weight)).toEqual(['500', '400'])
    expect(report.names.map((n) => n.transform)).toEqual(['uppercase', 'uppercase'])
    expect(report.loaded.sort(), `${report.brandFamily} faces loaded`).toEqual(['400', '500'])
    for (const { text } of report.names) expect(uncoveredCharacters(text, BRAND_COVERAGE), text).toEqual([])
  })
})
