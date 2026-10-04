import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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

  it('product media is square, never a fixed pixel height', () => {
    for (const file of ['src/components/product/ProductCard.tsx', 'src/components/home/HorizontalScroll.tsx']) {
      const source = read(file)
      expect(source, `${file} lost the product ratio token`).toContain('var(--ratio-product)')
      expect(source, `${file} has a fixed-height image box again`).not.toMatch(
        /height:\s*'(280|300)px'/
      )
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
      '--line',
    ]) {
      expect(css, `${token} missing from :root`).toMatch(new RegExp(`${token}:`))
    }
  })
})
