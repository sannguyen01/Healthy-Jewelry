import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  SRC,
  cssRules,
  enclosingObject,
  lineOf,
  sourceFiles,
  stylesheet,
  voiceOf,
  type Voice,
} from '../support/styleScan'

/**
 * Size and leading are scales, not numbers typed where they are needed (ADR 052, "One leading scale").
 *
 * Measured 2026-10-09 over fourteen rendered routes, on desktop and a phone: running text was set at
 * five line-heights (1.5, 1.6, 1.65, 1.7 and 1.75), display text at eight (1.0 to 1.3), three display
 * lines set at a heading's size took a paragraph's leading because nothing said otherwise, a field's
 * text was 14px (iOS zooms the page for any control under 16px and does not zoom back), and eight
 * font sizes were typed in rem beside the `--text-*` tokens, two of them with a fallback that
 * disagreed with the token it sat inside (`var(--text-xl, 1.4rem)` here, `1.3rem` there).
 *
 * So: leading has four tokens, a `line-height` is one of them (or `1`, for a single glyph set as a
 * numeral), a `font-size` is a `--text-*` token, and a token is never given a fallback. What is
 * allowed to set its own size is named below with its reason. `e2e/rendered-fonts.spec.ts` holds the
 * same lines on what Chrome drew, which also catches a style that arrives through a spread.
 */

/** Sizes that are not on the scale, each for a reason. A new one is a decision, not a convenience. */
const SIZE_EXCEPTIONS_TSX = new Map<string, Map<string, string>>([
  ['components/layout/Footer.tsx', new Map([['1.1rem', 'the brand name in the footer (ADR 048)']])],
  ['app/materials/page.tsx', new Map([['5rem', 'a decorative ordinal, aria-hidden']])],
  ['app/about/page.tsx', new Map([['3.5rem', 'a decorative ordinal, aria-hidden']])],
  ['app/not-found.tsx', new Map([['clamp(6rem, 20vw, 14rem)', 'the 404 numeral, aria-hidden']])],
  ['app/shop/[collection]/page.tsx', new Map([['clamp(8rem, 20vw, 18rem)', 'the collection\'s ghost numeral, aria-hidden']])],
])

const SIZE_EXCEPTIONS_CSS = new Map<string, string>([
  ['.hj-wordmark', 'the brand name in the header (ADR 048)'],
  ['.hj-seal .hj-lockup-text', 'the brand name on the care band\'s seal (ADR 048)'],
  ['.hj-card-name', 'a piece\'s name: one role, one definition, its own clamp'],
  ['.hj-menu-link', 'a menu category: the title voice at the board\'s own size'],
  ['.hj-archive-metal-name', 'a metal in the menu: the title voice at the board\'s own size'],
])

type Leading = 'display' | 'snug' | 'text' | 'long'

/** Which leading tokens a voice may take: a heading is not set like a paragraph, nor a paragraph like a heading. */
const LEADINGS_BY_VOICE: Partial<Record<Voice, string[]>> = {
  display: ['display', 'snug', '1'],
  body: ['text', 'long'],
}

interface Use {
  where: string
  prop: 'font-size' | 'line-height'
  value: string
  voice: Voice | null
  file?: string
  selector?: string
}

function inlineUses(): Use[] {
  const uses: Use[] = []
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const rel = path.relative(SRC, file)
    // `fontSize: 'var(--text-xs)'`, `lineHeight: 1`, `fontSize: someIdentifier`. A quoted value is read
    // whole, because a clamp() has commas in it.
    for (const m of text.matchAll(/\b(fontSize|lineHeight):\s*(?:'([^']*)'|([0-9.]+)|([A-Za-z_][\w.]*))/g)) {
      uses.push({
        where: `${rel}:${lineOf(text, m.index ?? 0)}`,
        prop: m[1] === 'fontSize' ? 'font-size' : 'line-height',
        value: (m[2] ?? m[3] ?? `<${m[4]}>`).trim(),
        voice: voiceOf(enclosingObject(text, m.index ?? 0)),
        file: rel,
      })
    }
    // CSS written inside a component (`<style>{`…`}</style>`).
    for (const m of text.matchAll(/(?:^|[;{\s])(font-size|line-height):\s*([^;}\n`]+)/g)) {
      uses.push({
        where: `${rel}:${lineOf(text, m.index ?? 0)}`,
        prop: m[1] as Use['prop'],
        value: m[2].trim(),
        voice: null,
        file: rel,
      })
    }
  }
  return uses
}

function cssUses(): Use[] {
  return cssRules(stylesheet()).flatMap((rule) =>
    [...rule.body.matchAll(/(?:^|[;\s])(font-size|line-height):\s*([^;]+);/g)].map((m) => ({
      where: `globals.css:${rule.line} ${rule.selector}`,
      prop: m[1] as Use['prop'],
      value: m[2].trim(),
      voice: voiceOf(rule.body),
      selector: rule.selector,
    }))
  )
}

const rootTokens = (prefix: string) =>
  new Map([...stylesheet().matchAll(new RegExp(`--${prefix}-([a-z0-9]+):\\s*([^;]+);`, 'g'))].map((m) => [m[1], m[2].trim()] as const))

const tokenName = (value: string, prefix: string) => value.match(new RegExp(`^var\\(--${prefix}-([a-z0-9]+)\\)$`))?.[1] ?? null

function leadingProblems(uses: Use[]): string[] {
  return uses
    .filter((u) => u.prop === 'line-height')
    .flatMap((u) => {
      const token = tokenName(u.value, 'leading')
      if (token === null) {
        return ['1', 'inherit', 'normal'].includes(u.value) ? [] : [`${u.where}: line-height ${u.value}, a typed number`]
      }
      if (!['display', 'snug', 'text', 'long'].includes(token)) return [`${u.where}: --leading-${token} is not a token`]
      const allowed = u.voice ? LEADINGS_BY_VOICE[u.voice] : undefined
      return allowed && !allowed.includes(token)
        ? [`${u.where}: the ${u.voice} voice takes --leading-${allowed.join(' / --leading-')}, not --leading-${token}`]
        : []
    })
}

function sizeProblems(uses: Use[]): string[] {
  const tokens = new Set(rootTokens('text').keys())
  return uses
    .filter((u) => u.prop === 'font-size')
    .flatMap((u) => {
      const token = tokenName(u.value, 'text')
      if (token !== null) return tokens.has(token) ? [] : [`${u.where}: --text-${token} is not defined`]
      if (u.selector && SIZE_EXCEPTIONS_CSS.has(u.selector)) return []
      if (u.file && SIZE_EXCEPTIONS_TSX.get(u.file)?.has(u.value)) return []
      return [`${u.where}: font-size ${u.value}, off the --text-* scale`]
    })
}

describe('the leading scale', () => {
  it('has four tokens, tighter to looser: display, snug, text, long', () => {
    const root = rootTokens('leading')
    expect([...root.keys()].sort()).toEqual(['display', 'long', 'snug', 'text'])
    const n = (k: Leading) => Number(root.get(k))
    expect(n('display')).toBeLessThan(n('snug'))
    expect(n('snug')).toBeLessThan(n('text'))
    expect(n('text')).toBeLessThan(n('long'))
  })

  it('is the only place a line-height is spelled (and 1 is for a single glyph)', () => {
    expect(
      leadingProblems([...inlineUses(), ...cssUses()]),
      'Use --leading-display for a heading, --leading-snug for a name or a one-line label, --leading-text for running ' +
        'text and --leading-long for long-form reading. A fifth value is a decision for ADR 052.'
    ).toEqual([])
  })
})

describe('the size scale', () => {
  it('is the only place a font-size is spelled, bar the named exceptions', () => {
    expect(
      sizeProblems([...inlineUses(), ...cssUses()]),
      'Use a --text-* token. What may set its own size is named at the top of this file, each with its reason.'
    ).toEqual([])
  })

  it('never gives a token a fallback', () => {
    // `var(--text-xl, 1.4rem)` is a second copy of the value that the token already is, and the copies
    // disagreed (1.4rem in four files, 1.3rem in two). The token is always defined; a fallback only drifts.
    const found: string[] = []
    const scan = (where: string, text: string) => {
      for (const m of text.matchAll(/var\(--(?:text|leading|tracking)-[a-z0-9]+\s*,/g)) found.push(`${where}:${lineOf(text, m.index ?? 0)} ${m[0]}…`)
    }
    for (const file of sourceFiles(SRC)) scan(path.relative(SRC, file), readFileSync(file, 'utf8'))
    scan('globals.css', stylesheet())
    expect(found).toEqual([])
  })

  it('catches what it exists for: a typed number, an off-scale size, a heading with a paragraph\'s leading', () => {
    const at = (prop: Use['prop'], value: string, voice: Voice | null = null, extra: Partial<Use> = {}): Use => ({
      where: 'sample',
      prop,
      value,
      voice,
      ...extra,
    })
    expect(leadingProblems([at('line-height', '1.7')]), 'a typed leading').toHaveLength(1)
    expect(leadingProblems([at('line-height', 'var(--leading-long)', 'display')]), 'a heading, a paragraph\'s leading').toHaveLength(1)
    expect(leadingProblems([at('line-height', 'var(--leading-display)', 'body')]), 'a paragraph, a heading\'s leading').toHaveLength(1)
    expect(leadingProblems([at('line-height', 'var(--leading-nope)')]), 'a token that is not one').toHaveLength(1)
    expect(
      leadingProblems([
        at('line-height', 'var(--leading-text)', 'body'),
        at('line-height', 'var(--leading-display)', 'display'),
        at('line-height', '1'),
      ]),
      'the legal shapes pass'
    ).toEqual([])
    expect(sizeProblems([at('font-size', '0.75rem', null, { file: 'app/x.tsx' })]), 'a typed size').toHaveLength(1)
    expect(sizeProblems([at('font-size', 'var(--text-nope)')]), 'an undefined token').toHaveLength(1)
    expect(sizeProblems([at('font-size', 'var(--text-xs)')]), 'a token').toEqual([])
    expect(inlineUses().length, 'the scan found the components\' declarations').toBeGreaterThan(100)
    expect(cssUses().length, 'the scan found the stylesheet\'s declarations').toBeGreaterThan(30)
  })
})
