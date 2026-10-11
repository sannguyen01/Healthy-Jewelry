import type { Locator, Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { requiredContrast, worstContrastAgainstPixels, type Rgb } from '../../src/lib/utils/contrast'
import { afterPaint } from './viewportFit'

/**
 * **Measures what is actually behind a node: the worst pixel, not an average, and not what the CSS says.**
 *
 * Moved out of `hero-legibility.spec.ts` when ADR 054 added the header to what that spec measures. The
 * hero copy and the header's controls both sit on a photograph, and axe returns *incomplete* for a text
 * node over an image because it cannot know what the pixels are. Two specs asking the same question of the
 * same rendered pixels should not keep two copies of the sampler, with two insets and two ideas about what
 * "behind" means.
 */

/** The colour of one device pixel of a decoded screenshot (opaque: the alpha channel is not read). */
export function rgbAt(png: PNG, x: number, y: number): Rgb {
  const index = (png.width * y + x) << 2
  return { r: png.data[index], g: png.data[index + 1], b: png.data[index + 2] }
}

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
  // The node's own inline colour and shadow are put back as they were, not cleared: the hero's headline and sentence carry
  // `color: var(--hj-fg)` inline, and clearing it left the node inheriting whatever the page gave it for the rest of the
  // test.
  await locator.evaluate((el) => {
    const node = el as HTMLElement
    node.dataset.hjSampled = JSON.stringify([node.style.color, node.style.textShadow])
    node.style.color = 'transparent'
    node.style.textShadow = 'none'
  })
  // The style change must be painted before the capture, or the screenshot samples the glyphs themselves
  // and reports a perfect 1.00:1 "failure" that is really the harness racing the repaint.
  await afterPaint(page)
  // An element screenshot, not `page.screenshot({ clip })`: under mobile emulation the two disagree at a
  // fractional device pixel ratio (2.625 on a Pixel 7) and the clip drifts off the element.
  const buffer = await locator.screenshot()
  await locator.evaluate((el) => {
    const node = el as HTMLElement
    const [color, textShadow] = JSON.parse(node.dataset.hjSampled ?? '["",""]') as [string, string]
    node.style.color = color
    node.style.textShadow = textShadow
    delete node.dataset.hjSampled
  })

  const png = PNG.sync.read(buffer)
  // Trim the outermost device pixels (an anti-aliased rim of whatever sits just outside) and the control's own
  // edge: a corner pixel, or a pixel of the control's border, is not what its label is read against. Along the
  // diagonal of a rounded corner the border's inner edge is at r(1 - 1/sqrt2) + b/sqrt2 from each side, in CSS
  // pixels, so that, times the device pixel ratio, plus a pixel for the rim and one for the rounding of the
  // screenshot's box. The border term matters: at 2.625 device pixels per CSS pixel a ghost button's 1px light
  // border is 2.6 device pixels thick and curves through a region that looked clear of it, and the sampler read
  // the border (a --mist pixel, 2.1:1 against light type) as the backdrop. Which pixels a stride of three
  // happened to land on decided whether it was seen, so it passed at 390px and failed at 900px.
  const { radius, border, dpr } = await locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      border: Number.parseFloat(style.borderTopWidth) || 0,
      dpr: window.devicePixelRatio,
    }
  })
  const cornerInset = Math.ceil((radius * (1 - Math.SQRT1_2) + border * Math.SQRT1_2) * dpr) + 2
  const inset = Math.min(
    Math.max(SAMPLE_INSET_PX, cornerInset),
    Math.floor(Math.min(png.width, png.height) / 4)
  )
  const pixels: Rgb[] = []
  // Every 3rd pixel in each axis: a contrast failure over a photograph is never a single isolated pixel.
  for (let y = inset; y < png.height - inset; y += 3) {
    for (let x = inset; x < png.width - inset; x += 3) {
      pixels.push(rgbAt(png, x, y))
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
  // The library's own, which throws on an empty sample: a hand-written minimum over no pixels is +Infinity, which clears
  // every ratio, the shape of green that proves nothing.
  const worst = worstContrastAgainstPixels(color, pixels)
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
