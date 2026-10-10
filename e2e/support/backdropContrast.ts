import type { Locator, Page } from '@playwright/test'
import { PNG } from 'pngjs'
import {
  contrastRatioFromLuminance,
  parseCssColor,
  relativeLuminance,
  requiredContrast,
  type Rgb,
} from '../../src/lib/utils/contrast'

/**
 * **Measures what is actually behind a node: the worst pixel, not an average, and not what the CSS says.**
 *
 * Moved out of `hero-legibility.spec.ts` when ADR 054 added the header to what that spec measures. The
 * hero copy and the header's controls both sit on a photograph, and axe returns *incomplete* for a text
 * node over an image because it cannot know what the pixels are. Two specs asking the same question of the
 * same rendered pixels should not keep two copies of the sampler, with two insets and two ideas about what
 * "behind" means.
 */

/** Device pixels trimmed from each edge of a sampled region — see `sampleBackdrop`. */
const SAMPLE_INSET_PX = 4

/**
 * Captures what is behind a node by removing only its glyphs: `color: transparent` on the node itself,
 * so a button's own fill, a card's border and the photograph stay exactly as composited. Hiding the
 * element instead would sample the page behind a filled CTA and report a false failure for its label.
 *
 * It also works for an icon drawn with `currentColor` (the header's search glass), which is why the
 * header's non-text controls are measured with this and not skipped.
 */
export async function sampleBackdrop(page: Page, locator: Locator): Promise<Rgb[]> {
  const setGlyphsTransparent = (transparent: boolean) =>
    locator.evaluate((el, isTransparent) => {
      const node = el as HTMLElement
      node.style.color = isTransparent ? 'transparent' : ''
      node.style.textShadow = isTransparent ? 'none' : ''
    }, transparent)

  await setGlyphsTransparent(true)
  // The style change must be painted before the capture, or the screenshot samples the glyphs themselves
  // and reports a perfect 1.00:1 "failure" that is really the harness racing the repaint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  // An element screenshot, not `page.screenshot({ clip })`: under mobile emulation the two disagree at a
  // fractional device pixel ratio (2.625 on a Pixel 7) and the clip drifts off the element.
  const buffer = await locator.screenshot()
  await setGlyphsTransparent(false)

  const png = PNG.sync.read(buffer)
  // Trim the outermost device pixels (an anti-aliased rim of whatever sits just outside) and the arc of a
  // rounded corner: a corner pixel is not what a label is read against. r * dpr * (1 - 1/sqrt2) along the
  // diagonal, a pixel for the rim and one for the rounding of the screenshot's box.
  const { radius, dpr } = await locator.evaluate((el) => ({
    radius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
    dpr: window.devicePixelRatio,
  }))
  const cornerInset = Math.ceil(radius * dpr * (1 - Math.SQRT1_2)) + 2
  const inset = Math.min(
    Math.max(SAMPLE_INSET_PX, cornerInset),
    Math.floor(Math.min(png.width, png.height) / 4)
  )
  const pixels: Rgb[] = []
  // Every 3rd pixel in each axis: a contrast failure over a photograph is never a single isolated pixel.
  for (let y = inset; y < png.height - inset; y += 3) {
    for (let x = inset; x < png.width - inset; x += 3) {
      const index = (png.width * y + x) << 2
      pixels.push({ r: png.data[index], g: png.data[index + 1], b: png.data[index + 2] })
    }
  }
  return pixels
}

export type Verdict = {
  label: string
  color: string
  fontSize: number
  fontWeight: number
  worst: number
  required: number
  ok: boolean
}

/** The lowest contrast of `locator`'s own colour against every sampled pixel behind it. */
export async function worstContrast(
  page: Page,
  label: string,
  locator: Locator,
  /** WCAG 1.4.11 asks 3:1 of a graphic or a control's boundary; 1.4.3 asks `requiredContrast` of text. */
  kind: 'text' | 'graphic' = 'text'
): Promise<Verdict> {
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
  const required = kind === 'graphic' ? 3 : requiredContrast(fontSize, fontWeight)
  return { label, color, fontSize, fontWeight, worst, required, ok: worst >= required }
}

/** One line per failure, in the form the specs print. */
export const describeVerdicts = (verdicts: Verdict[]): string[] =>
  verdicts
    .filter((v) => !v.ok)
    .map(
      (v) =>
        `${v.label} (${v.color}, ${v.fontSize}px/${v.fontWeight}) — worst ${v.worst.toFixed(2)}:1, needs ${v.required}:1`
    )
