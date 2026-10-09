import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SRC, lineOf, sourceFiles, stylesheet } from '../support/styleScan'

/**
 * The layers beneath type are tokens too (ADR 053): colour, motion, layering, elevation, spacing, radius
 * and the breakpoints. `typography-tracking.test.ts` and `typography-scale.test.ts` hold the type layer to
 * this standard; this holds the rest.
 *
 * Measured 2026-10-09 across the components and the stylesheet: an error red typed as a hex in a form
 * (outside the palette, so no contrast test knew it was a colour), badge tints typed as the *RGB of a token*
 * (a palette change would have left them behind), twenty-two durations typed as seconds beside three
 * `--duration-*` tokens, three z-indexes typed as 89, 90 and 94, a shadow typed as `rgba(0,0,0,…)`, five
 * odd-pixel paddings, and a layout that switched at 768px beside a header that switches at 769px, so that
 * at exactly 768 (an iPad held upright) the two disagreed. None of those was a failing test.
 */

const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8')
const files = () => sourceFiles(SRC).map((file) => ({ rel: path.relative(SRC, file), text: readFileSync(file, 'utf8') }))

/** The stylesheet minus its `:root` token block: what is left is where tokens are *used*. */
function stylesheetWithoutRoot(): string {
  const css = stylesheet()
  const start = css.indexOf(':root')
  if (start < 0) throw new Error('globals.css no longer has a :root block')
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}' && --depth === 0) return css.slice(0, start) + css.slice(i + 1)
  }
  throw new Error(':root block is not closed')
}

/** Every `[unit]` of a declaration list in the stylesheet (without :root) and in each component's own CSS strings. */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g

describe('colour is a token', () => {
  /**
   * Allowed to name a colour themselves, each for a reason. A hex in a component is a colour no contrast
   * test was told about.
   */
  const COLOUR_EXCEPTIONS = new Map<string, string>([
    ['components/svg/JewelrySVG.tsx', 'the placeholder illustrations\' own warm greys, replaced by photography as pieces get it'],
    ['app/layout.tsx', '`themeColor` is read by the browser chrome, which has no custom properties (held equal to --bg below)'],
  ])

  it('is not typed in a component', () => {
    const found = files().flatMap(({ rel, text }) =>
      COLOUR_EXCEPTIONS.has(rel)
        ? []
        : [...text.matchAll(COLOUR)].map((m) => `${rel}:${lineOf(text, m.index ?? 0)} ${m[0]}`)
    )
    expect(
      found,
      'Use a colour token (var(--ink), var(--error-text)…), or color-mix() of one for a tint. A new colour is a token in ' +
        'globals.css, classified in design-tokens-contrast.test.ts.'
    ).toEqual([])
  })

  it('is not typed in the stylesheet outside the :root token block', () => {
    const css = stylesheetWithoutRoot()
    const found = [...css.matchAll(COLOUR)].map((m) => `globals.css:${lineOf(css, m.index ?? 0)} ${m[0]}`)
    expect(found).toEqual([])
  })

  it('has a theme colour equal to the ground', () => {
    const bg = stylesheet().match(/--bg:\s*(#[0-9A-Fa-f]{6})/)?.[1]
    const theme = read('app/layout.tsx').match(/themeColor:\s*'(#[0-9A-Fa-f]{6})'/)?.[1]
    expect(bg, '--bg is defined').toBeTruthy()
    expect(theme?.toUpperCase(), 'the browser chrome is painted the page\'s own ground').toBe(bg?.toUpperCase())
  })
})

describe('motion is a token', () => {
  /** A `transition` or `animation` declaration, in the stylesheet or in a component's CSS string or style object. */
  function declarations(): { where: string; value: string }[] {
    const out: { where: string; value: string }[] = []
    const css = stylesheetWithoutRoot()
    for (const m of css.matchAll(/(?:^|[;{\s])(?:transition|animation)\s*:\s*([^;}]+)[;}]/g))
      out.push({ where: `globals.css:${lineOf(css, m.index ?? 0)}`, value: m[1] })
    for (const { rel, text } of files()) {
      for (const m of text.matchAll(/\b(?:transition|animation)\s*(?::|=)\s*(`[^`]*`|'[^']*')/g))
        out.push({ where: `${rel}:${lineOf(text, m.index ?? 0)}`, value: m[1].slice(1, -1) })
      for (const m of text.matchAll(/(?:^|[;{\s])(?:transition|animation):\s*([^;`'\n}]+);/g))
        out.push({ where: `${rel}:${lineOf(text, m.index ?? 0)}`, value: m[1] })
    }
    return out
  }

  const TIME = /(?<![\w-])\d*\.?\d+m?s\b/
  const KEYWORD_EASING = /(?<![\w(-])(?:ease|ease-in|ease-out|ease-in-out|linear)(?![\w-])|cubic-bezier\(/

  it('names a --duration-* step and --ease or --ease-sharp, never a time or an easing keyword', () => {
    const bad = declarations().flatMap((d) => {
      // Strip `var(...)` first: the tokens are the point, and a keyframe name is an identifier.
      const bare = d.value.replace(/var\([^)]*\)/g, '')
      return TIME.test(bare) || KEYWORD_EASING.test(bare) ? [`${d.where}: ${d.value.trim().slice(0, 90)}`] : []
    })
    expect(
      bad,
      'A transition takes var(--duration-fast|base|slow) and var(--ease|--ease-sharp). They were typed as 0.2s … 0.7s and ' +
        '`ease-out` in twenty-two places beside the tokens.'
    ).toEqual([])
  })

  it('finds the declarations it judges', () => {
    expect(declarations().length).toBeGreaterThan(20)
  })

  it('has three steps, fast to slow', () => {
    const css = stylesheet()
    const ms = (name: string) => Number(css.match(new RegExp(`--duration-${name}:\\s*(\\d+)ms`))?.[1])
    expect(ms('fast')).toBeLessThan(ms('base'))
    expect(ms('base')).toBeLessThan(ms('slow'))
  })
})

describe('layers are tokens', () => {
  it('has a z-index that is a --z-* token, or a small local number', () => {
    const found: string[] = []
    const css = stylesheetWithoutRoot()
    for (const m of css.matchAll(/z-index:\s*([^;]+);/g))
      if (!/^var\(--z-[a-z]+\)$/.test(m[1].trim()) && !/^-?[0-2]$/.test(m[1].trim()))
        found.push(`globals.css:${lineOf(css, m.index ?? 0)} z-index ${m[1].trim()}`)
    for (const { rel, text } of files())
      for (const m of text.matchAll(/zIndex:\s*('[^']*'|-?\d+)/g)) {
        const v = m[1].replace(/'/g, '')
        if (!/^var\(--z-[a-z]+\)$/.test(v) && !/^-?[0-2]$/.test(v)) found.push(`${rel}:${lineOf(text, m.index ?? 0)} zIndex ${v}`)
      }
    expect(found, 'A layer is a --z-* token (menu, header, consent, skip); 0 to 2 is for stacking inside one component.').toEqual([])
  })

  it('orders the layers the way a visitor meets them: menu, header, consent notice, skip link', () => {
    const css = stylesheet()
    const z = (name: string) => Number(css.match(new RegExp(`--z-${name}:\\s*(\\d+)`))?.[1])
    expect([z('menu'), z('header'), z('consent'), z('skip')]).toEqual([...[z('menu'), z('header'), z('consent'), z('skip')]].sort((a, b) => a - b))
    expect(z('menu')).toBeGreaterThan(2)
  })

  it('has a shadow that is a token', () => {
    const found = files().flatMap(({ rel, text }) =>
      [...text.matchAll(/boxShadow:\s*'([^']*)'/g)]
        .filter((m) => m[1] !== 'none' && !m[1].startsWith('var(--shadow-'))
        .map((m) => `${rel}:${lineOf(text, m.index ?? 0)} ${m[1]}`)
    )
    const css = stylesheetWithoutRoot()
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g))
      if (m[1].trim() !== 'none' && !m[1].trim().startsWith('var(--shadow-')) found.push(`globals.css:${lineOf(css, m.index ?? 0)} ${m[1].trim()}`)
    expect(found, 'The site is flat; the one thing that floats has --shadow-float.').toEqual([])
  })
})

describe('space and shape are on their scales', () => {
  /** Spacing is on a 2px grid. The odd values (3, 5, 7, 9, 13px) were five paddings someone typed to make a box look right. */
  it('has no odd-pixel padding, margin or gap', () => {
    const found: string[] = []
    const scan = (where: (i: number) => string, text: string, rx: RegExp, take: (m: RegExpMatchArray) => string) => {
      for (const m of text.matchAll(rx))
        for (const px of take(m).matchAll(/(-?\d+(?:\.\d+)?)px/g))
          if (Number(px[1]) % 2 !== 0) found.push(`${where(m.index ?? 0)} ${m[0].trim().slice(0, 70)}`)
    }
    const css = stylesheet()
    scan((i) => `globals.css:${lineOf(css, i)}`, css, /(?:^|[;{\s])(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*[^;]+;/g, (m) => m[0])
    for (const { rel, text } of files()) {
      scan((i) => `${rel}:${lineOf(text, i)}`, text, /\b(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right)?:\s*'[^']*'/g, (m) => m[0])
      scan((i) => `${rel}:${lineOf(text, i)}`, text, /(?:^|[;{\s])(?:padding|margin|gap)(?:-[a-z]+)?:\s*[^;`'\n}]+;/g, (m) => m[0])
    }
    expect(found, 'Space moves in even pixels (4, 8, 10, 12, 16, 20, 24…).').toEqual([])
  })

  it('draws a corner with --radius-control, --radius-frame, none, or a circle', () => {
    const found: string[] = []
    const ok = (v: string) => /^(var\(--radius-(control|frame)\)|0|50%)$/.test(v.trim())
    const css = stylesheet()
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      // The scrollbar thumb is a 2px WebKit pseudo-element: its 1px rounding is not a card's corner.
      const before = css.slice(Math.max(0, (m.index ?? 0) - 120), m.index)
      if (!ok(m[1]) && !/::-webkit-scrollbar-thumb/.test(before)) found.push(`globals.css:${lineOf(css, m.index ?? 0)} ${m[1].trim()}`)
    }
    for (const { rel, text } of files())
      for (const m of text.matchAll(/borderRadius:\s*('[^']*'|\d+)/g))
        if (!ok(m[1].replace(/'/g, ''))) found.push(`${rel}:${lineOf(text, m.index ?? 0)} ${m[1]}`)
    expect(found).toEqual([])
  })
})

describe('the breakpoints are the documented ones', () => {
  /**
   * Media queries cannot read custom properties, so the set is written here and nowhere else. The phone
   * layouts are `max-width: N` and their desktop pairs `min-width: N + 1`, so no width is in both; the
   * product page switched at `min-width: 768px` beside a header that switches at 769, and an iPad held upright
   * (768 wide) got one layout from each (ADR 053).
   */
  const MAX = [359, 600, 768, 900]
  const MIN = [769, 961]

  it('uses only those widths, each as the side of its pair', () => {
    const found: string[] = []
    const css = stylesheet()
    const sources = [{ rel: 'globals.css', text: css }, ...files()]
    for (const { rel, text } of sources) {
      for (const m of text.matchAll(/@media[^{]*\((max|min)-width:\s*(\d+)px\)/g)) {
        const n = Number(m[2])
        if (!(m[1] === 'max' ? MAX : MIN).includes(n)) found.push(`${rel}:${lineOf(text, m.index ?? 0)} ${m[0].trim()}`)
      }
    }
    expect(found, `Breakpoints are max ${MAX.join(', ')} and min ${MIN.join(', ')}.`).toEqual([])
  })

  it('pairs a desktop min with the phone max one pixel below it (769/768), where one exists', () => {
    expect(MIN.includes(MAX.find((n) => n === 768)! + 1)).toBe(true)
  })

  it('is read from the stylesheet, so the sweep is not vacuous', () => {
    const css = stylesheet()
    expect([...css.matchAll(/@media[^{]*\((?:max|min)-width:\s*\d+px\)/g)].length).toBeGreaterThan(8)
  })
})
