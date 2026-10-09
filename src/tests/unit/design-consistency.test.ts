import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { nameShownFromPx } from '@/lib/design/lockupBreakpoint'

/**
 * The design system's consistency decisions, read out of source.
 *
 * About 95% of this front end is inline `style={{}}`, so a token only helps if the literal it
 * replaced cannot quietly return. Each assertion below is a decision taken in the restyle
 * (calmer, more editorial: one section rhythm, one gutter, square product crops, a flat
 * header, no hover lift) and is written so that reverting the decision fails it by name.
 * Regex over source, so a count is a lower bound — see ADR 007.
 */
const ROOT = process.cwd()
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8')
const list = (rel: string): string[] =>
  readdirSync(join(ROOT, rel))
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => `${rel}/${name}`)

const HOME = list('src/components/home')
const SECTIONS = [
  'MaterialsSection',
  'CareSection',
  'HorizontalScroll',
  'CollectionGrid',
  'RealMoment',
  'FollowUp',
].map((name) => `src/components/home/${name}.tsx`)

describe('design consistency', () => {
  it('every homepage section takes its vertical padding from a rhythm token', () => {
    const offenders = SECTIONS.filter((file) => /padding:\s*'clamp\(/.test(read(file)))
    expect(offenders, 'a section hard-codes a clamp() padding again').toEqual([])
    for (const file of SECTIONS) {
      expect(read(file), `${file} does not use --space-section[-lg]`).toMatch(
        /var\(--space-section(-lg)?\)/
      )
    }
  })

  it('there is one horizontal gutter and no fallback literal that disagrees with it', () => {
    const files = [...HOME, ...list('src/components/layout')]
    const offenders = files.filter((file) => /var\(--space-gutter,\s*clamp/.test(read(file)))
    expect(offenders).toEqual([])
  })

  it('product media takes the listing crop token, never a fixed pixel height', () => {
    for (const file of ['src/components/product/ProductCard.tsx', 'src/components/home/HorizontalScroll.tsx']) {
      const source = read(file)
      expect(source, `${file} lost the product ratio token`).toContain('var(--ratio-product)')
      expect(source, `${file} has a fixed-height image box again`).not.toMatch(
        /height:\s*'(280|300)px'/
      )
    }
  })

  it('the homepage has one listing crop: product cards, collection tiles and material tiles agree', () => {
    // ADR 044. The strip of product cards sat square between two rows of 3:4 tiles; the
    // token and the two literal crops are held to one value so that cannot recur unnoticed.
    const token = read('src/app/globals.css').match(/--ratio-product:\s*([\d.]+\s*\/\s*[\d.]+);/)?.[1]
    expect(token, '--ratio-product is not a ratio in globals.css').toBeDefined()
    const normalise = (ratio: string) => ratio.replace(/\s+/g, '')
    for (const file of ['src/components/home/CollectionGrid.tsx', 'src/components/home/MaterialsSection.tsx']) {
      const crop = read(file).match(/aspectRatio:\s*'([^']+)'/)?.[1]
      expect(crop, `${file} has no aspectRatio`).toBeDefined()
      expect(normalise(crop as string), `${file} crops differently from --ratio-product`).toBe(normalise(token as string))
    }
  })

  it('cards do not lift on hover', () => {
    for (const file of ['src/components/product/ProductCard.tsx', 'src/components/home/HorizontalScroll.tsx']) {
      expect(read(file), `${file} translates on hover`).not.toMatch(/translateY\(-\d/)
    }
  })

  it('the header and drawer are flat: solid fills, a hairline, no blur and no shadow', () => {
    const css = read('src/app/globals.css')
    const header = css.slice(css.indexOf('.hj-header[data-state="solid"]'))
    const solidRule = header.slice(0, header.indexOf('}'))
    expect(solidRule).not.toMatch(/backdrop-filter:\s*blur/)
    expect(solidRule).not.toMatch(/box-shadow:\s*0/)
    const drawer = css.slice(css.indexOf('.hj-menu-drawer {'))
    expect(drawer.slice(0, drawer.indexOf('}'))).not.toMatch(/backdrop-filter:\s*blur/)
  })

  it('the footer is a brand column plus three link groups', () => {
    expect(read('src/components/layout/Footer.tsx')).toContain("'1.4fr repeat(3, 1fr)'")
  })

  it('header controls clear the 44px touch target', () => {
    const css = read('src/app/globals.css')
    const rule = css.slice(css.indexOf('.hj-menu-btn, .hj-icon-btn, .hj-wordmark {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/min-height:\s*44px/)
  })

  it('the rhythm tokens exist', () => {
    const css = read('src/app/globals.css')
    for (const token of [
      '--space-section',
      '--space-section-lg',
      '--space-section-sm',
      '--space-page-top',
      '--ratio-product',
      '--tracking-label',
    ]) {
      expect(css, `${token} missing from :root`).toMatch(new RegExp(`${token}:`))
    }
  })
})

/**
 * **DESIGN.md may only say what the code does.**
 *
 * Its first draft (0fd2f40) prescribed `backdrop-filter: blur(12px)` on the scrolled header and
 * rounded cards with a whisper `box-shadow` — the two things the assertions above forbid — and
 * "density 4, variance 8, motion 6", which no reader could check. A design document that
 * disagrees with the tests is a second design system, and the next contributor gets to pick.
 * These hold the rewrite to the code: no forbidden prescription returns, every file it cites as
 * an enforcer exists, and every pixel figure it states is read back out of the stylesheet.
 */
describe('DESIGN.md agrees with the code', () => {
  const doc = read('DESIGN.md')
  const css = read('src/app/globals.css')

  it('does not prescribe what this file forbids', () => {
    expect(doc).not.toMatch(/backdrop-filter:\s*blur/)
    expect(doc).not.toMatch(/box-shadow:\s*\d/)
    expect(doc).not.toMatch(/glassmorphism/i)
    expect(doc).not.toMatch(/\b(density|variance|motion)\b[^.\n]*\(\d+\)|set to a balanced/i)
  })

  it('names only enforcers that exist', () => {
    const cited = [
      ...doc.matchAll(/`((?:src|e2e|scripts|assets|docs)\/[^`\s]+\.[a-z]+)`/g),
      ...doc.matchAll(/\]\(((?:docs)\/[^)\s]+\.md)\)/g),
    ].map((m) => m[1])
    expect(cited.length, 'the document cites no files — the parse is wrong').toBeGreaterThan(10)
    const missing = cited.filter((path) => {
      try {
        read(path)
        return false
      } catch {
        return true
      }
    })
    expect(missing).toEqual([])
  })

  it('states each pixel figure as the stylesheet does', () => {
    const fromCss: Record<string, string | undefined> = {
      // "below 360px the mark stands alone": the name is display:none up to 359px.
      '360px': `${nameShownFromPx(css)}px`,
      // "at least 44px": the shared header-control rule.
      '44px': css
        .slice(css.indexOf('.hj-menu-btn, .hj-icon-btn, .hj-wordmark {'))
        .match(/min-height:\s*(\d+px)/)?.[1],
      // "a 2px --ink outline": the global focus ring.
      '2px': css.slice(css.indexOf(':focus-visible {')).match(/outline:\s*(\d+px) solid var\(--ink\)/)?.[1],
    }
    const stated = [...new Set([...doc.matchAll(/(\d+)px/g)].map((m) => `${m[1]}px`))].sort()
    expect(stated, 'a pixel figure in DESIGN.md with no source to check it against').toEqual(
      Object.keys(fromCss).sort()
    )
    for (const [figure, actual] of Object.entries(fromCss)) expect(actual, figure).toBe(figure)
  })
})

describe('nameShownFromPx', () => {
  it('reads the width from which the name is shown', () => {
    const css = '@media (max-width: 359px) {\n  .hj-lockup[data-variant="inline"] .hj-lockup-text {\n    display: none;\n  }\n}'
    expect(nameShownFromPx(css)).toBe(360)
  })

  it('returns undefined, not a default, when the rule is gone', () => {
    expect(nameShownFromPx('.hj-lockup-text { display: none; }')).toBeUndefined()
    expect(nameShownFromPx('')).toBeUndefined()
  })
})
