import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeWoff2, uncoveredCharacters } from '@/lib/design/fontFile'
import { SITE_NAME } from '@/config/brand'

/**
 * The typefaces are four files in the repository, so what they are is checkable — read out of
 * their own tables, not taken from their names. See `src/app/fonts/README.md` for why the site
 * self-hosts one latin slice of each family, and `src/lib/design/fontFile.ts` for the reader.
 *
 * Two families, each with one job:
 * - **Zen Kaku Gothic Antique** sets every role of the site's text (ADR 043);
 * - **Barlow Condensed** sets the brand name and nothing else: the typography it had before the
 *   Songmont reference, kept by the owner's ruling (ADR 048).
 *
 * Each block here answers a question no other gate asks:
 * - is each file the weight `layout.tsx` tells the browser it is (a mislabelled file renders
 *   the wrong weight silently — `typography-weights.test.ts` only knows what was *declared*);
 * - is it the file the README's provenance describes, under the licence shipped beside it;
 * - does it draw every character its role can put on a page.
 */

const ROOT = path.resolve(__dirname, '../../..')
const FONTS = path.join(ROOT, 'src/app/fonts')
const LAYOUT = readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8')
const README = readFileSync(path.join(FONTS, 'README.md'), 'utf8')

/** Each family the site ships, keyed by its files' prefix. */
const FAMILIES = {
  'zen-kaku-gothic-antique': {
    family: 'Zen Kaku Gothic Antique',
    copyright: /^Copyright \d{4} The Zen Project Authors/,
    licence: 'OFL.txt',
  },
  'barlow-condensed': {
    family: 'Barlow Condensed',
    copyright: /^Copyright \d{4} The Barlow Project Authors/,
    licence: 'OFL-BarlowCondensed.txt',
  },
} as const
type FamilyKey = keyof typeof FAMILIES

const familyOf = (file: string): FamilyKey => {
  const key = (Object.keys(FAMILIES) as FamilyKey[]).find((k) => file.startsWith(`${k}-`))
  if (!key) throw new Error(`${file} belongs to no family this test knows`)
  return key
}

/** `{ path: './fonts/x.woff2', weight: '400' … }` entries of every `localFont` call. */
const declared = [...LAYOUT.matchAll(/\{\s*path:\s*'\.\/fonts\/([^']+)',\s*weight:\s*'(\d{3})'/g)].map((m) => ({
  file: m[1],
  weight: Number(m[2]),
}))

const fonts = declared.map(({ file, weight }) => {
  const bytes = readFileSync(path.join(FONTS, file))
  return { file, weight, key: familyOf(file), bytes, font: describeWoff2(bytes) }
})

const ofFamily = (key: FamilyKey) => fonts.filter((f) => f.key === key)

describe('the font files are what layout.tsx says they are', () => {
  it('finds the loader entries, so every check below has something to check', () => {
    expect(declared.map((d) => `${familyOf(d.file)} ${d.weight}`).sort()).toEqual([
      'barlow-condensed 400',
      'barlow-condensed 500',
      'zen-kaku-gothic-antique 400',
      'zen-kaku-gothic-antique 500',
    ])
  })

  it('ships exactly the declared files, so none is left behind unused or loaded unlisted', () => {
    const shipped = readdirSync(FONTS).filter((f) => f.endsWith('.woff2')).sort()
    expect(shipped).toEqual(declared.map((d) => d.file).sort())
  })

  it.each(declared.map((d) => [d.file, d.weight] as const))('%s is weight class %i, as declared', (file, weight) => {
    const found = fonts.find((f) => f.file === file)
    expect(found?.font.weight).toBe(weight)
  })

  it('every file is the family its name says', () => {
    // Medium files itself under a legacy family name ("… Medium"), as families with more
    // than four styles do when they carry no typographic family (name ID 16).
    for (const { file, key, font } of fonts) expect(font.family.startsWith(FAMILIES[key].family), file).toBe(true)
  })
})

describe('provenance and licence', () => {
  it.each(declared.map((d) => [d.file] as const))('%s matches the SHA-256 the README records', (file) => {
    const digest = createHash('sha256').update(readFileSync(path.join(FONTS, file))).digest('hex')
    const row = README.split('\n').find((line) => line.includes(`\`${file}\``))
    expect(row, `the README has no row for ${file}`).toBeDefined()
    expect(row).toContain(digest)
  })

  it('each file carries the SIL Open Font License URL and its project\'s copyright', () => {
    for (const { file, key, font } of fonts) {
      expect(font.licenseUrl, file).toMatch(/scripts\.sil\.org\/OFL/)
      expect(font.copyright, file).toMatch(FAMILIES[key].copyright)
      // The README quotes the copyright exactly as the files state it.
      expect(README).toContain(font.copyright)
    }
  })

  it.each(Object.values(FAMILIES).map((f) => [f.family, f.licence] as const))(
    '%s: its OFL ships beside the files and reserves no font name',
    (_family, licence) => {
      const ofl = path.join(FONTS, licence)
      expect(existsSync(ofl), licence).toBe(true)
      const text = readFileSync(ofl, 'utf8')
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1')
      // A Reserved Font Name is declared in the copyright header, above the licence body. With
      // one, a modified (even re-subset) copy could not be distributed under this name.
      const header = text.slice(0, text.indexOf('-----'))
      expect(header).not.toMatch(/Reserved Font Name/i)
    }
  )
})

describe('the brand name\'s face draws the brand name', () => {
  // Its one job (ADR 048). Both cases: the logotype renders in capitals through CSS, and a
  // screen reader or a copy-paste meets the name as written.
  it.each(ofFamily('barlow-condensed').map((f) => [f.file, f.font] as const))('%s', (_file, font) => {
    expect(uncoveredCharacters(`${SITE_NAME} ${SITE_NAME.toUpperCase()}`, font.codepoints)).toEqual([])
  })
})

describe('the face draws every character the content can render', () => {
  const coverage = ofFamily('zen-kaku-gothic-antique')[0].font.codepoints

  it('every weight covers the same characters, so coverage is one question', () => {
    for (const { file, font } of ofFamily('zen-kaku-gothic-antique')) expect([...font.codepoints].sort(), file).toEqual([...coverage].sort())
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
