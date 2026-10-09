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
 * Tracking is a scale with a place for every voice, not a number typed where it is needed
 * (ADR 052, "One tracking scale").
 *
 * Measured 2026-10-09 over the fifteen page routes: the label voice (DM Sans capitals) was tracked
 * at 0.1, 0.12, 0.14, 0.15, 0.16, 0.18 and 0.22em, and the same role carried two values on two
 * routes — the section eyebrow was 0.14em on /about and 0.22em on /stores and /faq. Two lines of
 * running text, a card's hover specification and a material's designation, were tracked at 0.08 and
 * 0.16em although only capitals are tracked, and nothing failed, because every rule that existed
 * asked which face drew the text and none asked how it was spaced.
 *
 * So there are five tokens — two for the label voice, three for the display voice — and a
 * `letter-spacing` or `letterSpacing` in the app's own code is one of them, or nothing. It is
 * checked from source, in the fast gate; `e2e/rendered-fonts.spec.ts` holds the same line on what
 * Chrome drew.
 */

/**
 * The brand name's own tracking (ADR 048): the logotype keeps the values it had before the
 * Songmont reference — 0.10em in the header, 0.12em in the footer and the seal — and it is the one
 * thing on the site that is not a label or a heading. Each is a raw number on purpose, and named
 * here so a second one cannot join it unseen.
 */
const BRAND_NAME_FILES = new Map<string, string>([['components/layout/Footer.tsx', '0.12em']])
const BRAND_NAME_SELECTORS = new Set(['.hj-wordmark', '.hj-seal .hj-lockup-text'])

const NONE = new Set(['0', 'normal', 'inherit', 'initial', 'unset'])

/** Which tokens a voice may use. The body voice has none: running text is never tracked. */
const TOKENS_BY_VOICE: Record<Voice, string[]> = {
  ui: ['meta', 'label'],
  display: ['display', 'title', 'name'],
  body: [],
  brand: [],
}

interface Use {
  where: string
  value: string
  /** The voice declared on the same style object or rule, when it declares one. */
  voice: Voice | null
  /** The selector, for a CSS rule. */
  selector?: string
  file?: string
}

function inlineUses(): Use[] {
  const uses: Use[] = []
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const rel = path.relative(SRC, file)
    for (const m of text.matchAll(/letterSpacing:\s*'([^']+)'/g)) {
      uses.push({
        where: `${rel}:${lineOf(text, m.index ?? 0)}`,
        value: m[1].trim(),
        voice: voiceOf(enclosingObject(text, m.index ?? 0)),
        file: rel,
      })
    }
  }
  return uses
}

function cssUses(): Use[] {
  return cssRules(stylesheet()).flatMap((rule) => {
    const spacing = rule.body.match(/(?:^|[;\s])letter-spacing:\s*([^;]+);/)
    if (!spacing) return []
    return [
      {
        where: `globals.css:${rule.line} ${rule.selector}`,
        value: spacing[1].trim(),
        voice: voiceOf(rule.body),
        selector: rule.selector,
      },
    ]
  })
}

const tokenName = (value: string) => value.match(/^var\(--tracking-([a-z]+)\)$/)?.[1] ?? null

/** The uses that track a voice with a token that is not its own (a typed number is reported elsewhere). */
function wrongTokens(uses: Use[]): string[] {
  return uses.flatMap((u) => {
    if (!u.voice || u.voice === 'brand' || NONE.has(u.value)) return []
    const token = tokenName(u.value)
    if (token === null) return []
    return TOKENS_BY_VOICE[u.voice].includes(token)
      ? []
      : [`${u.where}: the ${u.voice} voice is tracked with --tracking-${token}`]
  })
}

describe('the tracking scale', () => {
  it('has five tokens: meta and label for capitals in the label voice, display, title and name for headings', () => {
    const css = stylesheet()
    const root = new Map(
      [...css.matchAll(/--tracking-([a-z]+):\s*(-?[\d.]+)em;/g)].map((m) => [m[1], Number(m[2])] as const)
    )
    expect([...root.keys()].sort()).toEqual(['display', 'label', 'meta', 'name', 'title'])
    // The label voice is looser than the display's (a small capital needs air a large one does
    // not), and its two steps are ordered the way the roles are: a datum beside a name is tighter
    // than a label that is read or pressed.
    expect(root.get('meta')).toBeLessThan(root.get('label') as number)
    expect(root.get('display')).toBeLessThan(root.get('title') as number)
    expect(root.get('title')).toBeLessThan(root.get('name') as number)
  })

  it('is the only place a tracking number is typed in the app\'s own code', () => {
    const typed = [...inlineUses(), ...cssUses()].filter((u) => {
      if (tokenName(u.value) || NONE.has(u.value)) return false
      if (u.selector && BRAND_NAME_SELECTORS.has(u.selector)) return false
      if (u.file && BRAND_NAME_FILES.get(u.file) === u.value) return false
      return true
    })
    expect(
      typed.map((u) => `${u.where}: letter-spacing ${u.value}`),
      'Use a --tracking-* token. The label voice has two steps (meta 0.1em, label 0.14em) and the display voice three ' +
        '(0.01, 0.04 and 0.06em); a new number is a new step, and a new step is a decision for ADR 052, not for a component.'
    ).toEqual([])
  })

  it('gives each voice its own tokens, and running text none', () => {
    expect(
      wrongTokens([...inlineUses(), ...cssUses()]),
      'Capitals are tracked, and only capitals: the label voice takes meta or label, a heading takes display, title or name, ' +
        'and running text (the body voice) is never tracked.'
    ).toEqual([])
  })

  it('catches what it exists for: a typed number, and a tracked body voice', () => {
    // The scanner is shown to fail on the two shapes that shipped, so a refactor of it cannot
    // quietly turn the three tests above into assertions about nothing.
    const sample = `style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.08em' }}`
    const at = sample.indexOf('letterSpacing')
    expect(voiceOf(enclosingObject(sample, at))).toBe('body')
    expect(tokenName('0.08em')).toBeNull()
    expect(tokenName('var(--tracking-label)')).toBe('label')
    expect(TOKENS_BY_VOICE.body).toEqual([])
    const use = (voice: Voice, value: string): Use => ({ where: voice, value, voice })
    expect(wrongTokens([use('body', 'var(--tracking-meta)')]), 'running text tracked').toHaveLength(1)
    expect(wrongTokens([use('display', 'var(--tracking-label)')]), 'a heading with a label\'s spacing').toHaveLength(1)
    expect(wrongTokens([use('ui', 'var(--tracking-title)')]), 'a label with a heading\'s spacing').toHaveLength(1)
    expect(
      wrongTokens([use('body', '0'), use('ui', 'var(--tracking-meta)'), use('ui', 'var(--tracking-label)'), use('display', 'var(--tracking-name)')]),
      'each voice\'s own tokens pass'
    ).toEqual([])
    expect(inlineUses().length, 'the scan found the app\'s tracking declarations').toBeGreaterThan(20)
    expect(cssUses().length, 'the scan found the stylesheet\'s tracking declarations').toBeGreaterThan(10)
  })
})
