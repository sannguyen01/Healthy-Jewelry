import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The fixed header's height is written once (ADR 054).
 *
 * It was typed as `64px` in about fifteen places, and as 104px, 120px and 100px (64 plus a gap) in a dozen
 * more, each a copy of a number the header owns. Change the header and every one of them is silently the wrong
 * size: content under the bar, or a gap that no longer means "clear of it". So there is one declaration, and
 * every place that needs to clear the bar reads it. The values are preserved arithmetically (`calc(var(--header-height) + 56px)`
 * is the 120px it replaced), so nothing moves on the page.
 */

const ROOT = resolve(__dirname, '../../..')
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const css = read('src/app/globals.css')

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry)
    if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, found)
    else if (/\.tsx?$/.test(entry)) found.push(rel)
  }
  return found
}

/** Without block and line comments, so a sentence that mentions the number is not a use of it. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('--header-height', () => {
  it('is declared once, in :root', () => {
    expect(css.match(/--header-height:\s*64px;/g)).toHaveLength(1)
    expect(css.match(/--header-height:/g)).toHaveLength(1)
  })

  it('is the height of the bar, the top edge of the menu and the foot of the hero\'s safe zone', () => {
    expect(css).toMatch(/\.hj-header \{[^}]*height: var\(--header-height\);/)
    expect(css).toMatch(/\.hj-menu-drawer \{[^}]*padding: calc\(var\(--header-height\) \+/)
    expect(css).toMatch(/\.hj-hero-safe \{[^}]*padding-top: calc\(var\(--header-height\)/)
    expect(css).toMatch(/\.hj-hero-end \{[^}]*bottom: var\(--header-height\);/)
  })

  it('is not typed as a literal in the stylesheet beside the places that read it', () => {
    const stylesheet = code(css)
    const withoutDeclaration = stylesheet.replace(/--header-height:\s*64px;/, '')
    // `min-height: 64px` on two other controls is theirs, not the header's: allowed by name.
    const offenders = withoutDeclaration
      .split('\n')
      .filter((line) => /\b64px\b/.test(line))
      .filter((line) => !/min-height:\s*64px/.test(line) && !/clamp\(/.test(line))
    expect(offenders, `a literal 64px where the header's height is meant:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('pages clear the bar through the token', () => {
  const pages = sources('src/app')

  it('finds the pages to scan', () => {
    expect(pages.length).toBeGreaterThan(15)
    expect(pages).toContain('src/app/page.tsx')
    expect(pages).toContain('src/app/not-found.tsx')
  })

  it('no page types the bar\'s height, or the bar plus a gap, as a pixel literal', () => {
    const offenders: string[] = []
    for (const file of pages) {
      const text = code(read(file))
      for (const match of text.matchAll(/(paddingTop|padding|marginTop|top):\s*'(?:64|100|104|120)px(?:\s[^']*)?'/g)) {
        offenders.push(`${relative('.', file)}: ${match[0]}`)
      }
    }
    expect(offenders, `header-clearing offsets typed as pixels:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('the pages that sit under the bar read the token', () => {
    for (const file of [
      'src/app/shop/page.tsx',
      'src/app/shop/[collection]/page.tsx',
      'src/app/products/[handle]/page.tsx',
      'src/app/not-found.tsx',
      'src/app/contact/page.tsx',
      'src/app/search/page.tsx',
    ]) {
      expect(code(read(file)), file).toContain('var(--header-height)')
    }
  })
})
