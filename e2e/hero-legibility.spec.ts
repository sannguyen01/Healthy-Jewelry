import { test, expect, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import {
  contrastRatioFromLuminance,
  parseCssColor,
  relativeLuminance,
  requiredContrast,
  type Rgb,
} from '../src/lib/utils/contrast'

/**
 * Hero legibility across viewport widths.
 *
 * `visual-assets.spec.ts` proves the hero photograph *renders*. It passed on a
 * homepage where the mobile hero showed only a rock wall with the body copy
 * lying on top of it, unreadable — because "the image is present, sized, and
 * opaque" says nothing about whether the words over it can be read.
 *
 * axe does not close this gap either: its `color-contrast` rule returns
 * *incomplete*, not *violation*, when the backdrop is an image, precisely
 * because it cannot know what the pixels are. So this measures them.
 *
 * Independent checks, because they fail in different ways:
 *
 *   1. Geometry — hero copy must not sit on the photograph at all. Cheap,
 *      deterministic, and it encodes the actual design rule.
 *   2. Rendered contrast — for every hero text node, screenshot the true
 *      backdrop and assert the worst pixel behind it still clears WCAG AA. This
 *      is what catches pale text on a pale patch of an otherwise dark photo,
 *      which crosses no boundary and so passes every geometric check.
 *   3. A bound on the protection itself — the card that makes 1 and 2 pass is
 *      sized by its own content, and both of those checks are satisfied *better*
 *      the larger it gets. Left alone they license the card growing until the
 *      photograph is decoration behind a floating memo, with every test green
 *      the whole way. So the card is also capped as a fraction of the
 *      photograph's rendered box.
 *   4. Framing — how much of the source image survives object-fit cropping,
 *      which is a different question from how much of it a reader can see.
 */

/**
 * Widths worth defending: small Android, iPhone, large phone, tablet portrait,
 * small laptop, desktop. The hero's split layout is only correct above ~866px,
 * so the matrix has to straddle that rather than test two arbitrary devices.
 */
const VIEWPORTS = [
  { label: '360px — small Android', width: 360, height: 800 },
  { label: '390px — iPhone', width: 390, height: 844 },
  { label: '414px — large phone', width: 414, height: 896 },
  { label: '768px — tablet portrait', width: 768, height: 1024 },
  // The narrowest width that still gets the split layout, and so the width at
  // which the copy card is largest relative to the photograph behind it. The
  // matrix previously jumped 768 -> 1024 with nothing in between, which meant
  // the worst case for every split-layout invariant was never measured.
  { label: '901px — split-layout floor', width: 901, height: 900 },
  { label: '1024px — small laptop', width: 1024, height: 768 },
  { label: '1440px — desktop', width: 1440, height: 900 },
]

/** Overlap smaller than this is a sub-pixel rounding artefact, not a defect. */
const OVERLAP_TOLERANCE_PX = 2

/** Device pixels trimmed from each edge of a sampled region — see sampleBackdrop. */
const SAMPLE_INSET_PX = 4

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right - x <= OVERLAP_TOLERANCE_PX || bottom - y <= OVERLAP_TOLERANCE_PX) return null
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * The text nodes the hero's message depends on. Targeted by content rather than
 * by a test id so the check keeps working if the markup is restructured — and
 * so a failure names the copy a visitor could not read.
 */
async function heroTextNodes(page: Page): Promise<Array<{ label: string; locator: Locator }>> {
  const hero = page.locator('section').first()
  return [
    { label: 'eyebrow', locator: hero.getByText(/implant-grade titanium/i) },
    { label: 'headline', locator: hero.getByRole('heading', { level: 1 }) },
    { label: 'body copy', locator: hero.getByText(/no stones\. no fillers/i) },
    { label: 'Shop Collection CTA', locator: hero.getByRole('link', { name: /shop collection/i }) },
    { label: 'Our Story CTA', locator: hero.getByRole('link', { name: /our story/i }) },
  ]
}

/** The hero photograph's rendered box. */
function heroPhoto(page: Page): Locator {
  return page.locator('section').first().locator('img').first()
}

/**
 * Captures what is actually behind a text node.
 *
 * Only the *glyphs* are removed — `color: transparent` on the node itself —
 * rather than hiding the element or its column. That distinction matters: a CTA
 * supplies its own opaque background, so hiding the whole element would sample
 * the page behind the button and report a false failure for light-on-dark button
 * copy. Making the letters transparent leaves backgrounds, borders and the
 * photograph exactly as composited, so the capture is precisely "everything the
 * reader sees except the words".
 */
async function sampleBackdrop(page: Page, locator: Locator): Promise<Rgb[]> {
  const setGlyphsTransparent = (transparent: boolean) =>
    locator.evaluate((el, isTransparent) => {
      const node = el as HTMLElement
      node.style.color = isTransparent ? 'transparent' : ''
      node.style.textShadow = isTransparent ? 'none' : ''
    }, transparent)

  await setGlyphsTransparent(true)
  // Guarantee the style change has been painted before capturing. Without this
  // the screenshot can race the repaint, sample the glyphs themselves, and
  // report a perfect 1.00:1 "failure" that is really a harness artefact.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  // Element screenshot, not `page.screenshot({ clip })`. Under mobile emulation
  // the two disagree: `boundingBox()` reports layout-viewport CSS pixels while
  // the clip is resolved against the visual viewport, so at a fractional device
  // pixel ratio (2.625 on a Pixel 7) the captured region drifts off the element
  // entirely — sampling the photograph below a button and reporting it as the
  // button's backdrop. Letting Playwright resolve the element removes the whole
  // class of coordinate error.
  const buffer = await locator.screenshot()
  await setGlyphsTransparent(false)

  const png = PNG.sync.read(buffer)
  // Trim the outermost device pixels: a fractional border box leaves an
  // anti-aliased rim of whatever sits just outside the element, and for a CTA
  // with its own dark fill that rim is page background — the exact colour of
  // the button's label, which would read as a perfect 1.00:1 failure.
  const inset = Math.min(SAMPLE_INSET_PX, Math.floor(Math.min(png.width, png.height) / 4))
  const pixels: Rgb[] = []
  // Every 3rd pixel in each axis: ~9x fewer samples, and a contrast failure over
  // a photograph is never a single isolated pixel.
  for (let y = inset; y < png.height - inset; y += 3) {
    for (let x = inset; x < png.width - inset; x += 3) {
      const index = (png.width * y + x) << 2
      pixels.push({ r: png.data[index], g: png.data[index + 1], b: png.data[index + 2] })
    }
  }
  return pixels
}

for (const viewport of VIEWPORTS) {
  test.describe(`Hero legibility — ${viewport.label}`, () => {
    // The hero fades and translates its children in on a stagger. Measuring
    // against a moving target is the difference between reading the button and
    // reading the page behind where the button used to be, so the animation is
    // collapsed rather than waited out. `globals.css` already honours
    // `prefers-reduced-motion` by reducing every transition to 0.01ms, so this
    // exercises a code path the site genuinely ships instead of inventing a
    // test-only one.
    // Via `contextOptions` — in this Playwright version `reducedMotion` is not
    // a top-level `use` option.
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await expect(page.locator('main')).toBeVisible()
      await expect(heroPhoto(page)).toBeVisible()
      // The hero staggers its children in with a JS transition, and each one
      // settles at a different time. Waiting only for the headline is not
      // enough: the CTA row is still translating when the headline lands, so a
      // clip taken from its bounding box lands where the button *was* and
      // samples the page behind it — which is void-white, exactly the colour of
      // the button's label, and reports a perfect 1.00:1 that is pure artefact.
      // Wait for every child to reach full opacity and its final position.
      //
      // Checking opacity alone is not enough either, and subtly so: the effect
      // applies its starting values *after* mount, so a check that runs first
      // sees untouched children — opacity 1, no transform — and reports settled
      // before the animation has begun. The inline `transition` the effect
      // writes is the proof it has run, so it is part of the condition.
      await page.waitForFunction(() => {
        const content = document.querySelector('.hj-hero-content')
        if (!content) return false
        return Array.from(content.children).every((child) => {
          const element = child as HTMLElement
          if (!element.style.transition) return false
          const style = getComputedStyle(element)
          const settled =
            style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)'
          return style.opacity === '1' && settled
        })
      })
    })

    test('no hero copy strays past the backdrop that protects it', async ({ page }) => {
      // Two layouts, one invariant: copy must sit on something opaque.
      //
      // Stacked (narrow): the photo is in normal flow below the text, so the
      // requirement is simply that nothing overlaps it.
      //
      // Split (wide): the photo is `inset: 0` and spans the whole section, so
      // geometric overlap with the <img> is by design and means nothing. What
      // matters is whether the text sits fully inside the scrim's own box —
      // the card is fully opaque and sized to wrap its content (see Hero.tsx),
      // so there is no fade region to account for; full containment is the
      // whole check.
      //
      // Mode is read from the scrim's *computed background*, not DOM
      // visibility. `.hj-hero-scrim` is unconditionally rendered at every
      // width — the <=900px media query only changes its background/padding/
      // margin via `!important`, it never sets `display: none` — so
      // `isVisible()` is true at every viewport and can't tell the two modes
      // apart. Background is the actual signal the CSS uses to say "I'm
      // protecting something here" vs. "there's nothing behind me to protect
      // against."
      const scrim = page.locator('.hj-hero-scrim')
      const scrimBackground = await scrim
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      const scrimOpaque =
        scrimBackground !== 'rgba(0, 0, 0, 0)' && scrimBackground !== 'transparent'

      const offenders: string[] = []

      if (!scrimOpaque) {
        const photoBox = await heroPhoto(page).boundingBox()
        expect(photoBox).not.toBeNull()
        for (const { label, locator } of await heroTextNodes(page)) {
          const box = await locator.boundingBox()
          if (!box) continue
          const overlap = intersection(box, photoBox as Box)
          if (overlap) {
            offenders.push(
              `${label}: ${Math.round(overlap.width)}x${Math.round(overlap.height)}px over the photo`
            )
          }
        }
      } else {
        const scrimBox = await scrim.first().boundingBox()
        expect(scrimBox).not.toBeNull()
        const scrimRight = (scrimBox as Box).x + (scrimBox as Box).width

        for (const { label, locator } of await heroTextNodes(page)) {
          const box = await locator.boundingBox()
          if (!box) continue
          const overhang = box.x + box.width - scrimRight
          if (overhang > OVERLAP_TOLERANCE_PX) {
            offenders.push(
              `${label}: extends ${Math.round(overhang)}px past the opaque scrim (ends at ${Math.round(scrimRight)}px)`
            )
          }
        }
      }

      expect(
        offenders,
        `Hero copy left unprotected at ${viewport.width}px:\n  ${offenders.join('\n  ')}`
      ).toEqual([])
    })

    test('the copy card never outgrows the photograph it sits on', async ({ page }) => {
      // The check above and this one pull in opposite directions, which is the
      // point. "Is the copy protected?" is satisfied better by every increase in
      // the card's size, so on its own it licenses the card growing until the
      // photograph is a rim around a memo — and nothing else here objects. The
      // "usable portion of the frame" test below measures how much of the source
      // survives object-fit cropping, not how much of it a reader can still see;
      // a card covering 95% of a perfectly framed photo scores 100% there.
      //
      // So this is the counter-pressure: the card is bounded as a fraction of
      // the photograph's own rendered box. Self-relative because an absolute
      // pixel cap cannot mean the same thing across a 3x width range — the
      // 848px cap this replaced was a third of a 2560px photo and 94% of a
      // 901px one. See docs/adr/013-a-protection-that-can-only-grow.md.
      //
      // What this adds over the CSS that already enforces it, since a test that
      // only re-measures its own `max-width` would be decoration. Three things,
      // and the width ratio is the least of them:
      //   - the token going missing. `max-width: calc(var(--missing) * 100%)`
      //     is invalid at computed-value time, so the property falls back to
      //     its initial value: measured, computed `max-width` becomes `none`
      //     and the card is unbounded again. And because the cap is not binding
      //     today (463px of an allowed 540px at 901px), the card's rendered
      //     width does not change by a pixel at the moment the guardrail
      //     evaporates — there is no visible symptom for anyone to notice. The
      //     parse assertion below is the only thing that would.
      //   - height. `max-width` says nothing about it, so a card that stays
      //     narrow and grows downward is unconstrained by CSS entirely; only
      //     the area ratio sees it.
      //   - the enforcement being replaced. A future absolute-positioned,
      //     fixed-width or inline-overridden card would still be measured here.
      const scrim = page.locator('.hj-hero-scrim').first()

      // Same discriminator as the test above, for the same reason: `.hj-hero-scrim`
      // is rendered at every width, so only its computed background says which
      // layout is in play.
      const scrimBackground = await scrim.evaluate((el) => getComputedStyle(el).backgroundColor)
      const scrimOpaque =
        scrimBackground !== 'rgba(0, 0, 0, 0)' && scrimBackground !== 'transparent'
      // Skipped, not silently passed: in the stacked layout the photograph is a
      // band in normal flow below the copy, so the card overlaps none of it and
      // the ratio has nothing to measure. A skip says that in the report; an
      // early `return` would look like a passing assertion that never ran.
      test.skip(
        !scrimOpaque,
        `stacked layout at ${viewport.width}px — the card sits beside the photograph, not on it`
      )

      // Read the ceiling from the token that also enforces it, so the test and
      // the CSS cannot drift apart. The failure this guards against is specific
      // and has happened here: an earlier version of this file read
      // `--hj-hero-fade`, which had been deleted along with the gradient model,
      // got NaN, fell back to 0, and kept passing. Hence the assertion before
      // the use — a missing token has to fail this test, never disable it.
      const declared = await scrim.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--hj-hero-card-max-ratio').trim()
      )
      const ceiling = Number.parseFloat(declared)
      expect(
        Number.isFinite(ceiling) && ceiling > 0 && ceiling < 1,
        `--hj-hero-card-max-ratio must resolve to a fraction in (0, 1) on .hj-hero-scrim; got ` +
          `${JSON.stringify(declared)}. Define it in src/app/globals.css — this test measures the ` +
          `card against that token and has no default to fall back to.`
      ).toBe(true)

      const cardBox = await scrim.boundingBox()
      const photoBox = await heroPhoto(page).boundingBox()
      expect(cardBox).not.toBeNull()
      expect(photoBox).not.toBeNull()
      const card = cardBox as Box
      const photo = photoBox as Box

      const widthRatio = card.width / photo.width
      // Area as well as width, because they fail differently. Width is the half
      // CSS can enforce via max-width; area is the honest answer to "how much
      // picture is left", and it is the only one that would catch a card that
      // stays narrow but grows to the full height of the section. The
      // containment check above cannot see that either — it compares one edge.
      const overlap = intersection(card, photo)
      const areaRatio = overlap
        ? (overlap.width * overlap.height) / (photo.width * photo.height)
        : 0

      const verdict = (what: string, measured: number) =>
        `Hero copy card ${what} ${(measured * 100).toFixed(1)}% of the photograph at ` +
        `${viewport.width}px — ceiling is ${(ceiling * 100).toFixed(0)}% ` +
        `(${((ceiling - measured) * 100).toFixed(1)} points of headroom left). The card is sized ` +
        `by its widest child, so this usually means the headline, the type scale, or the loaded ` +
        `face grew. Either shorten the copy or make the larger card a deliberate, reviewed change ` +
        `to --hj-hero-card-max-ratio in src/app/globals.css.`

      expect(widthRatio, verdict('spans', widthRatio)).toBeLessThanOrEqual(ceiling)
      expect(areaRatio, verdict('covers', areaRatio)).toBeLessThanOrEqual(ceiling)
    })

    test('every hero text node clears WCAG AA against what is actually behind it', async ({
      page,
    }) => {
      const failures: string[] = []

      for (const { label, locator } of await heroTextNodes(page)) {
        const box = await locator.boundingBox()
        if (!box) continue

        const { color, fontSize, fontWeight } = await locator.evaluate((el) => {
          const style = getComputedStyle(el)
          return {
            color: style.color,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
          }
        })

        const pixels = await sampleBackdrop(page, locator)
        const textLuminance = relativeLuminance(parseCssColor(color))
        let worst = Number.POSITIVE_INFINITY
        for (const pixel of pixels) {
          const ratio = contrastRatioFromLuminance(textLuminance, relativeLuminance(pixel))
          if (ratio < worst) worst = ratio
        }

        const minimum = requiredContrast(fontSize, fontWeight)
        if (worst < minimum) {
          failures.push(
            `${label} (${color}, ${fontSize}px/${fontWeight}) — worst ${worst.toFixed(2)}:1, needs ${minimum}:1`
          )
        }
      }

      expect(
        failures,
        `Hero copy unreadable against its backdrop at ${viewport.width}px:\n  ${failures.join('\n  ')}`
      ).toEqual([])
    })

    test('the hero photograph shows a usable portion of the frame', async ({ page }) => {
      // The mobile bug cropped a 1.79 landscape source down to its rightmost
      // 26% — the subject was gone and only background rock remained. Cropping
      // is fine; discarding most of the frame is not.
      const visibleFraction = await heroPhoto(page).evaluate((el) => {
        const img = el as HTMLImageElement
        const box = img.getBoundingClientRect()
        if (!img.naturalWidth || !img.naturalHeight || !box.width || !box.height) return 0
        const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
        const renderedWidth = img.naturalWidth * scale
        const renderedHeight = img.naturalHeight * scale
        return (
          (Math.min(box.width, renderedWidth) / renderedWidth) *
          (Math.min(box.height, renderedHeight) / renderedHeight)
        )
      })

      expect(
        Number((visibleFraction * 100).toFixed(1)),
        `Only ${(visibleFraction * 100).toFixed(1)}% of the hero image is in frame at ${viewport.width}px`
      ).toBeGreaterThanOrEqual(50)
    })
  })
}
