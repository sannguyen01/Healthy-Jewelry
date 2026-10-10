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

  it('is drawn by the header itself, only while it overlays the hero, behind the bar\'s own content', () => {
    const rule = css.match(/\.hj-header\[data-state="hero-overlay"\]::before \{([^}]*)\}/)
    expect(rule, 'a ::before on the overlay header').not.toBeNull()
    const body = rule![1]
    expect(body).toMatch(/content:\s*""/)
    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/z-index:\s*-1/)
    expect(body).toMatch(/pointer-events:\s*none/)
    expect(body).toMatch(/var\(--hj-bar-veil\)\s+var\(--hj-veil-bar\)/)
  })

  it('takes its colour from the header\'s own tone, ground for dark type and ink for light', () => {
    expect(css).toMatch(/\.hj-header \{[^}]*--hj-bar-veil:\s*var\(--bg\)/)
    expect(css).toMatch(/\.hj-header\[data-bar-tone="light"\] \{[^}]*--hj-bar-veil:\s*var\(--ink\)/)
  })

  it('is no longer drawn by the hero, which has nothing to say about the bar', () => {
    expect(css).not.toMatch(/--hj-top-veil/)
    expect(css).not.toMatch(/data-header-tone/)
  })
})
