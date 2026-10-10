import { PNG } from 'pngjs'
import { test, expect, type Locator, type Page } from './support/test'
import { intersection, OVERLAP_TOLERANCE_PX, type Box } from './support/viewportFit'
import { describeVerdicts, worstContrast, type Verdict } from './support/backdropContrast'
import { contrastRatioFromLuminance, parseCssColor, relativeLuminance } from '../src/lib/utils/contrast'
import { coverVisibleRect, visibleFraction } from '../src/lib/layout/coverCrop'
import { heroMedia } from '../src/lib/catalog'

/**
 * The home page's first screen, across the widths that matter (ADR 054).
 *
 * `visual-assets.spec.ts` proves the hero photograph *renders*. This asks the questions that proof
 * cannot: is the photograph the first screen, can everything over it be read, is the subject still in
 * frame, does anything overlap anything, and does the page survive the conditions a real visitor brings
 * (no motion, no script, forced colours, large text, a blocked image, a short phone with the consent
 * notice up). axe cannot answer these either: it returns *incomplete* for text over an image, because it
 * cannot know what the pixels are. So this measures them.
 *
 * ## What is read, and from where
 *
 * - **The record.** The art direction (crop, focal point, subject box, variant, header tone) is data in
 *   `src/content/hero/home.json`, read here through the catalogue reader. The tests check that the
 *   *browser's* boxes and styles agree with it, not that the CSS agrees with itself.
 * - **The browser's own boxes**, taken after fonts and the image have settled and with every animation
 *   finished, because measuring a moving target is how a button's backdrop gets reported as the page
 *   behind where the button used to be.
 * - **Rendered pixels**, with only the glyphs removed (`support/backdropContrast.ts`).
 *
 * ## How it is located
 *
 * By structure the old composition shares with the new one (`main > section`, the first image, the
 * header, text and role), not by the class names the new one introduces, so a failure on the old page is
 * a *geometric* failure ("the photograph begins 468px down") and not "a selector is missing".
 *
 * ## The old floor, replaced
 *
 * "At least half of the source frame is visible" (ADR 021) cannot hold for a viewport-filling phone hero:
 * a 1376×768 photograph shows 25.8% of its width at 390×844. What must survive the crop is the subject, so
 * that floor is now "the record's subject box is at least 90% visible and clear of the copy".
 */

/**
 * The eleven widths of ADR 054. 900 and 901 are both here on purpose: the breakpoint itself is where the
 * two compositions used to diverge, so the pair is the regression test for it.
 */
const VIEWPORTS = [
  { label: '320×568 — smallest phone', width: 320, height: 568 },
  { label: '360×640 — small Android', width: 360, height: 640 },
  { label: '375×667 — iPhone SE', width: 375, height: 667 },
  { label: '390×844 — iPhone', width: 390, height: 844 },
  { label: '430×932 — large phone', width: 430, height: 932 },
  { label: '768×1024 — tablet portrait', width: 768, height: 1024 },
  { label: '900×900 — last narrow width', width: 900, height: 900 },
  { label: '901×900 — first wide width', width: 901, height: 900 },
  { label: '1024×768 — small laptop', width: 1024, height: 768 },
  { label: '1280×900 — laptop', width: 1280, height: 900 },
  { label: '1440×900 — desktop', width: 1440, height: 900 },
]

const CONSENT_KEY = 'hj-analytics-consent'
const MOBILE_QUERY = '(max-width: 900px)'
const media = heroMedia()

// ── Locators ─────────────────────────────────────────────────────────────────

const hero = (page: Page): Locator => page.locator('main > section').first()
const heroPhoto = (page: Page): Locator => hero(page).locator('img').first()
const header = (page: Page): Locator => page.locator('header.hj-header')

type Labelled = { label: string; locator: Locator }

/** The text the hero's message depends on, found by content so a failure names what a visitor lost. */
function copyNodes(page: Page): Labelled[] {
  const h = hero(page)
  return [
    { label: 'eyebrow', locator: h.getByText(/grade 23 titanium · niobium · 316l steel/i) },
    { label: 'headline', locator: h.getByRole('heading', { level: 1 }) },
    { label: 'body copy', locator: h.getByText(/no stones\. no fillers/i) },
    // By position, not by label: the labels are pinned by Hero.test.tsx, and a geometry test that fails
    // because a label changed has reported the label, not the geometry.
    { label: 'primary action', locator: h.getByRole('link').first() },
    { label: 'secondary action', locator: h.getByRole('link').nth(1) },
  ]
}

/** The header's controls. Visible ones only: below 769px CONTACT leaves the bar, below 360px the name does. */
async function headerNodes(page: Page): Promise<Array<Labelled & { kind: 'text' | 'graphic' }>> {
  const bar = header(page)
  const nodes: Array<Labelled & { kind: 'text' | 'graphic' }> = [
    { label: 'MENU control', locator: bar.locator('.hj-menu-btn'), kind: 'text' },
    { label: 'brand name', locator: bar.locator('.hj-lockup-text'), kind: 'text' },
    { label: 'CONTACT link', locator: bar.getByRole('link', { name: /contact/i }), kind: 'text' },
  ]
  const search = bar.getByRole('button', { name: 'Search' })
  // The same button is a word at 769px and up and a magnifying glass below, and the two are held to
  // different ratios (WCAG 1.4.3 for text, 1.4.11 for a graphic).
  const asWord = await search.locator('.hj-desktop-text').isVisible()
  nodes.push({ label: 'search control', locator: search, kind: asWord ? 'text' : 'graphic' })

  const visible: typeof nodes = []
  for (const node of nodes) {
    if (await node.locator.first().isVisible()) visible.push(node)
  }
  return visible
}

async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.first().boundingBox({ timeout: 5_000 }).catch(() => null)
  if (!box) throw new Error(`${label} has no box: it is not on the page (or not visible)`)
  return box
}

async function copyBoxes(page: Page): Promise<Array<{ label: string; box: Box }>> {
  const out: Array<{ label: string; box: Box }> = []
  for (const { label, locator } of copyNodes(page)) out.push({ label, box: await boxOf(locator, label) })
  return out
}

/** Everything is placed and still: fonts loaded, the photograph decoded, no animation running. */
async function settleHero(page: Page): Promise<void> {
  await expect(heroPhoto(page)).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    const img = document.querySelector<HTMLImageElement>('main > section img')
    if (img && !img.complete) await new Promise<void>((r) => { img.onload = img.onerror = () => r() })
    if (img) await img.decode().catch(() => undefined)
  })
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  )
}

const px = (value: string): number => Number.parseFloat(value)

async function isNarrow(page: Page): Promise<boolean> {
  return page.evaluate((q) => matchMedia(q).matches, MOBILE_QUERY)
}

/** The width the visitor's own gutter is, resolved by the browser rather than copied from the stylesheet. */
async function gutterPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--space-gutter)'
    document.body.append(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  })
}

async function consentBox(page: Page): Promise<Box | null> {
  const banner = page.getByRole('dialog', { name: /analytics consent/i })
  if ((await banner.count()) === 0 || !(await banner.isVisible())) return null
  return boxOf(banner, 'consent notice')
}

/**
 * Every piece of copy that lies outside the card it should be inside. The card is a shell around the copy with its
 * own padding, and the copy being inside the *hero* (the safe-area test) is a much weaker statement than the copy
 * being inside *the card*: text hanging out of its card reads as a fault and loses the surface that makes it legible.
 */
async function copyOutsideCard(page: Page): Promise<string[]> {
  const card = await boxOf(page.locator('.hj-hero-copy'), 'the copy card')
  const outside: string[] = []
  for (const { label, box } of await copyBoxes(page)) {
    const over = {
      left: card.x - box.x,
      top: card.y - box.y,
      right: box.x + box.width - (card.x + card.width),
      bottom: box.y + box.height - (card.y + card.height),
    }
    const worst = Object.entries(over).filter(([, v]) => v > 1)
    if (worst.length > 0) {
      outside.push(`${label} leaves the card by ${worst.map(([side, v]) => `${Math.round(v)}px on the ${side}`).join(', ')}`)
    }
  }
  return outside
}

// ── The matrix ───────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  test.describe(`Hero — ${viewport.label}`, () => {
    // Via `contextOptions` — in this Playwright version `reducedMotion` is not a top-level `use` option.
    // The site genuinely ships this path (every transition collapses under `prefers-reduced-motion`), so the
    // measurement is of something real, not of a test-only mode. The motion tests below leave it on too:
    // they ask what a person who asked for no motion is shown.
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test.beforeEach(async ({ page, context }) => {
      // The consent notice has its own tests below. Here it would cover the lower part of a phone's hero
      // and every measurement would be of the notice.
      await context.addInitScript(([key]) => {
        try { localStorage.setItem(key, 'denied') } catch { /* private mode: the notice shows, and the tests say so */ }
      }, [CONSENT_KEY])
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await expect(page.locator('main')).toBeVisible()
      await settleHero(page)
    })

    test('the photograph is the first screen, with nothing opaque between it and the visitor', async ({ page }) => {
      const heroBox = await boxOf(hero(page), 'hero')
      const photo = await boxOf(heroPhoto(page), 'hero photograph')
      const bar = await boxOf(header(page), 'header')

      expect(heroBox.y, 'the hero begins at the top of the page, under the fixed header').toBeCloseTo(0, 0)
      expect(photo.y, `the photograph begins ${Math.round(photo.y)}px down; it should begin at the top`).toBeCloseTo(0, 0)
      expect(photo.width, 'the photograph spans the viewport').toBeCloseTo(viewport.width, 0)
      const floor = px(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hj-hero-min')))
      expect(floor, '--hj-hero-min must resolve to a length on :root').toBeGreaterThan(0)
      const wanted = Math.min(viewport.height, floor)
      expect(
        photo.height,
        `the photograph is ${Math.round(photo.height)}px tall at ${viewport.width}×${viewport.height}; the first screen is at least ${wanted}px`
      ).toBeGreaterThanOrEqual(wanted * 0.98)

      // What is *painted* just under the header: the photograph, perhaps with a veil over it, never a panel.
      const verdict = await page.evaluate(
        ({ x, y }) => {
          const photo = document.querySelector('main > section img')
          const stack = document.elementsFromPoint(x, y)
          const at = photo ? stack.indexOf(photo) : -1
          if (at < 0) return { found: false, blockers: [] as string[] }
          const blockers = stack.slice(0, at).filter((el) => {
            const style = getComputedStyle(el)
            const m = style.backgroundColor.match(/rgba?\(([^)]+)\)/)
            const alpha = m ? (m[1].split(',')[3] === undefined ? 1 : Number.parseFloat(m[1].split(',')[3])) : 0
            // A veil is a gradient (a background image); a panel is a colour.
            return alpha > 0.05 && style.backgroundImage === 'none'
          })
          return { found: true, blockers: blockers.map((el) => el.className || el.tagName) }
        },
        { x: viewport.width / 2, y: bar.y + bar.height + 1 }
      )
      expect(verdict.found, 'the photograph is under the first row below the header').toBe(true)
      expect(verdict.blockers, 'nothing opaque sits between the visitor and the photograph there').toEqual([])
    })

    test('no copy overlaps other copy or the header', async ({ page }) => {
      const boxes = await copyBoxes(page)
      const bar = await boxOf(header(page), 'header')
      const problems: string[] = []

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const hit = intersection(boxes[i].box, boxes[j].box)
          if (hit) problems.push(`${boxes[i].label} overlaps ${boxes[j].label} by ${Math.round(hit.width)}×${Math.round(hit.height)}px`)
        }
        const underBar = intersection(boxes[i].box, bar)
        if (underBar) problems.push(`${boxes[i].label} is under the header by ${Math.round(underBar.height)}px`)
      }
      expect(problems, `Hero copy collides at ${viewport.width}px:\n  ${problems.join('\n  ')}`).toEqual([])
    })

    test('the copy stays inside the safe area', async ({ page }) => {
      const boxes = await copyBoxes(page)
      const bar = await boxOf(header(page), 'header')
      const heroBox = await boxOf(hero(page), 'hero')
      const gutter = await gutterPx(page)
      const problems: string[] = []

      for (const { label, box } of boxes) {
        if (box.x < gutter - 1) problems.push(`${label} starts ${Math.round(box.x)}px from the left; the gutter is ${Math.round(gutter)}px`)
        if (box.x + box.width > viewport.width - gutter + 1) {
          problems.push(`${label} ends at ${Math.round(box.x + box.width)}px; the right gutter begins at ${Math.round(viewport.width - gutter)}px`)
        }
        if (box.y < bar.y + bar.height - 0.5) problems.push(`${label} begins above the bottom of the header`)
        if (box.y + box.height > heroBox.y + heroBox.height + 0.5) problems.push(`${label} runs past the bottom of the hero`)
      }
      expect(problems, `Hero copy leaves its safe area at ${viewport.width}px:\n  ${problems.join('\n  ')}`).toEqual([])
    })

    test('a card holds all of the copy inside itself', async ({ page }) => {
      const narrow = await isNarrow(page)
      // Skipped with its reason, not silently passed: under an overlay there is no card to hold anything.
      test.skip(narrow || media.desktop.variant !== 'card', `no card at ${viewport.width}px: the copy lies on the photograph's veil`)
      const outside = await copyOutsideCard(page)
      expect(outside, `Copy leaves its card at ${viewport.width}px:\n  ${outside.join('\n  ')}`).toEqual([])
    })

    test('the header and the copy clear WCAG AA against the pixels behind them', async ({ page }) => {
      const verdicts: Verdict[] = []
      for (const { label, locator, kind } of await headerNodes(page)) {
        verdicts.push(await worstContrast(page, `header: ${label}`, locator, kind))
      }
      for (const { label, locator } of copyNodes(page)) {
        verdicts.push(await worstContrast(page, `copy: ${label}`, locator))
      }
      const failures = describeVerdicts(verdicts)
      expect(failures, `Unreadable at ${viewport.width}×${viewport.height}:\n  ${failures.join('\n  ')}`).toEqual([])
    })

    test('the same, with the photograph blocked: the dark fallback behind the veil carries the copy', async ({ page }) => {
      await page.route('**/_next/image**', (route) => route.abort())
      await page.reload()
      await expect(hero(page)).toBeVisible()
      await page.evaluate(async () => { await document.fonts.ready })
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))

      const verdicts: Verdict[] = []
      for (const { label, locator, kind } of await headerNodes(page)) {
        verdicts.push(await worstContrast(page, `header: ${label}`, locator, kind))
      }
      for (const { label, locator } of copyNodes(page)) {
        verdicts.push(await worstContrast(page, `copy: ${label}`, locator))
      }
      const failures = describeVerdicts(verdicts)
      expect(failures, `Unreadable with no photograph at ${viewport.width}px:\n  ${failures.join('\n  ')}`).toEqual([])
    })

    test('the subject stays in frame and clear of the copy, as the record says', async ({ page }) => {
      const narrow = await isNarrow(page)
      const crop = narrow ? media.mobile : media.desktop
      const photo = heroPhoto(page)
      const photoBox = await boxOf(photo, 'hero photograph')
      const style = await photo.evaluate((el) => {
        const s = getComputedStyle(el)
        const img = el as HTMLImageElement
        return { fit: s.objectFit, position: s.objectPosition, naturalW: img.naturalWidth, naturalH: img.naturalHeight }
      })

      expect(style.fit, 'the photograph covers its box').toBe('cover')
      // `next/image` serves a resized variant, so the decoded size is not the source's. The aspect ratio is.
      expect(style.naturalW / style.naturalH).toBeCloseTo(crop.width / crop.height, 1)

      // The record's focal point is what the browser applies: `object-position: <x*100>% <y*100>%`.
      const [fx, fy] = style.position.split(' ').map((v) => px(v) / 100)
      expect(fx, `object-position "${style.position}" must apply the record's focal point`).toBeCloseTo(crop.focal.x, 2)
      expect(fy).toBeCloseTo(crop.focal.y, 2)

      const visible = coverVisibleRect(
        { w: crop.width, h: crop.height },
        { w: photoBox.width, h: photoBox.height },
        { x: fx, y: fy }
      )
      const share = visibleFraction(crop.subject, visible)
      expect(
        share,
        `${Math.round(share * 100)}% of the subject is in frame at ${viewport.width}×${viewport.height}; it must be at least 90%`
      ).toBeGreaterThanOrEqual(0.9)

      // The subject's place on the page, from where the browser put the photograph.
      const toX = (n: number) => photoBox.x + ((n - visible.x0) / (visible.x1 - visible.x0)) * photoBox.width
      const toY = (n: number) => photoBox.y + ((n - visible.y0) / (visible.y1 - visible.y0)) * photoBox.height
      const subject: Box = {
        x: toX(crop.subject.x0),
        y: toY(crop.subject.y0),
        width: toX(crop.subject.x1) - toX(crop.subject.x0),
        height: toY(crop.subject.y1) - toY(crop.subject.y0),
      }

      const covers: Array<{ label: string; box: Box }> =
        crop.variant === 'card'
          ? [{ label: 'the copy card', box: await boxOf(page.locator('.hj-hero-copy'), 'the copy card') }]
          : await copyBoxes(page)
      const hits = covers
        .map(({ label, box }) => ({ label, hit: intersection(subject, box, OVERLAP_TOLERANCE_PX) }))
        .filter((c) => c.hit)
        .map((c) => `${c.label} covers ${Math.round(c.hit!.width)}×${Math.round(c.hit!.height)}px of the subject`)
      expect(hits, `The copy is on the subject at ${viewport.width}×${viewport.height}:\n  ${hits.join('\n  ')}`).toEqual([])
    })

    test('the hero carries the record\'s variants, and the header its tone', async ({ page }) => {
      // Both, not the active one: the server cannot know the viewport, and the stylesheet picks by breakpoint.
      await expect(hero(page), 'data-variant-wide').toHaveAttribute('data-variant-wide', media.desktop.variant)
      await expect(hero(page), 'data-variant-narrow').toHaveAttribute('data-variant-narrow', media.mobile.variant)
      // The tone is the bar's: it sets the bar's type and the bar's own veil, so it lives on the bar.
      await expect(header(page), 'data-tone').toHaveAttribute('data-tone', media.headerTone)
    })

    test('a card, where the record asks for one, never outgrows the photograph it sits on', async ({ page }) => {
      const narrow = await isNarrow(page)
      const crop = narrow ? media.mobile : media.desktop
      // Skipped with its reason, not silently passed: an overlay has no card to bound.
      test.skip(crop.variant !== 'card', `the record asks for an overlay at ${viewport.width}px: there is no card to bound`)

      // ADR 013: the protection that makes the copy legible is the very thing that would otherwise grow
      // until the photograph is a rim around a memo, with every other check satisfied better the larger it
      // got. So the card is also a fraction of the photograph's box, read from the token that enforces it.
      const card = page.locator('.hj-hero-copy').first()
      const declared = await card.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--hj-hero-card-max-ratio').trim()
      )
      const ceiling = Number.parseFloat(declared)
      expect(
        Number.isFinite(ceiling) && ceiling > 0 && ceiling < 1,
        `--hj-hero-card-max-ratio must resolve to a fraction in (0, 1) on the card; got ${JSON.stringify(declared)}`
      ).toBe(true)

      const cardBox = await boxOf(card, 'the copy card')
      const photoBox = await boxOf(heroPhoto(page), 'hero photograph')
      const widthRatio = cardBox.width / photoBox.width
      const overlap = intersection(cardBox, photoBox)
      const areaRatio = overlap ? (overlap.width * overlap.height) / (photoBox.width * photoBox.height) : 0
      const verdict = (what: string, measured: number) =>
        `The copy card ${what} ${(measured * 100).toFixed(1)}% of the photograph at ${viewport.width}px; the ceiling is ${(ceiling * 100).toFixed(0)}%.`
      expect(widthRatio, verdict('spans', widthRatio)).toBeLessThanOrEqual(ceiling)
      expect(areaRatio, verdict('covers', areaRatio)).toBeLessThanOrEqual(ceiling)
    })
  })
}

test.describe('Hero — the card containment check can fail', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('with the card cut short, the check finds the copy hanging out of it', async ({ page, context }) => {
    await context.addInitScript(([key]) => {
      try { localStorage.setItem(key, 'denied') } catch { /* see above */ }
    }, [CONSENT_KEY])
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await settleHero(page)
    test.skip(media.desktop.variant !== 'card', 'the wide crop is an overlay: there is no card to cut short')
    expect(await copyOutsideCard(page), 'the unmodified card holds its copy').toEqual([])
    await page.addStyleTag({ content: '.hj-hero-copy { max-height: 80px !important; overflow: visible !important; }' })
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    const outside = await copyOutsideCard(page)
    expect(outside.length, 'a card 80px tall cannot hold the headline, the sentence and both actions').toBeGreaterThan(0)
  })
})

// ── The header while the hero scrolls under it ───────────────────────────────

/**
 * The header is an overlay for as long as any of the hero is under it, not only at the top of the page.
 *
 * It was proven legible at scroll 0, where the photograph's sky is behind it. But the state flips to solid only
 * when the hero is almost entirely above the bar, so for a whole screen of scrolling the transparent bar lay over
 * whatever the hero holds at that height: on a phone, the hero's own copy and the veil under it. The first run of
 * the evidence matrix showed it (the "Explore the pieces" label printed through the brand mark at 320×568) and
 * the sampler would have, had it ever scrolled. So the bar carries its own surface (ADR 054), and this measures the
 * worst pixel behind each of its controls at the scroll positions where something different is under it.
 */
test.describe('Hero — the header while the hero scrolls under it', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  const SCROLLED = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]

  for (const viewport of SCROLLED) {
    test(`${viewport.width}×${viewport.height}: every control clears AA at every depth of the hero`, async ({ page, context }) => {
      await context.addInitScript(([key]) => {
        try { localStorage.setItem(key, 'denied') } catch { /* see above */ }
      }, [CONSENT_KEY])
      await page.setViewportSize(viewport)
      await page.goto('/')
      await settleHero(page)

      const heroBottom = await hero(page).evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)
      const depths = [0, 200, Math.max(0, heroBottom - viewport.height / 2), Math.max(0, heroBottom - 200), Math.max(0, heroBottom - 80)]
      const failures: string[] = []

      for (const depth of depths) {
        await page.evaluate((y) => window.scrollTo(0, y), depth)
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
        const state = await header(page).getAttribute('data-state')
        for (const { label, locator, kind } of await headerNodes(page)) {
          const verdict = await worstContrast(page, `scroll ${Math.round(depth)}px (${state}): ${label}`, locator, kind)
          if (!verdict.ok) failures.push(describeVerdicts([verdict])[0])
        }
      }
      expect(failures, `Unreadable header at ${viewport.width}×${viewport.height}:\n  ${failures.join('\n  ')}`).toEqual([])
    })
  }

  test('with the photograph blocked, mid-hero: the bar\'s own surface carries it', async ({ page, context }) => {
    await context.addInitScript(([key]) => {
      try { localStorage.setItem(key, 'denied') } catch { /* see above */ }
    }, [CONSENT_KEY])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/_next/image**', (route) => route.abort())
    await page.goto('/')
    await expect(hero(page)).toBeVisible()
    await page.evaluate(async () => { await document.fonts.ready })
    await page.evaluate(() => window.scrollTo(0, 450))
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    const failures: string[] = []
    for (const { label, locator, kind } of await headerNodes(page)) {
      const verdict = await worstContrast(page, `header: ${label}`, locator, kind)
      if (!verdict.ok) failures.push(describeVerdicts([verdict])[0])
    }
    expect(failures, `Unreadable header with no photograph, mid-hero:\n  ${failures.join('\n  ')}`).toEqual([])
  })
})

// ── What a visitor can bring with them ───────────────────────────────────────

test.describe('Hero — conditions a visitor brings', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(([key]) => {
      try { localStorage.setItem(key, 'denied') } catch { /* see above */ }
    }, [CONSENT_KEY])
  })

  test.describe('no motion preference', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test('the copy is never transparent, at any frame, for a visitor who asked for no motion', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      // Sampled every frame from before the page's own script runs: a check made once, after the page
      // settled, would pass a hero that hides its copy for 440ms and then reveals it.
      await page.addInitScript(() => {
        const w = window as unknown as { __minOpacity: number; __frames: number }
        w.__minOpacity = 1
        w.__frames = 0
        const start = performance.now()
        const tick = () => {
          const h1 = document.querySelector('main > section h1')
          const content = h1?.parentElement
          if (content) {
            w.__frames++
            for (const child of Array.from(content.children)) {
              const o = Number.parseFloat(getComputedStyle(child).opacity)
              if (o < w.__minOpacity) w.__minOpacity = o
            }
          }
          if (performance.now() - start < 1500) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.goto('/')
      await page.waitForTimeout(1600)
      const { min, frames } = await page.evaluate(() => {
        const w = window as unknown as { __minOpacity: number; __frames: number }
        return { min: w.__minOpacity, frames: w.__frames }
      })
      // A sampler that never saw the copy would report "never transparent" for a page that had no copy: the shape of
      // green that proves nothing. Ninety frames is a second and a half at 60Hz, minus the load.
      expect(frames, 'frames in which the hero copy existed and was sampled').toBeGreaterThan(20)
      expect(min, 'the lowest opacity any hero copy element had, at any frame').toBe(1)
    })
  })

  test.describe('no script', () => {
    test.use({ javaScriptEnabled: false })

    test('the copy and both actions are present and fully opaque with JavaScript off', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      for (const { label, locator } of copyNodes(page)) {
        await expect(locator, `${label} is in the served HTML`).toBeVisible()
        const opacity = await locator.evaluate((el) => {
          let o = 1
          for (let n: Element | null = el; n; n = n.parentElement) o *= Number.parseFloat(getComputedStyle(n).opacity)
          return o
        })
        // CSS animations run without script, so the copy may be mid-entrance for a moment; it is never
        // *waiting for* one. Allow it to land.
        await expect.poll(async () =>
          locator.evaluate((el) => {
            let o = 1
            for (let n: Element | null = el; n; n = n.parentElement) o *= Number.parseFloat(getComputedStyle(n).opacity)
            return o
          })
        , { message: `${label} must reach full opacity with JavaScript off (was ${opacity})` }).toBe(1)
      }
    })
  })

  test.describe('forced colours', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce', forcedColors: 'active' } })

    /**
     * What the copy is set on, in forced colours. The browser drops gradients and most backgrounds, so the veil
     * under the copy is gone and the photograph is directly behind it; the copy must bring an opaque surface of
     * its own. The search stops *below* the section: `.hj-hero` itself has an opaque ground (`--bg`) that is not
     * behind the copy at all, because the photograph is a sibling layer between them. The first version of this
     * test walked every ancestor up to the body, found that section, and could not fail.
     */
    const copySurface = (page: Page) =>
      page.evaluate(() => {
        const h1 = document.querySelector('main > section h1')
        const section = h1?.closest('section')
        if (!h1 || !section) throw new Error('no hero headline')
        const parse = (value: string) => {
          const m = value.match(/rgba?\(([^)]+)\)/)
          const parts = m ? m[1].split(',').map((x) => Number.parseFloat(x)) : [0, 0, 0, 0]
          return { alpha: parts[3] ?? 1, colour: `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})` }
        }
        let surface: Element | null = null
        for (let n: Element | null = h1; n && n !== section; n = n.parentElement) {
          if (parse(getComputedStyle(n).backgroundColor).alpha >= 0.99) { surface = n; break }
        }
        const copy = [
          h1,
          ...Array.from(section.querySelectorAll('.label-eyebrow, p, a')),
        ]
        return {
          surface: surface ? { colour: parse(getComputedStyle(surface).backgroundColor).colour, name: String(surface.className) } : null,
          text: getComputedStyle(h1).color,
          everyNodeInside: surface ? copy.every((node) => surface!.contains(node)) : false,
          sectionAlpha: parse(getComputedStyle(section).backgroundColor).alpha,
        }
      })

    test('the copy sits on an opaque surface of its own when the browser drops gradients and backgrounds', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await settleHero(page)
      const found = await copySurface(page)
      expect(found.surface, 'an opaque ancestor of the headline, inside the section').not.toBeNull()
      expect(found.everyNodeInside, 'the headline, eyebrow, sentence and both actions are all on that surface').toBe(true)
      const ratio = contrastRatioFromLuminance(
        relativeLuminance(parseCssColor(found.text)),
        relativeLuminance(parseCssColor(found.surface!.colour))
      )
      expect(ratio, `${found.text} on ${found.surface!.colour} (the system's own pair)`).toBeGreaterThanOrEqual(4.5)
    })

    test('the check above can fail: with the copy\'s own surface removed it finds none, though the section is opaque', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await settleHero(page)
      await page.addStyleTag({
        content: '@media (forced-colors: active) { .hj-hero-content, .hj-hero-copy { background-color: transparent !important; } }',
      })
      // Two frames: the style change is a change of computed value, and a computed value read in the frame it was
      // made can still be the old one when anything on the element transitions.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
      const found = await copySurface(page)
      // The section's own ground is opaque: that is exactly what let the first version of the test pass for ever.
      expect(found.sectionAlpha, 'the section has an opaque ground that is not behind the copy').toBeGreaterThanOrEqual(0.99)
      expect(found.surface, 'no surface of the copy\'s own once the rule is neutralised').toBeNull()
    })
  })

  test.describe('large text', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    // The narrowest phone, where the copy is longest, and the common one, where the hero's min-height and the veil's
    // fade are what grow or fail to.
    for (const phone of [
      { width: 320, height: 568, name: 'the narrowest phone' },
      { width: 390, height: 844, name: 'a common phone' },
    ]) {
      test(`at 200% text the copy neither overflows nor collides, on ${phone.name}`, async ({ page }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height })
        await page.goto('/')
        await settleHero(page)
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

        const boxes = await copyBoxes(page)
        const bar = await boxOf(header(page), 'header')
        const heroBox = await boxOf(hero(page), 'hero')
        const problems: string[] = []
        for (let i = 0; i < boxes.length; i++) {
          const { label, box } = boxes[i]
          if (box.x < -0.5 || box.x + box.width > phone.width + 0.5) problems.push(`${label} is cut by the viewport edge`)
          if (box.y + box.height > heroBox.y + heroBox.height + 0.5) problems.push(`${label} is cut off by the hero's bottom`)
          if (intersection(box, bar)) problems.push(`${label} is under the header`)
          for (let j = i + 1; j < boxes.length; j++) {
            if (intersection(box, boxes[j].box)) problems.push(`${label} overlaps ${boxes[j].label}`)
          }
        }
        expect(problems, `At 200% text at ${phone.width}px:\n  ${problems.join('\n  ')}`).toEqual([])
      })
    }
  })
})

// ── With the consent notice up ───────────────────────────────────────────────

test.describe('Hero — with the consent notice up', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  for (const viewport of VIEWPORTS) {
    test(`${viewport.label}: the notice never hides the actions, or the visitor can reach them`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      const notice = page.getByRole('dialog', { name: /analytics consent/i })
      await expect(notice).toBeVisible()
      await settleHero(page)
      // The notice publishes its height and the hero's copy rides above it: give that one frame to land.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

      const bannerBox = (await consentBox(page)) as Box
      const boxes = await copyBoxes(page)
      const bar = await boxOf(header(page), 'header')
      const lowest = Math.max(...boxes.map((b) => b.box.y + b.box.height))
      const copyTop = Math.min(...boxes.map((b) => b.box.y))
      const heroBox = await boxOf(hero(page), 'hero')
      // However short the phone, the hero grows to hold its copy with the notice up; it never cuts it, and the copy
      // never rides up under the header. (The rest of this test is about the notice, which can still cover what
      // the hero has not the height to lift clear of it.)
      expect(lowest, `the hero is ${Math.round(heroBox.height)}px tall and its copy runs to ${Math.round(lowest - heroBox.y)}px`).toBeLessThanOrEqual(heroBox.y + heroBox.height + 0.5)
      expect(copyTop, 'the copy begins below the header').toBeGreaterThanOrEqual(bar.y + bar.height - 0.5)
      // Does the hero's copy fit *above* the notice at all? On a 320×568 phone it cannot: the header, the
      // copy and a 260px notice do not share 568px. There the requirement is different, and honest: the
      // actions must be reachable, and a focused one must not be hidden by the notice (WCAG 2.4.11).
      const fits = lowest <= bannerBox.y + 0.5 && copyTop >= bar.y + bar.height - 0.5
      const covered = boxes.filter(({ box }) => intersection(box, bannerBox))

      if (fits) {
        expect(
          covered.map((c) => c.label),
          `the notice covers ${covered.map((c) => c.label).join(', ')} at ${viewport.width}×${viewport.height}, where the copy fits above it`
        ).toEqual([])
        return
      }

      // Does not fit: a focused action must not be hidden by the notice. WCAG 2.4.11 asks that it not be *entirely*
      // hidden; the stricter and more useful reading here is that the point a thumb or a click lands on, its
      // centre, is not under the notice.
      for (const action of ['primary action', 'secondary action']) {
        const target = copyNodes(page).find((n) => n.label === action)!.locator
        await target.focus()
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
        const after = await boxOf(target, action)
        const cx = after.x + after.width / 2
        const cy = after.y + after.height / 2
        const centreUnderNotice =
          cx >= bannerBox.x && cx <= bannerBox.x + bannerBox.width && cy >= bannerBox.y && cy <= bannerBox.y + bannerBox.height
        expect(
          centreUnderNotice,
          `the focused ${action} has its centre (${Math.round(cx)}, ${Math.round(cy)}) under the consent notice at ${viewport.width}×${viewport.height}`
        ).toBe(false)
      }
    })
  }
})

// ── The focus ring on a veil ─────────────────────────────────────────────────

test.describe('Hero — the focus ring where the copy lies on the photograph', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('the ring is drawn in a colour that can be seen against what surrounds the action', async ({ page, context }) => {
    await context.addInitScript(([key]) => {
      try { localStorage.setItem(key, 'denied') } catch { /* see above */ }
    }, [CONSENT_KEY])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await settleHero(page)
    // The phone crop is an overlay by schema (mobile.variant), so the ring here always lies on the photograph's veil.

    const action = copyNodes(page).find((n) => n.label === 'primary action')!.locator
    await page.keyboard.press('Tab')
    for (let i = 0; i < 12; i++) {
      if (await action.evaluate((el) => el === document.activeElement)) break
      await page.keyboard.press('Tab')
    }
    await expect(action).toBeFocused()

    const ring = await action.evaluate((el) => {
      const s = getComputedStyle(el)
      return { color: s.outlineColor, width: Number.parseFloat(s.outlineWidth), style: s.outlineStyle, offset: Number.parseFloat(s.outlineOffset) }
    })
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBeGreaterThanOrEqual(2)

    // What surrounds the action, with the copy hidden: the band the ring is drawn on.
    const target = await boxOf(action, 'primary action')
    const heroEl = hero(page)
    const heroBox = await boxOf(heroEl, 'hero')
    const twoFrames = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    await page.locator('.hj-hero-copy').evaluate((el) => { (el as HTMLElement).style.visibility = 'hidden' })
    // The repaint must land before the capture, or the screenshot still has the ring in it and the ring is
    // measured against itself (1.00:1).
    await twoFrames()
    const png = PNG.sync.read(await heroEl.screenshot())
    await page.locator('.hj-hero-copy').evaluate((el) => { (el as HTMLElement).style.visibility = '' })
    await twoFrames()

    const dpr = png.width / heroBox.width
    const reach = ring.width + Math.max(0, ring.offset) + 1
    const x0 = Math.floor((target.x - reach - heroBox.x) * dpr)
    const x1 = Math.ceil((target.x + target.width + reach - heroBox.x) * dpr)
    const y0 = Math.floor((target.y - reach - heroBox.y) * dpr)
    const y1 = Math.ceil((target.y + target.height + reach - heroBox.y) * dpr)
    const inner = {
      x0: Math.ceil((target.x - heroBox.x) * dpr), x1: Math.floor((target.x + target.width - heroBox.x) * dpr),
      y0: Math.ceil((target.y - heroBox.y) * dpr), y1: Math.floor((target.y + target.height - heroBox.y) * dpr),
    }
    const ringLuminance = relativeLuminance(parseCssColor(ring.color))
    let worst = Number.POSITIVE_INFINITY
    for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y += 2) {
      for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x += 2) {
        if (x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) continue // the action's own face
        const i = (png.width * y + x) << 2
        const ratio = contrastRatioFromLuminance(ringLuminance, relativeLuminance({ r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] }))
        if (ratio < worst) worst = ratio
      }
    }
    expect(worst, `the focus ring (${ring.color}) is ${worst.toFixed(2)}:1 against what surrounds the action; WCAG 1.4.11 needs 3:1`).toBeGreaterThanOrEqual(3)
  })
})
