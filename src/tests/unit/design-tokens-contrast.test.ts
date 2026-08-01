import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compositeOver, contrastRatio } from '@/lib/utils/contrast'

/**
 * WCAG 2.1 contrast enforcement for the T4 palette.
 *
 * The homepage shipped `--titanium` (#9DA7AF, 2.25:1 on `--bg`) as 10-12px body
 * copy in eight places. axe caught two of them, twenty-five minutes into an E2E
 * run, on the one page it scans for serious violations — and only after the
 * regression had already reached production.
 *
 * A contrast ratio is arithmetic over two hex values. It does not need a
 * browser, and it should not cost a browser: this runs in the fast gate, in
 * milliseconds, and covers every documented pairing rather than whatever
 * happens to be rendered on the four pages the a11y spec visits.
 *
 * Tokens are read from globals.css rather than duplicated here, so the test
 * cannot drift from the stylesheet it is guarding.
 */

const GLOBALS_CSS = path.resolve(__dirname, '../../app/globals.css')

/** Parses `--token: #RRGGBB;` declarations out of the stylesheet. */
function readTokens(): Record<string, string> {
  const css = readFileSync(GLOBALS_CSS, 'utf8')
  const tokens: Record<string, string> = {}
  for (const match of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[match[1]] = match[2].toUpperCase()
  }
  return tokens
}

const tokens = readTokens()

const token = (name: string): string => {
  const value = tokens[name]
  if (!value) {
    throw new Error(
      `Design token --${name} is missing from globals.css. If it was renamed, update this test — it is the contract, not a copy.`
    )
  }
  return value
}

/**
 * Every pairing the design system actually uses for *text*, with the level it
 * has to clear. 4.5:1 is the AA floor for body copy; 3:1 applies to large text
 * (>= 24px, or >= 18.66px bold).
 *
 * Deliberately absent: `--titanium` and `--ash` on light backgrounds. Those are
 * accent and border tokens. `--titanium` is 2.25:1 on `--bg` — it is why
 * `--titanium-text` exists — and `--ash` only ever carries the decorative
 * ordinals, which are exempt under WCAG 1.4.3 and excluded in e2e/a11y.spec.ts.
 */
const TEXT_PAIRINGS: Array<{
  label: string
  foreground: string
  background: string
  minimum: number
}> = [
  // Light surfaces
  { label: 'ink on bg (primary text)', foreground: 'ink', background: 'bg', minimum: 4.5 },
  { label: 'ink on nacre (card text)', foreground: 'ink', background: 'nacre', minimum: 4.5 },
  { label: 'graphite on bg (secondary text)', foreground: 'graphite', background: 'bg', minimum: 4.5 },
  {
    label: 'graphite on nacre (secondary text on cards)',
    foreground: 'graphite',
    background: 'nacre',
    minimum: 4.5,
  },
  {
    label: 'titanium-text on bg (metadata, eyebrows, footer)',
    foreground: 'titanium-text',
    background: 'bg',
    minimum: 4.5,
  },
  {
    label: 'titanium-text on nacre (badges, card metadata)',
    foreground: 'titanium-text',
    background: 'nacre',
    minimum: 4.5,
  },

  // Dark surfaces
  { label: 'on-dark on black (campaign band)', foreground: 'on-dark', background: 'black', minimum: 4.5 },
  { label: 'on-dark on ink (mobile nav overlay)', foreground: 'on-dark', background: 'ink', minimum: 4.5 },
  { label: 'on-dark on mid (dark hover)', foreground: 'on-dark', background: 'mid', minimum: 4.5 },
  { label: 'mist on black (muted text on dark)', foreground: 'mist', background: 'black', minimum: 4.5 },
  {
    label: 'titanium on ink (mobile nav tagline)',
    foreground: 'titanium',
    background: 'ink',
    minimum: 4.5,
  },
]

describe('T4 design tokens', () => {
  it('parses the palette out of globals.css', () => {
    // Guards the whole file: a parser that silently matches nothing would make
    // every assertion below vacuous.
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(11)
    expect(tokens.bg).toBe('#F7F5F1')
    expect(tokens.ink).toBe('#1A1714')
  })

  it('defines a text-safe titanium distinct from the titanium accent', () => {
    expect(token('titanium-text')).not.toBe(token('titanium'))
  })

  it('keeps the raw titanium accent out of AA text range on light backgrounds', () => {
    // Documents *why* --titanium-text exists. If someone ever lightens --bg or
    // darkens --titanium enough for this to pass, the extra token can go — and
    // this failure is the prompt to reconsider it.
    expect(contrastRatio(token('titanium'), token('bg'))).toBeLessThan(4.5)
  })
})

describe('T4 text contrast meets WCAG 2.1 AA', () => {
  for (const { label, foreground, background, minimum } of TEXT_PAIRINGS) {
    it(`${label} is at least ${minimum}:1`, () => {
      const ratio = contrastRatio(token(foreground), token(background))
      expect(
        Number(ratio.toFixed(2)),
        `--${foreground} (${token(foreground)}) on --${background} (${token(background)}) is ${ratio.toFixed(2)}:1, below the ${minimum}:1 minimum`
      ).toBeGreaterThanOrEqual(minimum)
    })
  }
})

/**
 * Surfaces built by layering a translucent tint over a token. Checking the text
 * against the underlying token is not enough — and is how the bestseller badge
 * shipped at 4.39:1 while measuring 4.74:1 against bare --nacre.
 */
describe('Composited surfaces meet WCAG 2.1 AA', () => {
  it('bestseller badge label on its tinted background is at least 4.5:1', () => {
    // ProductBadge/Badge: 12% --titanium over the --nacre card tile.
    const badgeBackground = compositeOver(token('titanium'), token('nacre'), 0.12)
    const ratio = contrastRatio(token('titanium-text'), badgeBackground)
    expect(
      Number(ratio.toFixed(2)),
      `--titanium-text on the composited badge background is ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

