import { describe, expect, it } from 'vitest'
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  contrastRatioFromLuminance,
  isLargeText,
  parseCssColor,
  parseHex,
  relativeLuminance,
  requiredContrast,
  worstContrastAgainstPixels,
} from '@/lib/utils/contrast'

describe('parseHex', () => {
  it('parses six-digit hex', () => {
    expect(parseHex('#1A1714')).toEqual({ r: 26, g: 23, b: 20 })
  })

  it('parses three-digit shorthand', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('tolerates a missing leading hash', () => {
    expect(parseHex('F7F5F1')).toEqual({ r: 247, g: 245, b: 241 })
  })

  it('throws rather than silently returning black', () => {
    // A parser that fell back to #000 would make every contrast assertion pass
    // for the wrong reason.
    expect(() => parseHex('not-a-colour')).toThrow(/Not a hex colour/)
  })
})

describe('parseCssColor', () => {
  it('parses the rgb() form getComputedStyle returns', () => {
    expect(parseCssColor('rgb(94, 104, 112)')).toEqual({ r: 94, g: 104, b: 112 })
  })

  it('parses rgba() and ignores the alpha channel', () => {
    expect(parseCssColor('rgba(26, 23, 20, 0.5)')).toEqual({ r: 26, g: 23, b: 20 })
  })

  it('falls through to hex parsing', () => {
    expect(parseCssColor('#9DA7AF')).toEqual({ r: 157, g: 167, b: 175 })
  })

  it('throws on an unsupported format', () => {
    expect(() => parseCssColor('color(display-p3 1 0 0)')).toThrow(/Unsupported colour format/)
  })
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10)
  })

  it('weights green most heavily', () => {
    const green = relativeLuminance({ r: 0, g: 255, b: 0 })
    const red = relativeLuminance({ r: 255, g: 0, b: 0 })
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 })
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })
})

describe('contrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })

  it('returns 1:1 for a colour against itself', () => {
    expect(contrastRatio('#9DA7AF', '#9DA7AF')).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    expect(contrastRatio('#1A1714', '#F7F5F1')).toBeCloseTo(contrastRatio('#F7F5F1', '#1A1714'), 10)
  })

  it('accepts rgb triples and css strings interchangeably', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, 'rgb(255, 255, 255)')).toBeCloseTo(21, 5)
  })
})

describe('contrastRatioFromLuminance', () => {
  it('matches the ratio computed from colours', () => {
    const fromColors = contrastRatio('#1A1714', '#F7F5F1')
    const fromLuminance = contrastRatioFromLuminance(
      relativeLuminance(parseHex('#1A1714')),
      relativeLuminance(parseHex('#F7F5F1'))
    )
    expect(fromLuminance).toBeCloseTo(fromColors, 10)
  })
})

describe('isLargeText / requiredContrast', () => {
  it('treats 24px and above as large at any weight', () => {
    expect(isLargeText(24, 400)).toBe(true)
    expect(requiredContrast(24, 400)).toBe(AA_LARGE_TEXT)
  })

  it('treats 18.66px as large only when bold', () => {
    expect(isLargeText(18.66, 700)).toBe(true)
    expect(isLargeText(18.66, 400)).toBe(false)
    expect(requiredContrast(18.66, 400)).toBe(AA_NORMAL_TEXT)
  })

  it('treats ordinary body copy as normal text', () => {
    expect(isLargeText(16, 400)).toBe(false)
    expect(requiredContrast(16, 400)).toBe(AA_NORMAL_TEXT)
  })
})

describe('worstContrastAgainstPixels', () => {
  it('reports the worst pixel, not the average', () => {
    // Dark text over a backdrop that is mostly white but has one dark patch.
    // The mean would look comfortable; the dark patch is what a reader trips on.
    const pixels = [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 40, g: 40, b: 40 },
    ]
    const worst = worstContrastAgainstPixels('#1A1714', pixels)
    expect(worst).toBeLessThan(2)
    expect(worst).toBeCloseTo(contrastRatio('#1A1714', 'rgb(40, 40, 40)'), 10)
  })

  it('equals the single-colour ratio for a uniform backdrop', () => {
    const pixels = Array.from({ length: 16 }, () => ({ r: 247, g: 245, b: 241 }))
    expect(worstContrastAgainstPixels('#1A1714', pixels)).toBeCloseTo(
      contrastRatio('#1A1714', '#F7F5F1'),
      10
    )
  })

  it('throws when nothing was sampled', () => {
    // An empty capture region silently passing would be worse than failing.
    expect(() => worstContrastAgainstPixels('#000000', [])).toThrow(/No pixels sampled/)
  })
})
