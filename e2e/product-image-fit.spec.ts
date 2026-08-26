import { test, expect, type Page } from '@playwright/test'
import { intersection, settle, OVERHANG_TOLERANCE_PX } from './support/viewportFit'

/**
 * The product detail page's image tile, measured rather than eyeballed.
 *
 * ## Why this is not in `visual-assets.spec.ts`
 *
 * That spec asks whether imagery is *there* — bytes arrive, the box is non-zero, the
 * effective opacity clears a legibility floor. This one asks whether it is the right
 * size and in the right place, which is a different question with a different failure
 * mode, and its `SURFACES` array is keyed by surface where this matrix is keyed by the
 * mark's own proportions.
 *
 * ## The two defects this pins
 *
 * **The tile did not fit.** `min-height: 480px` together with `aspect-ratio: 1 / 1` is
 * not a floor plus a ratio: the min-height set the height and the ratio derived the
 * width from it, so the tile rendered 480x480 at every width and hung 184px past a
 * 320px viewport. Nothing caught it, because `globals.css` sets `overflow-x: hidden`
 * on html and body — the same blindness ADR 016 documents for the header, where
 * `scrollWidth` equalled `innerWidth` at every width while a control hung 114px past
 * the edge. Containment therefore has to be measured geometrically, which is what
 * `viewportFit.ts` exists for.
 *
 * **And `svgScale` did not measure what its name claimed.** It sizes the `<svg>`
 * element; `preserveAspectRatio` then fit a differently-padded coordinate space inside
 * that element. One `svgScale="70%"` produced a 7x spread in optical weight — 33.4% of
 * the tile for `ring-arc` against 4.8% for `earring-stud`. Tightening every viewBox to
 * its own artwork (src/lib/svg/viewbox.ts) is what collapsed that.
 *
 * ## Why ink, not the element box
 *
 * `getBoundingClientRect()` on an `<svg>` returns the element, which is `70% x 70%` for
 * every product and so reports a flat 49% fill whatever is drawn inside it. That number
 * is what let the spread hide. These probes measure the union of the drawn geometry,
 * stroke included, which is the only thing a customer can see.
 */

/**
 * One product per distinct viewBox ratio, covering all five that shipped. Fewer than
 * five and the spread assertion below is measuring a subset of the problem.
 *
 * Every handle resolves through the static fallback catalogue (`src/lib/data/hj-data.ts`),
 * which is what the suite serves: `placeholder.myshopify.com` cannot be fetched, so
 * `isShopifyConfigured()` is false and every product renders the illustration branch.
 */
const REPRESENTATIVES = [
  { handle: 'arc-band-titanium', svgType: 'ring-arc', ratio: '1:1' },
  { handle: 'orbit-pendant-titanium', svgType: 'necklace-disc', ratio: '4:5' },
  { handle: 'drop-pendant-surgical-steel', svgType: 'necklace-drop', ratio: '8:11' },
  { handle: 'disc-studs-titanium', svgType: 'earring-stud', ratio: '1:2' },
  { handle: 'tube-drops-surgical-steel', svgType: 'earring-drop', ratio: '2:5' },
] as const

/** 320 is the narrowest supported phone; 768 is `.hj-detail-grid`'s breakpoint, where
 *  the column — and so the tile — is at its narrowest; 1280 is where the cap binds. */
const WIDTHS = [320, 390, 768, 1280] as const

/**
 * Bounds on how much of the tile a mark's longer edge may cover.
 *
 * Both sides are asserted, per ADR 013: a floor alone is satisfied better the larger
 * the mark grows, and a ceiling alone permits a speck. `svgScale` is 70% and the
 * viewBoxes carry a 2% margin, so the design target is ~0.673.
 *
 * Measured on the build before this change: `ring-arc` 0.692, `earring-stud` 0.324.
 * The floor is what that 0.324 fails.
 */
const MIN_MARK_EXTENT = 0.6
const MAX_MARK_EXTENT = 0.75

/** How far the largest mark may out-read the smallest. Was 2.13 before this change. */
const MAX_EXTENT_SPREAD = 1.15

/**
 * How far down the page the buy control may sit at 390x844.
 *
 * Measured on the ring — the worst case, because rings carry a size picker. Before this
 * change: 1054px. After: 992px. The bound guards the geometry regression rather than
 * expressing a target, so if page copy legitimately grows past it, raise it deliberately
 * and say why; do not raise it to make a red test green.
 */
const MAX_ADD_TO_BAG_Y = 1020

interface Measurement {
  tile: { x: number; y: number; width: number; height: number }
  ink: { x: number; y: number; width: number; height: number }
  viewBox: string | null
  svgType: string | null
  tileMaxToken: string
  innerWidth: number
}

/**
 * Measure the tile and the ink drawn inside it.
 *
 * Throws rather than returning null when it finds nothing, following
 * `offendersPastViewport`'s rule: a probe that quietly reports "no problem" because it
 * could not find what it was measuring is the failure mode `hero-legibility.spec.ts`
 * hit when it read a deleted custom property, got NaN, and kept passing.
 */
async function measure(page: Page, handle: string): Promise<Measurement> {
  const result = await page.evaluate(() => {
    const tile = document.querySelector('.hj-product-tile')
    if (!tile) return { error: 'no .hj-product-tile on the page' as const }
    const svg = tile.querySelector('svg')
    if (!svg) return { error: 'no <svg> inside .hj-product-tile' as const }

    // Union of every drawn child, stroke included. getBBox() is geometry only, so the
    // stroke — which is most of what these line illustrations are — has to be added
    // back or a 13px-wide ring band reads as 13px of nothing.
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const drawn = svg.querySelectorAll('circle, ellipse, rect, path, line, polygon, polyline')
    for (const el of drawn) {
      const box = (el as SVGGraphicsElement).getBBox()
      if (box.width === 0 && box.height === 0) continue
      const style = getComputedStyle(el)
      const half = style.stroke === 'none' ? 0 : (parseFloat(style.strokeWidth) || 0) / 2
      x0 = Math.min(x0, box.x - half)
      y0 = Math.min(y0, box.y - half)
      x1 = Math.max(x1, box.x + box.width + half)
      y1 = Math.max(y1, box.y + box.height + half)
    }
    if (!Number.isFinite(x0)) return { error: 'the <svg> drew no geometry' as const }

    // User units -> screen, via the matrix the browser actually used.
    const ctm = svg.getScreenCTM()
    if (ctm === null) return { error: 'the <svg> has no screen CTM (not rendered?)' as const }
    const corner = (ux: number, uy: number) => {
      const p = svg.createSVGPoint()
      p.x = ux
      p.y = uy
      return p.matrixTransform(ctm)
    }
    const topLeft = corner(x0, y0)
    const bottomRight = corner(x1, y1)
    const t = tile.getBoundingClientRect()

    return {
      tile: { x: t.x, y: t.y, width: t.width, height: t.height },
      ink: {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      },
      viewBox: svg.getAttribute('viewBox'),
      svgType: svg.getAttribute('data-svg-type'),
      // Read from computed style so deleting the token fails here loudly rather than
      // silently uncapping the tile.
      tileMaxToken: getComputedStyle(tile).getPropertyValue('--hj-product-tile-max').trim(),
      innerWidth: window.innerWidth,
    }
  })

  if ('error' in result) {
    throw new Error(
      `/products/${handle}: ${result.error}. This probe has no default — a tile it ` +
        'cannot find must fail, never report that the geometry is fine.'
    )
  }
  return result
}

/**
 * Navigate, then wait for the layout to stop moving before measuring.
 *
 * `settle()`'s double-rAF is not enough on its own here. These pages load two webfonts,
 * and the tile's height comes from `aspect-ratio` against a column that is still
 * settling — so a probe can catch a frame where the tile has a box but not its final
 * one and report a ratio that was true for 16ms. That produced intermittent failures on
 * the first runs of this spec, in different tests each time, which is the signature of a
 * racing probe rather than a real defect. Waiting for `document.fonts.ready` and then
 * for two consecutive frames to agree on the tile's rect makes it deterministic.
 */
async function visit(page: Page, handle: string, width: number): Promise<Measurement> {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(`/products/${handle}`)
  await page.locator('.hj-product-tile svg').first().waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.ready)
  await settle(page)
  await page.waitForFunction(() => {
    const tile = document.querySelector('.hj-product-tile')
    if (tile === null) return false
    const rect = tile.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const store = window as unknown as { __hjLastTile?: string }
    const key = `${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`
    const stable = store.__hjLastTile === key
    store.__hjLastTile = key
    return stable
  })
  return measure(page, handle)
}

test.describe('the product tile fits the page it is drawn on', () => {
  for (const { handle, svgType, ratio } of REPRESENTATIVES) {
    test(`${svgType} (${ratio}) sits inside the viewport at every width`, async ({ page }) => {
      for (const width of WIDTHS) {
        const { tile, innerWidth } = await visit(page, handle, width)
        const overhang = Math.max(0, tile.x + tile.width - innerWidth, -tile.x)
        expect(
          overhang,
          `at ${width}px the tile (${tile.width.toFixed(0)}x${tile.height.toFixed(0)}) hangs ` +
            `${overhang.toFixed(0)}px past the viewport. overflow-x: hidden means this is ` +
            'silent amputation, not a scrollbar.'
        ).toBeLessThanOrEqual(OVERHANG_TOLERANCE_PX)
      }
    })

    test(`${svgType} (${ratio}) gets a square tile at every width`, async ({ page }) => {
      for (const width of WIDTHS) {
        const { tile } = await visit(page, handle, width)
        expect(
          Math.abs(tile.width - tile.height),
          `at ${width}px the tile is ${tile.width.toFixed(0)}x${tile.height.toFixed(0)}, not square`
        ).toBeLessThanOrEqual(1)
      }
    })
  }

  test('the tile is bounded above by --hj-product-tile-max', async ({ page }) => {
    const { tile, tileMaxToken } = await visit(page, REPRESENTATIVES[0].handle, 1280)
    const cap = parseFloat(tileMaxToken)
    expect(
      Number.isFinite(cap) && cap > 0,
      `--hj-product-tile-max did not resolve to a length (got "${tileMaxToken}"). ` +
        'Without it aspect-ratio grows with the column and nothing pushes back.'
    ).toBe(true)
    expect(
      tile.width,
      `at 1280px the tile is ${tile.width.toFixed(0)}px against a ${cap}px cap`
    ).toBeLessThanOrEqual(cap + 1)
  })
})

test.describe('every illustration reads at a comparable size', () => {
  for (const { handle, svgType, ratio } of REPRESENTATIVES) {
    test(`${svgType} (${ratio}) fills a bounded share of its tile`, async ({ page }) => {
      for (const width of WIDTHS) {
        const { tile, ink, viewBox } = await visit(page, handle, width)
        const extent = Math.max(ink.width, ink.height) / tile.width
        expect(
          extent,
          `at ${width}px ${svgType} (viewBox "${viewBox}") covers ${(extent * 100).toFixed(1)}% ` +
            `of its tile's longer edge, outside [${MIN_MARK_EXTENT}, ${MAX_MARK_EXTENT}]`
        ).toBeGreaterThanOrEqual(MIN_MARK_EXTENT)
        expect(extent).toBeLessThanOrEqual(MAX_MARK_EXTENT)
      }
    })

    test(`${svgType} (${ratio}) is not clipped by its tile`, async ({ page }) => {
      for (const width of WIDTHS) {
        const { tile, ink } = await visit(page, handle, width)
        const overlap = intersection(ink, tile)
        expect(overlap, `at ${width}px ${svgType} does not overlap its tile at all`).not.toBeNull()
        const visible = (overlap!.width * overlap!.height) / (ink.width * ink.height)
        expect(
          visible,
          `at ${width}px ${(100 - visible * 100).toFixed(1)}% of ${svgType} is outside its tile. ` +
            '.card-tile has overflow: hidden, so the symptom is a clean crop, not a scrollbar.'
        ).toBeGreaterThan(0.99)
      }
    })
  }

  test('a ring and an earring carry comparable optical weight', async ({ page }) => {
    const extents = new Map<string, number>()
    for (const { handle, svgType } of REPRESENTATIVES) {
      const { tile, ink } = await visit(page, handle, 390)
      extents.set(svgType, Math.max(ink.width, ink.height) / tile.width)
    }
    const values = [...extents.values()]
    const spread = Math.max(...values) / Math.min(...values)
    const detail = [...extents.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, value]) => `${type} ${(value * 100).toFixed(1)}%`)
      .join(', ')
    expect(
      spread,
      `largest mark out-reads the smallest by ${spread.toFixed(2)}x (${detail}). ` +
        'One svgScale is supposed to mean one optical weight.'
    ).toBeLessThanOrEqual(MAX_EXTENT_SPREAD)
  })
})

test.describe('the buy control stays reachable', () => {
  test('Add to Bag is not pushed down the page by the tile', async ({ page }) => {
    for (const { handle, svgType } of REPRESENTATIVES) {
      await visit(page, handle, 390)
      const button = page.getByRole('button', {
        name: /add .* to bag|select a size|is sold out/i,
      })
      const box = await button.first().boundingBox()
      if (box === null) throw new Error(`/products/${handle}: no buy control found to measure`)
      const y = box.y + (await page.evaluate(() => window.scrollY))
      expect(
        y,
        `on ${svgType} the buy control sits ${y.toFixed(0)}px down the page. The tile used ` +
          'to be 480px tall on a 342px column, which is what put it there.'
      ).toBeLessThanOrEqual(MAX_ADD_TO_BAG_Y)
    }
  })
})
