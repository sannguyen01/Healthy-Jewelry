import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeSfnt, describeWoff2, uncoveredCharacters } from '@/lib/design/fontFile'
import { SITE_NAME } from '@/config/brand'

/**
 * The typefaces are six files in the repository, so what they are is checkable — read out of
 * their own tables, not taken from their names. See `src/app/fonts/README.md` for why the site
 * self-hosts one latin slice of each family, and `src/lib/design/fontFile.ts` for the reader.
 *
 * Three voices (ADR 051), each a family of static instances:
 * - **Bodoni Moda** speaks: the 96pt cut for display sizes, the 24pt cut for names and titles;
 * - **DM Sans** explains: 400 for running text, 500 for emphasis;
 * - **Barlow Condensed** labels, and sets the brand name (ADR 048).
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
  // A static instance files itself under the optical size it was cut at ("Bodoni Moda 96pt").
  'bodoni-moda-96pt': {
    family: 'Bodoni Moda 96pt',
    copyright: /^Copyright \d{4} The Bodoni Moda Project Authors/,
    licence: 'OFL-BodoniModa.txt',
  },
  'bodoni-moda-24pt': {
    family: 'Bodoni Moda 24pt',
    copyright: /^Copyright \d{4} The Bodoni Moda Project Authors/,
    licence: 'OFL-BodoniModa.txt',
  },
  'dm-sans-9pt': {
    family: 'DM Sans 9pt',
    copyright: /^Copyright \d{4} The DM Sans Project Authors/,
    licence: 'OFL-DMSans.txt',
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
      'bodoni-moda-24pt 400',
      'bodoni-moda-96pt 400',
      'dm-sans-9pt 400',
      'dm-sans-9pt 500',
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
    // Barlow's Medium files itself under a legacy family name ("… Medium"), as families with more
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

  it.each([...new Set(Object.values(FAMILIES).map((f) => f.licence))].map((licence) => [licence] as const))(
    '%s ships beside the files and reserves no font name',
    (licence) => {
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

describe('the share-card copies are the same faces as TrueType', () => {
  // Satori reads TTF and not WOFF2, so the cards bundle these (README, "The share-card copies").
  const PUBLIC = path.join(ROOT, 'public/fonts')
  const CARD_FONTS = [
    { file: 'bodoni-moda-96pt-400.ttf', family: /^Bodoni Moda/, weight: 400, key: 'bodoni-moda-96pt' as FamilyKey },
    { file: 'dm-sans-9pt-400.ttf', family: /^DM Sans/, weight: 400, key: 'dm-sans-9pt' as FamilyKey },
    { file: 'barlow-condensed-500.ttf', family: /^Barlow Condensed/, weight: 500, key: 'barlow-condensed' as FamilyKey },
  ]

  it('public/fonts holds exactly the three TrueType cards and the three WOFF2 copies, nothing else', () => {
    expect(readdirSync(PUBLIC).sort()).toEqual([
      'barlow-condensed-500.ttf',
      'barlow-condensed-latin-500.woff2',
      'bodoni-moda-24pt-latin-400.woff2',
      'bodoni-moda-96pt-400.ttf',
      'dm-sans-9pt-400.ttf',
      'dm-sans-9pt-latin-400.woff2',
    ])
  })

  it.each(CARD_FONTS.map((f) => [f.file] as const))('%s matches the SHA-256 the README records', (file) => {
    const digest = createHash('sha256').update(readFileSync(path.join(PUBLIC, file))).digest('hex')
    const row = README.split('\n').find((line) => line.includes(`\`${file}\``) && line.includes('|'))
    expect(row, `the README has no row for ${file}`).toBeDefined()
    expect(README.split('\n').filter((line) => line.includes(`\`${file}\``) && line.includes(digest))).toHaveLength(1)
  })

  it.each(CARD_FONTS.map((f) => [f.file, f] as const))('%s is the family, weight, licence and copyright it claims', (file, expected) => {
    const font = describeSfnt(readFileSync(path.join(PUBLIC, file)))
    expect(font.family).toMatch(expected.family)
    expect(font.weight).toBe(expected.weight)
    expect(font.licenseUrl).toMatch(/scripts\.sil\.org\/OFL/)
    expect(font.copyright).toMatch(FAMILIES[expected.key].copyright)
  })

  it.each(CARD_FONTS.map((f) => [f.file] as const))('%s draws printable ASCII and the typographic punctuation', (file) => {
    const { codepoints } = describeSfnt(readFileSync(path.join(PUBLIC, file)))
    let ascii = ''
    for (let code = 0x20; code <= 0x7e; code++) ascii += String.fromCharCode(code)
    expect(uncoveredCharacters(ascii + '\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00B7', codepoints)).toEqual([])
  })
})

describe('the brand name\'s face draws the brand name', () => {
  // Its one job (ADR 048). Both cases: the logotype renders in capitals through CSS, and a
  // screen reader or a copy-paste meets the name as written.
  it.each(ofFamily('barlow-condensed').map((f) => [f.file, f.font] as const))('%s', (_file, font) => {
    expect(uncoveredCharacters(`${SITE_NAME} ${SITE_NAME.toUpperCase()}`, font.codepoints)).toEqual([])
  })
})

describe('the faces draw every character the content can render', () => {
  // A character any one face lacks might be set in that face somewhere, so the safe set is the
  // intersection. The latin slices are one unicode-range, so in practice they are near-equal.
  const coverage: ReadonlySet<number> = fonts
    .map((f) => f.font.codepoints)
    .reduce((common, next) => new Set([...common].filter((cp) => next.has(cp))))

  it('covers printable ASCII in every file', () => {
    let ascii = ''
    for (let code = 0x20; code <= 0x7e; code++) ascii += String.fromCharCode(code)
    for (const { file, font } of fonts) expect(uncoveredCharacters(ascii, font.codepoints), file).toEqual([])
  })

  it('covers typographic punctuation the copy uses: quotes, dashes, the ellipsis, the bullet, the euro', () => {
    const punctuation = '\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u20AC\u00B7\u00D7'
    for (const { file, font } of fonts) expect(uncoveredCharacters(punctuation, font.codepoints), file).toEqual([])
  })

  it('covers every string in src/content, in every face', () => {
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
