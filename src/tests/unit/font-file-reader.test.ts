import { brotliCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  cmapCodepoints,
  describeWoff2,
  nameStrings,
  readWoff2Tables,
  uncoveredCharacters,
} from '@/lib/design/fontFile'

/**
 * The reader in `src/lib/design/fontFile.ts`, against fonts built here byte by byte. The real
 * files (`font-files.test.ts`) exercise only the paths their encoder happened to take — a
 * format 4 `cmap`, Windows names, a transformed `glyf` — so every other branch a different
 * font could take is constructed here, each failure included.
 */

/** WOFF2 known-tag indices used below (W3C WOFF2 §5.1). */
const TAG = { cmap: 0, hmtx: 3, name: 5, 'OS/2': 6, glyf: 10, loca: 11, ARBITRARY: 63 } as const

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]

function base128(n: number): number[] {
  const out = [n & 0x7f]
  for (let rest = n >>> 7; rest; rest >>>= 7) out.unshift((rest & 0x7f) | 0x80)
  return out
}

interface TableSpec {
  /** A known tag's index, or `ARBITRARY` with `tag` spelled out. */
  index: number
  tag?: string
  data: number[]
  /** WOFF2 transform version (bits 6–7 of the flags byte). */
  transform?: number
  /** Whether the directory carries a transformLength for this table. */
  transformed?: boolean
}

function woff2(tables: TableSpec[], { flavor = 0x00010000, truncateBy = 0 } = {}): Uint8Array {
  const directory: number[] = []
  for (const t of tables) {
    directory.push(((t.transform ?? 0) << 6) | t.index)
    if (t.index === TAG.ARBITRARY) directory.push(...[...(t.tag ?? '')].map((c) => c.charCodeAt(0)))
    directory.push(...base128(t.data.length + (t.transformed ? 100 : 0)))
    if (t.transformed) directory.push(...base128(t.data.length))
  }
  const stream = brotliCompressSync(Uint8Array.from(tables.flatMap((t) => t.data)))
  const header = [
    ...u32(0x774f4632), ...u32(flavor), ...u32(0), ...u16(tables.length), ...u16(0),
    ...u32(0), ...u32(stream.length), ...u16(1), ...u16(0), ...u32(0), ...u32(0), ...u32(0),
    ...u32(0), ...u32(0),
  ]
  const bytes = Uint8Array.from([...header, ...directory, ...stream])
  return truncateBy ? bytes.subarray(0, bytes.length - truncateBy) : bytes
}

/** A format 4 subtable: [first, last, delta] segments with idRangeOffset 0, plus `glyphArray`. */
function format4(segments: { first: number; last: number; delta?: number; glyphs?: number[] }[]): number[] {
  const all = [...segments, { first: 0xffff, last: 0xffff, delta: 1 }]
  const n = all.length
  const ends = all.flatMap((s) => u16(s.last))
  const starts = all.flatMap((s) => u16(s.first))
  const deltas = all.flatMap((s) => u16((s.delta ?? 0) & 0xffff))
  // idRangeOffset is measured from its own position to the segment's first glyph-array entry.
  const glyphArray: number[] = []
  const offsets = all.flatMap((s, i) => {
    if (!s.glyphs) return u16(0)
    const offset = (n - i) * 2 + glyphArray.length * 2
    glyphArray.push(...s.glyphs)
    return u16(offset)
  })
  const body = [...u16(n * 2), ...u16(0), ...u16(0), ...u16(0), ...ends, ...u16(0), ...starts, ...deltas, ...offsets, ...glyphArray.flatMap(u16)]
  return [...u16(4), ...u16(body.length + 6), ...u16(0), ...body]
}

function format12(groups: [number, number, number][]): number[] {
  return [...u16(12), ...u16(0), ...u32(16 + groups.length * 12), ...u32(0), ...u32(groups.length), ...groups.flatMap((g) => g.flatMap(u32))]
}

function cmap(subtables: { platform: number; encoding: number; data: number[] }[]): number[] {
  let offset = 4 + subtables.length * 8
  const records = subtables.flatMap((s) => {
    const record = [...u16(s.platform), ...u16(s.encoding), ...u32(offset)]
    offset += s.data.length
    return record
  })
  return [...u16(0), ...u16(subtables.length), ...records, ...subtables.flatMap((s) => s.data)]
}

function name(records: { platform: number; encoding: number; language: number; id: number; text: string }[]): number[] {
  const encoded = records.map((r) =>
    r.platform === 3 ? [...r.text].flatMap((c) => u16(c.charCodeAt(0))) : [...r.text].map((c) => c.charCodeAt(0))
  )
  let offset = 0
  const headers = records.flatMap((r, i) => {
    const row = [...u16(r.platform), ...u16(r.encoding), ...u16(r.language), ...u16(r.id), ...u16(encoded[i].length), ...u16(offset)]
    offset += encoded[i].length
    return row
  })
  return [...u16(0), ...u16(records.length), ...u16(6 + records.length * 12), ...headers, ...encoded.flat()]
}

const os2 = (weight: number) => [...u16(4), ...u16(500), ...u16(weight), ...new Array(90).fill(0)]

const win = (id: number, text: string) => ({ platform: 3, encoding: 1, language: 0x409, id, text })
const mac = (id: number, text: string) => ({ platform: 1, encoding: 0, language: 0, id, text })

describe('readWoff2Tables', () => {
  it('reads known and arbitrary tags, skipping transformed tables by their stored length', () => {
    const tables = readWoff2Tables(
      woff2([
        { index: TAG.glyf, data: [1, 2, 3], transform: 0, transformed: true }, // version 0: transformed
        { index: TAG.loca, data: [4], transform: 3 }, // version 3: stored as-is
        { index: TAG.hmtx, data: [5, 6], transform: 1, transformed: true }, // version 1: transformed
        { index: TAG.ARBITRARY, tag: 'Zzzz', data: [7, 8] },
      ])
    )
    expect([...tables.keys()]).toEqual(['glyf', 'loca', 'hmtx', 'Zzzz'])
    expect([...(tables.get('Zzzz') ?? [])]).toEqual([7, 8])
    expect([...(tables.get('hmtx') ?? [])]).toEqual([5, 6])
  })

  it.each([
    ['a file shorter than its header', new Uint8Array(10), /shorter than its header/],
    ['a bad signature', Uint8Array.from({ length: 48 }, () => 0), /bad signature/],
    ['a font collection', woff2([], { flavor: 0x74746366 }), /collections are not supported/],
    ['a directory that runs out', woff2([{ index: TAG.cmap, data: [] }]).subarray(0, 48), /runs past the end/],
    ['an arbitrary tag that runs out', woff2([{ index: TAG.ARBITRARY, tag: 'Zz', data: [] }]).subarray(0, 51), /runs past the end/],
    ['a stream that runs out', woff2([{ index: TAG.cmap, data: [1, 2, 3, 4] }], { truncateBy: 2 }), /compressed stream runs past/],
  ])('rejects %s', (_label, bytes, message) => {
    expect(() => readWoff2Tables(bytes)).toThrow(message)
  })

  it('rejects a table longer than the decompressed stream', () => {
    const bytes = woff2([{ index: TAG.cmap, data: [1, 2] }])
    bytes[48 + 1] = 9 // origLength 2 → 9
    expect(() => readWoff2Tables(bytes)).toThrow(/runs past the decompressed stream/)
  })

  it.each([
    ['a leading zero byte', [0x80, 0x01], /leading zero/],
    ['more than five bytes', [0x81, 0x81, 0x81, 0x81, 0x81, 0x01], /longer than five bytes/],
    ['a value past 32 bits', [0x9f, 0xff, 0xff, 0xff, 0x7f], /overflows 32 bits/],
    ['a value that runs out', [0x81], /runs past the end/],
  ])('rejects a UIntBase128 with %s', (_label, encoded, message) => {
    const header = woff2([{ index: TAG.cmap, data: [] }]).subarray(0, 48)
    expect(() => readWoff2Tables(Uint8Array.from([...header, TAG.cmap, ...encoded]))).toThrow(message)
  })
})

describe('cmapCodepoints', () => {
  it('reads format 4 deltas and glyph arrays, dropping code points mapped to glyph 0', () => {
    const table = cmap([
      {
        platform: 3,
        encoding: 1,
        data: format4([
          { first: 0x41, last: 0x43, delta: -0x40 }, // A–C → 1–3
          { first: 0x61, last: 0x63, glyphs: [7, 0, 9] }, // a, c mapped; b → .notdef
          { first: 0x30, last: 0x30, delta: -0x30 }, // '0' → glyph 0 by delta
        ]),
      },
    ])
    expect([...cmapCodepoints(Uint8Array.from(table))].sort((a, b) => a - b)).toEqual([0x41, 0x42, 0x43, 0x61, 0x63])
  })

  it('prefers the full-repertoire subtable over the BMP one', () => {
    const table = cmap([
      { platform: 3, encoding: 1, data: format4([{ first: 0x41, last: 0x41, delta: 1 }]) },
      { platform: 3, encoding: 10, data: format12([[0x1f600, 0x1f601, 5], [0x20, 0x20, 0]]) },
    ])
    expect([...cmapCodepoints(Uint8Array.from(table))]).toEqual([0x1f600, 0x1f601])
  })

  it('fails without a Unicode subtable rather than reporting an empty face', () => {
    expect(() => cmapCodepoints(Uint8Array.from(cmap([{ platform: 1, encoding: 0, data: format4([]) }])))).toThrow(
      /no Unicode subtable/
    )
  })

  it('fails on a Unicode subtable in a format it does not read', () => {
    expect(() => cmapCodepoints(Uint8Array.from(cmap([{ platform: 0, encoding: 3, data: [...u16(6), 0, 0] }])))).toThrow(
      /unsupported format 6/
    )
  })
})

describe('nameStrings', () => {
  it('prefers Windows English and falls back to Mac Roman, ignoring other languages', () => {
    const names = nameStrings(
      Uint8Array.from(
        name([
          mac(1, 'Mac Family'),
          mac(2, 'Mac Style'),
          win(1, 'Win Family'),
          { platform: 3, encoding: 1, language: 0x411, id: 2, text: 'JA Style' },
        ])
      )
    )
    expect(names.get(1)).toBe('Win Family')
    expect(names.get(2)).toBe('Mac Style')
  })
})

describe('describeWoff2', () => {
  const font = (names: ReturnType<typeof win>[]) =>
    woff2([
      { index: TAG.cmap, data: cmap([{ platform: 0, encoding: 3, data: format4([{ first: 0x41, last: 0x41, delta: 1 }]) }]) },
      { index: TAG.name, data: name(names) },
      { index: TAG['OS/2'], data: os2(300) },
    ])

  it('reads identity, weight, licence and coverage', () => {
    const described = describeWoff2(
      font([win(0, '(c) Someone'), win(1, 'Legacy Light'), win(2, 'Regular'), win(13, 'OFL'), win(14, 'https://scripts.sil.org/OFL'), win(16, 'Family'), win(17, 'Light')])
    )
    expect(described).toMatchObject({ family: 'Family', subfamily: 'Light', weight: 300, copyright: '(c) Someone', license: 'OFL' })
    expect([...described.codepoints]).toEqual([0x41])
  })

  it('falls back to the legacy family, and to empty strings for absent names', () => {
    const described = describeWoff2(font([win(1, 'Legacy Light')]))
    expect(described).toMatchObject({ family: 'Legacy Light', subfamily: '', copyright: '', license: '', licenseUrl: '' })
    expect(describeWoff2(font([])).family).toBe('')
  })

  it('names the table that is missing', () => {
    expect(() => describeWoff2(woff2([{ index: TAG.cmap, data: [] }]))).toThrow(/no name table/)
  })
})

describe('uncoveredCharacters', () => {
  it('lists each missing character once, in order, skipping whitespace and controls', () => {
    const covered = new Set([...'abc'].map((c) => c.codePointAt(0) as number))
    expect(uncoveredCharacters('a → b\n\t×→‍c ✓', covered)).toEqual(['→', '×', '✓'])
  })
})
