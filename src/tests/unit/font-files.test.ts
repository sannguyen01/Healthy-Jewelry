import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeWoff2, uncoveredCharacters } from '@/lib/design/fontFile'

/**
 * The typeface is two files in the repository, so what they are is checkable — read out of
 * their own tables, not taken from their names. See `src/app/fonts/README.md` for why the site
 * self-hosts one slice of a CJK family, and `src/lib/design/fontFile.ts` for the reader.
 *
 * Each block here answers a question no other gate asks:
 * - is each file the weight `layout.tsx` tells the browser it is (a mislabelled file renders
 *   the wrong weight silently — `typography-weights.test.ts` only knows what was *declared*);
 * - is it the file the README's provenance describes, under the licence shipped beside it;
 * - does it draw every character the content can put on a page.
 */

const ROOT = path.resolve(__dirname, '../../..')
const FONTS = path.join(ROOT, 'src/app/fonts')
const LAYOUT = readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8')
const README = readFileSync(path.join(FONTS, 'README.md'), 'utf8')
const FAMILY = 'Zen Kaku Gothic Antique'

/** `{ path: './fonts/x.woff2', weight: '400' … }` entries of the `localFont` call. */
const declared = [...LAYOUT.matchAll(/\{\s*path:\s*'\.\/fonts\/([^']+)',\s*weight:\s*'(\d{3})'/g)].map((m) => ({
  file: m[1],
  weight: Number(m[2]),
}))

const fonts = declared.map(({ file, weight }) => {
  const bytes = readFileSync(path.join(FONTS, file))
  return { file, weight, bytes, font: describeWoff2(bytes) }
})

describe('the font files are what layout.tsx says they are', () => {
  it('finds the loader entries, so every check below has something to check', () => {
    expect(declared.map((d) => d.weight)).toEqual([400, 500])
  })

  it('ships exactly the declared files, so none is left behind unused or loaded unlisted', () => {
    const shipped = readdirSync(FONTS).filter((f) => f.endsWith('.woff2')).sort()
    expect(shipped).toEqual(declared.map((d) => d.file).sort())
  })

  it.each(declared.map((d) => [d.file, d.weight] as const))('%s is weight class %i, as declared', (file, weight) => {
    const found = fonts.find((f) => f.file === file)
    expect(found?.font.weight).toBe(weight)
  })

  it('every file is the brand family', () => {
    // Medium files itself under a legacy family name ("… Medium"), as families with more
    // than four styles do when they carry no typographic family (name ID 16).
    for (const { file, font } of fonts) expect(font.family.startsWith(FAMILY), file).toBe(true)
  })
})

describe('provenance and licence', () => {
  it.each(declared.map((d) => [d.file] as const))('%s matches the SHA-256 the README records', (file) => {
    const digest = createHash('sha256').update(readFileSync(path.join(FONTS, file))).digest('hex')
    const row = README.split('\n').find((line) => line.includes(`\`${file}\``))
    expect(row, `the README has no row for ${file}`).toBeDefined()
    expect(row).toContain(digest)
  })

  it('each file carries the SIL Open Font License URL and the Zen Project copyright', () => {
    for (const { file, font } of fonts) {
      expect(font.licenseUrl, file).toMatch(/scripts\.sil\.org\/OFL/)
      expect(font.copyright, file).toMatch(/^Copyright \d{4} The Zen Project Authors/)
      // The README quotes the copyright exactly as the files state it.
      expect(README).toContain(font.copyright)
    }
  })

  it('OFL.txt ships beside the files and reserves no font name', () => {
    const ofl = path.join(FONTS, 'OFL.txt')
    expect(existsSync(ofl)).toBe(true)
    const text = readFileSync(ofl, 'utf8')
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
    // A Reserved Font Name is declared in the copyright header, above the licence body. With
    // one, a modified (even re-subset) copy could not be distributed under this name.
    const header = text.slice(0, text.indexOf('-----'))
    expect(header).not.toMatch(/Reserved Font Name/i)
  })
})

describe('the face draws every character the content can render', () => {
  const coverage = fonts[0].font.codepoints

  it('every weight covers the same characters, so coverage is one question', () => {
    for (const { file, font } of fonts) expect([...font.codepoints].sort(), file).toEqual([...coverage].sort())
  })

  it('covers printable ASCII', () => {
    let ascii = ''
    for (let code = 0x20; code <= 0x7e; code++) ascii += String.fromCharCode(code)
    expect(uncoveredCharacters(ascii, coverage)).toEqual([])
  })

  it('covers every string in src/content', () => {
    const strings: string[] = []
    const collect = (value: unknown) => {
      if (typeof value === 'string') strings.push(value)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry.endsWith('.json')) collect(JSON.parse(readFileSync(full, 'utf8')))
      }
    }
    walk(path.join(ROOT, 'src/content'))
    expect(strings.length).toBeGreaterThan(100)
    expect(uncoveredCharacters(strings.join('\n'), coverage)).toEqual([])
  })
})
