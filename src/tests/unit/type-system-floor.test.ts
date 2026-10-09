// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import GlobalError from '@/app/global-error'
import { renderGonePage } from '@/lib/http/goneResponse'
import { SITE_FACES, SITE_FACE_FILES, SITE_FACE_FONT_FACE_CSS, SITE_STACKS } from '@/lib/design/siteFace'

/**
 * **The browser draws only what the site shipped, and nothing the site draws is smaller than its
 * smallest label.** ([ADR 050](../../../docs/adr/050-one-face-means-no-borrowed-ones.md), carried
 * over to the three voices by ADR 051)
 *
 * A measurement of what Chrome actually used to draw every piece of text on 48 page states
 * (CDP `CSS.getPlatformFontsForNode`, 2026-10-09) found no fallback face under any text node: the
 * loader's two families drew all of it. It also found what a read of the CSS does not show, which
 * is that the *request* and the *face* had come apart:
 *
 * - `<strong>` (30 places) and `<th>` asked for weight 700, the browser's own default, and the
 *   site ships 400 and 500. Chrome smears the nearest face to fake a bold;
 * - the footer tagline on **every page** was `font-style: italic` in an upright gothic that has no
 *   italic, so Chrome sheared it into a slant;
 * - the 410 page that a retired URL answers with was set in `system-ui`, which is San Francisco
 *   on a Mac, Segoe on Windows and Roboto on Android, and the root error boundary named a family
 *   nothing defines, so it was plain `sans-serif`;
 * - a dozen labels were declared at 9–10.9px, three sizes below the smallest label token.
 *
 * `typography-weights.test.ts` already holds every *declared* weight to a shipped face. This holds
 * the rest: that nothing can be synthesised, that nothing is slanted, that no document outside the
 * layout names a system face, and that the label floor is a floor. `e2e/rendered-fonts.spec.ts`
 * measures the same in the browser, which is the only place a request and a face can be compared.
 */

const SRC = path.resolve(__dirname, '../..')
const ROOT = path.resolve(SRC, '..')
const GLOBALS = readFileSync(path.join(SRC, 'app/globals.css'), 'utf8')

/** Satori-rendered images carry their own font and units; they are not pages. */
const NOT_A_PAGE = /(opengraph-image|twitter-image|apple-icon|\/icon)\.tsx$/

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (['node_modules', '.next', 'tests', 'test'].includes(entry)) continue
      sourceFiles(full, found)
    } else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !NOT_A_PAGE.test(full)) {
      found.push(full)
    }
  }
  return found
}

const FILES = sourceFiles(SRC)
const rel = (file: string) => path.relative(ROOT, file)

describe('the scan sees the source', () => {
  it('reads the stylesheet, the pages and the library', () => {
    expect(FILES.length).toBeGreaterThan(60)
    expect(FILES.some((f) => f.endsWith('app/globals.css'))).toBe(true)
    expect(FILES.some((f) => f.endsWith('lib/http/goneResponse.ts'))).toBe(true)
    expect(FILES.some((f) => f.endsWith('app/global-error.tsx'))).toBe(true)
    expect(FILES.some((f) => /opengraph-image/.test(f))).toBe(false)
  })
})

describe('nothing is synthesised', () => {
  /** The declarations of the first rule whose selector is exactly `selector`. */
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return GLOBALS.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  }

  it('turns synthesis off at the root, so an unshipped weight or style is never faked', () => {
    expect(ruleBody('html')).toMatch(/font-synthesis:\s*none/)
  })

  it('asks for the shipped weight where the browser default asks for 700, in the file that has it', () => {
    expect(ruleBody('strong, b, th')).toMatch(/font-weight:\s*500/)
    expect(ruleBody('strong, b, th')).toMatch(/font-family:\s*var\(--font-body\)/)
  })

  it('asks for upright where the browser default asks for italic', () => {
    expect(ruleBody('em, i, cite, dfn, address, var')).toMatch(/font-style:\s*normal/)
  })

  it('finds no italic or oblique anywhere in the pages, the styles or the library', () => {
    const slanted: string[] = []
    for (const file of FILES) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/font-?[sS]tyle:\s*['"`]?(italic|oblique)/.test(line)) slanted.push(`${rel(file)}:${i + 1}  ${line.trim()}`)
        })
    }
    expect(
      slanted,
      'The site ships no italic face, so these are sheared upright letters. Nothing on it is slanted (ADR 050).'
    ).toEqual([])
  })
})

describe('a document outside the layout names no system face', () => {
  // `layout.tsx`'s `fallback:` lists are next/font's metric-matched stand-ins for the moment before
  // a face arrives, and `siteFace.ts` describes the old stacks in a comment.
  const ALLOWED = ['app/layout.tsx', 'lib/design/siteFace.ts']
  const SYSTEM = /system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica|ui-sans-serif/

  it('finds no system font in the source beyond the loader fallbacks', () => {
    const named: string[] = []
    for (const file of FILES) {
      if (ALLOWED.some((a) => file.endsWith(a))) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (SYSTEM.test(line)) named.push(`${rel(file)}:${i + 1}  ${line.trim().slice(0, 100)}`)
        })
    }
    expect(named).toEqual([])
  })

  it('sets the 410 page in the site faces, declared by the page itself', () => {
    const html = renderGonePage({ title: 'Gone', heading: 'This page is gone.', paragraphs: ['x'] })
    expect(html).toContain(SITE_FACE_FONT_FACE_CSS)
    expect(html).toContain(`font-family: ${SITE_STACKS.body}`)
    expect(html).toContain(`h1 { font-family: ${SITE_STACKS.display}`)
    expect(html).toContain('font-synthesis: none')
    expect(html).not.toMatch(SYSTEM)
  })

  it('sets the root error boundary in the site faces, with a button that names the label voice', () => {
    const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error('x'), reset: () => {} }))
    expect(html).toContain('@font-face')
    for (const { family } of SITE_FACES) expect(html, family).toContain(family)
    // A <button> does not inherit a font, so it names one; the attribute is HTML-escaped.
    expect(html).toMatch(/<button[^>]*font-family:(&quot;|")DM Sans/)
    expect(html).not.toMatch(SYSTEM)
  })
})

describe('the copies those documents load are the loader\'s files', () => {
  const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

  it('serves one face per voice, at a weight the site ships', () => {
    expect(SITE_FACE_FILES.map((f) => f.voice)).toEqual(['display', 'body', 'label'])
    expect(SITE_FACE_FILES.map((f) => f.weight)).toEqual([500, 300, 500])
    expect(SITE_FACE_FONT_FACE_CSS.match(/@font-face/g)).toHaveLength(3)
    expect(SITE_FACE_FONT_FACE_CSS).toContain('font-display:swap')
  })

  it('names no installed font in any stack: each ends in a generic keyword', () => {
    for (const stack of Object.values(SITE_STACKS)) expect(stack).toMatch(/, (serif|sans-serif)$/)
  })

  it.each(SITE_FACE_FILES)('public$url is byte-identical to the loader\'s $file', ({ url, file }) => {
    const served = path.join(ROOT, 'public', url)
    const loader = path.join(SRC, 'app/fonts', file)
    expect(sha(served)).toBe(sha(loader))
  })
})

describe('the label size is a floor', () => {
  const FLOOR_REM = (() => {
    const min = GLOBALS.match(/--text-xs:\s*clamp\(\s*([\d.]+)rem/)
    if (!min) throw new Error('globals.css no longer defines --text-xs as a clamp() in rem')
    return Number(min[1])
  })()
  const FLOOR_PX = FLOOR_REM * 16

  /** Every font size written as a literal, in px: the first argument of a clamp(), rem at 16. */
  function literalSizes(): { at: string; px: number }[] {
    const found: { at: string; px: number }[] = []
    const px = (value: string, unit: string) => Number(value) * (unit === 'rem' ? 16 : 1)
    for (const file of FILES) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const patterns = [
            /fontSize:\s*['"`]\s*(?:clamp\(\s*)?([\d.]+)(rem|px)/g,
            /font-size:\s*(?:clamp\(\s*)?([\d.]+)(rem|px)\b/g,
          ]
          for (const pattern of patterns) {
            for (const m of line.matchAll(pattern)) found.push({ at: `${rel(file)}:${i + 1}`, px: px(m[1], m[2]) })
          }
          for (const m of line.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\s*[,}]/g)) found.push({ at: `${rel(file)}:${i + 1}`, px: Number(m[1]) })
        })
    }
    return found
  }

  it('defines the smallest label at 11px or more', () => {
    expect(FLOOR_PX).toBeGreaterThanOrEqual(11)
  })

  it('sees the sizes it judges, so the floor is not checked against nothing', () => {
    const sizes = literalSizes()
    expect(sizes.length).toBeGreaterThan(20)
    expect(Math.max(...sizes.map((s) => s.px))).toBeGreaterThan(100)
  })

  it('declares no text below the label token\'s own minimum', () => {
    const small = literalSizes().filter((s) => s.px < FLOOR_PX - 0.001)
    expect(
      small.map((s) => `${s.at}  ${s.px}px`),
      `Anything smaller than --text-xs's minimum (${FLOOR_PX}px) is a one-off. Use var(--text-xs).`
    ).toEqual([])
  })
})
