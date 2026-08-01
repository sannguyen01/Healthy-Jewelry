/**
 * WCAG 2.1 contrast maths.
 *
 * Shared deliberately: the design-token unit test checks the palette declared in
 * globals.css, while the E2E legibility check samples pixels actually rendered
 * behind text. Two consumers, one implementation — a second copy would drift,
 * and the whole point of these checks is that the numbers are trustworthy.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** AA minimum for body text. */
export const AA_NORMAL_TEXT = 4.5
/** AA minimum for large text: >= 24px, or >= 18.66px bold. */
export const AA_LARGE_TEXT = 3

/**
 * WCAG's large-text threshold. Below it, text must clear 4.5:1 rather than 3:1.
 * Bold is defined as weight >= 700.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)
}

/** The contrast minimum that applies to text of a given size and weight. */
export function requiredContrast(fontSizePx: number, fontWeight: number): number {
  return isLargeText(fontSizePx, fontWeight) ? AA_LARGE_TEXT : AA_NORMAL_TEXT
}

/** Parses `#RGB` or `#RRGGBB`. Throws rather than silently yielding black. */
export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`)
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

/**
 * Parses the `rgb()` / `rgba()` form that `getComputedStyle` returns. Colours
 * read out of a live browser never come back as hex, so both paths are needed.
 */
export function parseCssColor(color: string): Rgb {
  if (color.trim().startsWith('#')) return parseHex(color)

  const match = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (!match) {
    throw new Error(`Unsupported colour format: ${color}`)
  }

  return {
    r: Number.parseFloat(match[1]),
    g: Number.parseFloat(match[2]),
    b: Number.parseFloat(match[3]),
  }
}

/**
 * Composites a translucent colour over an opaque one, yielding the colour a
 * viewer actually sees.
 *
 * Needed because a token is not always laid directly on another token. The
 * bestseller badge tints `--nacre` with 12% titanium before its label sits on
 * top, and checking the label against bare `--nacre` reported a comfortable
 * 4.74:1 for a pairing that was really 4.39:1 — a genuine AA failure hidden by
 * measuring against the wrong background.
 */
export function compositeOver(foreground: Rgb | string, background: Rgb | string, alpha: number): Rgb {
  const fg = typeof foreground === 'string' ? parseCssColor(foreground) : foreground
  const bg = typeof background === 'string' ? parseCssColor(background) : background
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) }
}

/** WCAG 2.1 relative luminance for an 8-bit sRGB triple. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const normalised = channel / 255
    return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** WCAG 2.1 contrast ratio between two luminances. Always >= 1. */
export function contrastRatioFromLuminance(a: number, b: number): number {
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG 2.1 contrast ratio between two colours. Order-independent. */
export function contrastRatio(foreground: Rgb | string, background: Rgb | string): number {
  const fg = typeof foreground === 'string' ? parseCssColor(foreground) : foreground
  const bg = typeof background === 'string' ? parseCssColor(background) : background
  return contrastRatioFromLuminance(relativeLuminance(fg), relativeLuminance(bg))
}

/**
 * The worst contrast the given text colour achieves against any pixel in a
 * sampled backdrop.
 *
 * Text over a photograph does not have "a" background colour — it has thousands.
 * Averaging them hides exactly the failure worth catching: a light word sitting
 * on one pale patch of an otherwise dark image is unreadable even when the mean
 * looks comfortable. So this reports the minimum, which is the pixel a reader
 * actually struggles on.
 */
export function worstContrastAgainstPixels(textColor: Rgb | string, pixels: Rgb[]): number {
  if (pixels.length === 0) {
    throw new Error('No pixels sampled — the capture region was empty')
  }

  const textLuminance = relativeLuminance(
    typeof textColor === 'string' ? parseCssColor(textColor) : textColor
  )

  let worst = Number.POSITIVE_INFINITY
  for (const pixel of pixels) {
    const ratio = contrastRatioFromLuminance(textLuminance, relativeLuminance(pixel))
    if (ratio < worst) worst = ratio
  }
  return worst
}
