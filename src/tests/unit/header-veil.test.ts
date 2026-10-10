import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseHex,
  type Rgb,
} from '@/lib/utils/contrast'

/**
 * The header over the hero carries its own veil (ADR 054), and the veil is strong enough for *anything* behind it.
 *
 * The first version of the hero put the header's veil in the hero, at the top of the photograph. That proved the bar
 * legible at scroll 0, where the photograph's sky is behind it, and nowhere else: the bar is an overlay for as long
 * as any of the hero is under it, so for a whole screen of scrolling it lay over the hero's copy and the veil beneath
 * it. At 320x568 the "Explore the pieces" label printed through the brand mark. A surface the bar does not own is
 * a surface it cannot promise, so the veil moved to the bar.
 *
 * Because the bar cannot know what scrolls under it, the veil's strength is a statement about the worst case, and the
 * worst case is arithmetic: the veil composited over pure black and over pure white, against the bar's own type.
 * That holds whatever the photograph is, which is the point; the browser test measures the rendered pixels.
 */

const ROOT = resolve(__dirname, '../../..')
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

const token = (name: string): string => {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\b`))
  if (!match) throw new Error(`${name} is not declared as a hex in globals.css`)
  return match[1]
}

const veilStrength = (): number => {
  const match = css.match(/--hj-veil-bar:\s*(\d+(?:\.\d+)?)%/)
  if (!match) throw new Error('--hj-veil-bar is not declared as a percentage in globals.css')
  return Number.parseFloat(match[1]) / 100
}

/** How much of what scrolls under the bar may show through it (the browser test holds the rendered bar to the same figure). */
const SHOW_THROUGH_MAX = 0.06

const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const WHITE: Rgb = { r: 255, g: 255, b: 255 }

/** The text of the bar and the colour of the veil it sits on, per tone (ADR 054: the tone is the record's). */
const TONES = [
  { tone: 'dark', text: '--ink', veil: '--bg' },
  { tone: 'light', text: '--on-dark', veil: '--ink' },
] as const

describe('the header\'s veil over the hero', () => {
  for (const { tone, text, veil } of TONES) {
    it(`keeps the ${tone}-tone bar at AA over a black photograph and a white one`, () => {
      const alpha = veilStrength()
      const veilColour = parseHex(token(veil))
      const worst = [BLACK, WHITE].map((backdrop) =>
        contrastRatio(parseHex(token(text)), compositeOver(veilColour, backdrop, alpha))
      )
      expect(
        Math.min(...worst),
        `${text} on ${veil} at ${(alpha * 100).toFixed(0)}% over black/white: ${worst.map((w) => w.toFixed(2)).join(' / ')}`
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })
  }

  it('is a weaker veil that fails the light tone, so the number is doing work (the test can go red)', () => {
    // 60% was the first token. It cleared the dark tone and not the light one; this pins that the check above is
    // sensitive to the strength rather than passing for any value.
    const light = TONES[1]
    const weak = compositeOver(parseHex(token(light.veil)), WHITE, 0.6)
    expect(contrastRatio(parseHex(token(light.text)), weak)).toBeLessThan(AA_NORMAL_TEXT)
  })

  it('hides what scrolls under it: at most 6% of the backdrop shows through the bar', () => {
    // AA is the floor for the bar's own type; it says nothing about what is *behind* the type. At 72% (the first token, set
    // by the AA arithmetic above) 28% of a backdrop came through, so the hero's sentence passing under the bar printed
    // through the brand mark on a phone: legible type on a band that was visibly not flat. At 88% (12%) the sentence was
    // still faintly there over "MENU" and the logo, on a dark photograph. Hiding a backdrop is its own
    // requirement, and it is the same arithmetic: what comes through is whatever the veil lets through, 1 - strength,
    // whatever the backdrop is. e2e/hero-legibility.spec.ts measures the rendered difference between a white and a
    // black backdrop and holds it to this figure.
    expect(
      1 - veilStrength(),
      `--hj-veil-bar is ${(veilStrength() * 100).toFixed(0)}%, so ${((1 - veilStrength()) * 100).toFixed(0)}% of the page behind the bar shows through`
    ).toBeLessThanOrEqual(SHOW_THROUGH_MAX + 1e-9) // 1 - 0.94 is 0.06000000000000005 in floating point
  })

  it('is the overlay header\'s own background, so it is as tall as the bar and no taller', () => {
    // It was a pseudo-element with the bar's own box once the fade below the bar was taken out; a surface that is
    // exactly its owner's box is its owner's background. Doing it that way also lets the state change fade, because the
    // header already transitions `background-color`, which a pseudo-element appearing and disappearing did not.
    const rule = css.match(/\.hj-header\[data-state="hero-overlay"\] \{([^}]*)\}/)
    expect(rule, 'a rule for the overlay header').not.toBeNull()
    expect(rule![1]).toMatch(/background-color:\s*color-mix\(in srgb,\s*var\(--hj-bar-veil\)\s+var\(--hj-veil-bar\),\s*transparent\)/)
    expect(css, 'nothing is drawn by a pseudo-element of the header').not.toMatch(/\.hj-header[^{,]*::(?:before|after)/)
  })

  it('takes its colour from the header\'s own tone, ground for dark type and ink for light', () => {
    expect(css).toMatch(/\.hj-header \{[^}]*--hj-bar-veil:\s*var\(--bg\)/)
    expect(css).toMatch(/\.hj-header\[data-bar-tone="light"\] \{[^}]*--hj-bar-veil:\s*var\(--ink\)/)
  })
})
