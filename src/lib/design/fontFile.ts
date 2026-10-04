import { brotliDecompressSync } from 'node:zlib'

/**
 * What a shipped font file actually contains, read out of its own tables rather than taken
 * from its filename or the loader's say-so.
 *
 * Three questions a stylesheet cannot answer and a browser answers silently:
 *
 * - **Which characters it draws** (`cmap`). A character the face lacks is not an error: the
 *   browser takes it from the next family in the stack, so one arrow or one accented name
 *   renders in Arial in the middle of a line set in the brand face. The site self-hosts the
 *   *latin* slice of its typeface on purpose (see `src/app/fonts/README.md`), which makes
 *   "is every character we render inside that slice" a real question.
 * - **Which weight it is** (`OS/2.usWeightClass`). `next/font/local` believes the weight it is
 *   told. A 400 file declared as 500 renders as 400 wherever 500 is asked for, and nothing
 *   synthesises or warns — the same failure `typography-weights.test.ts` exists for, one
 *   layer down.
 * - **What it is and under which licence** (`name`). Redistributing a font is a licence
 *   question; the file carries its own answer.
 *
 * Only WOFF2 is read, because only WOFF2 ships. The parser is the minimum the three questions
 * need: the table directory, the Brotli stream, and the `cmap` (formats 4 and 12), `name` and
 * `OS/2` tables. It never reconstructs glyph outlines, so the transformed `glyf`/`loca`/`hmtx`
 * tables are skipped by their stored lengths without being decoded.
 *
 * Node-only (it uses `node:zlib`): imported by tests and E2E specs, never by the app.
 */

export interface FontDescription {
  family: string
  subfamily: string
  /** `OS/2.usWeightClass` — 300 for Light, 400 Regular, 500 Medium. */
  weight: number
  copyright: string
  license: string
  licenseUrl: string
  /** Every Unicode code point the `cmap` maps to a real glyph (glyph 0, `.notdef`, excluded). */
  codepoints: ReadonlySet<number>
}

/**
 * The 63 tags WOFF2 encodes as a 6-bit index instead of spelling out, in the order the
 * specification lists them (W3C WOFF2, §5.1, "Known Table Tags"). Index 63 means "an
 * arbitrary tag follows as four bytes".
 */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
] as const

const WOFF2_SIGNATURE = 0x774f4632 // 'wOF2'
const TTC_FLAVOR = 0x74746366 // 'ttcf'
const HEADER_BYTES = 48

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** WOFF2's variable-length unsigned integer: 7 bits per byte, high bit set on all but the last. */
function readUIntBase128(bytes: Uint8Array, at: number): { value: number; next: number } {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (at + i >= bytes.length) throw new Error('woff2: table directory runs past the end of the file')
    const byte = bytes[at + i]
    // A leading 0x80 would encode the same number in more bytes than needed; the spec forbids it.
    if (i === 0 && byte === 0x80) throw new Error('woff2: UIntBase128 with a leading zero byte')
    if (value & 0xfe000000) throw new Error('woff2: UIntBase128 overflows 32 bits')
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: at + i + 1 }
  }
  throw new Error('woff2: UIntBase128 longer than five bytes')
}

/** Every table, decompressed, by tag. Transformed tables come back in their transformed form. */
export function readWoff2Tables(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length < HEADER_BYTES) throw new Error('woff2: file is shorter than its header')
  const header = view(bytes)
  if (header.getUint32(0) !== WOFF2_SIGNATURE) throw new Error('woff2: not a WOFF2 file (bad signature)')
  if (header.getUint32(4) === TTC_FLAVOR) throw new Error('woff2: font collections are not supported')
  const numTables = header.getUint16(12)
  const compressedLength = header.getUint32(20)

  const entries: { tag: string; length: number }[] = []
  let at = HEADER_BYTES
  for (let t = 0; t < numTables; t++) {
    if (at >= bytes.length) throw new Error('woff2: table directory runs past the end of the file')
    const flags = bytes[at++]
    const tagIndex = flags & 0x3f
    const transform = flags >> 6
    let tag: string
    if (tagIndex === 63) {
      if (at + 4 > bytes.length) throw new Error('woff2: table directory runs past the end of the file')
      tag = String.fromCharCode(...bytes.subarray(at, at + 4))
      at += 4
    } else {
      tag = KNOWN_TAGS[tagIndex]
    }
    const orig = readUIntBase128(bytes, at)
    at = orig.next
    // glyf and loca are transformed at version 0 and stored as-is at version 3; every other
    // table is stored as-is at version 0. A transformed table carries its stored length too.
    const transformed = tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0
    let length = orig.value
    if (transformed) {
      const stored = readUIntBase128(bytes, at)
      at = stored.next
      length = stored.value
    }
    entries.push({ tag, length })
  }

  if (at + compressedLength > bytes.length) throw new Error('woff2: compressed stream runs past the end of the file')
  const stream = new Uint8Array(brotliDecompressSync(bytes.subarray(at, at + compressedLength)))

  const tables = new Map<string, Uint8Array>()
  let offset = 0
  for (const { tag, length } of entries) {
    if (offset + length > stream.length) throw new Error(`woff2: table ${tag} runs past the decompressed stream`)
    tables.set(tag, stream.subarray(offset, offset + length))
    offset += length
  }
  return tables
}

/** Format 4: segments of 16-bit code points, with either a delta or an index into a glyph array. */
function format4(table: DataView, start: number, into: Set<number>) {
  const segCount = table.getUint16(start + 6) / 2
  const ends = start + 14
  const starts = ends + segCount * 2 + 2
  const deltas = starts + segCount * 2
  const rangeOffsets = deltas + segCount * 2
  for (let s = 0; s < segCount; s++) {
    const end = table.getUint16(ends + s * 2)
    const first = table.getUint16(starts + s * 2)
    const delta = table.getUint16(deltas + s * 2)
    const rangeOffsetAt = rangeOffsets + s * 2
    const rangeOffset = table.getUint16(rangeOffsetAt)
    for (let code = first; code <= end && code !== 0xffff; code++) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const raw = table.getUint16(rangeOffsetAt + rangeOffset + (code - first) * 2)
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
      }
      if (glyph !== 0) into.add(code)
    }
  }
}

/** Format 12: groups of 32-bit code points mapped to consecutive glyphs. */
function format12(table: DataView, start: number, into: Set<number>) {
  const groups = table.getUint32(start + 12)
  for (let g = 0; g < groups; g++) {
    const at = start + 16 + g * 12
    const first = table.getUint32(at)
    const last = table.getUint32(at + 4)
    const glyph = table.getUint32(at + 8)
    for (let code = first; code <= last; code++) if (glyph + (code - first) !== 0) into.add(code)
  }
}

/**
 * The code points a `cmap` maps to a glyph. Reads the Unicode subtable a browser would pick —
 * full-repertoire (3,10 / 0,4 / 0,6) before BMP-only (3,1 / 0,3 and the older Unicode IDs) —
 * and fails, rather than returning an empty set, when there is none: an empty set would make
 * every coverage check fail with a misleading list of "missing" characters.
 */
export function cmapCodepoints(cmap: Uint8Array): Set<number> {
  const table = view(cmap)
  const count = table.getUint16(2)
  const preference = ['3/10', '0/6', '0/4', '3/1', '0/3', '0/2', '0/1', '0/0']
  let best: { rank: number; offset: number } | undefined
  for (let r = 0; r < count; r++) {
    const at = 4 + r * 8
    const rank = preference.indexOf(`${table.getUint16(at)}/${table.getUint16(at + 2)}`)
    if (rank !== -1 && (best === undefined || rank < best.rank)) best = { rank, offset: table.getUint32(at + 4) }
  }
  if (!best) throw new Error('cmap: no Unicode subtable')
  const format = table.getUint16(best.offset)
  const out = new Set<number>()
  if (format === 4) format4(table, best.offset, out)
  else if (format === 12) format12(table, best.offset, out)
  else throw new Error(`cmap: Unicode subtable in unsupported format ${format}`)
  return out
}

/**
 * `name` table strings by name ID. Windows-platform English (3/1/0x409) wins, Mac Roman English
 * (1/0/0) is the fallback; a name ID that has neither is absent from the map.
 */
export function nameStrings(name: Uint8Array): Map<number, string> {
  const table = view(name)
  const count = table.getUint16(2)
  const storage = table.getUint16(4)
  const windows = new Map<number, string>()
  const mac = new Map<number, string>()
  for (let r = 0; r < count; r++) {
    const at = 6 + r * 12
    const platform = table.getUint16(at)
    const encoding = table.getUint16(at + 2)
    const language = table.getUint16(at + 4)
    const id = table.getUint16(at + 6)
    const length = table.getUint16(at + 8)
    const start = storage + table.getUint16(at + 10)
    if (platform === 3 && encoding === 1 && language === 0x409) {
      let text = ''
      for (let i = 0; i < length; i += 2) text += String.fromCharCode(table.getUint16(start + i))
      windows.set(id, text)
    } else if (platform === 1 && encoding === 0 && language === 0) {
      mac.set(id, String.fromCharCode(...name.subarray(start, start + length)))
    }
  }
  return new Map([...mac, ...windows])
}

/** Reads a WOFF2 font's identity, weight, licence and character coverage. */
export function describeWoff2(bytes: Uint8Array): FontDescription {
  const tables = readWoff2Tables(bytes)
  const table = (tag: string) => {
    const found = tables.get(tag)
    if (!found) throw new Error(`woff2: no ${tag} table`)
    return found
  }
  const names = nameStrings(table('name'))
  return {
    // Typographic family/subfamily (16/17) when present: a family with more than four
    // weights files Light and Medium under their own legacy family (ID 1) names.
    family: names.get(16) ?? names.get(1) ?? '',
    subfamily: names.get(17) ?? names.get(2) ?? '',
    weight: view(table('OS/2')).getUint16(4),
    copyright: names.get(0) ?? '',
    license: names.get(13) ?? '',
    licenseUrl: names.get(14) ?? '',
    codepoints: cmapCodepoints(table('cmap')),
  }
}

/**
 * The characters of `text` a face does not draw, each once, in first-seen order. Whitespace and
 * control characters are skipped: they are layout, not glyphs a visitor sees in a fallback face.
 */
export function uncoveredCharacters(text: string, codepoints: ReadonlySet<number>): string[] {
  const missing: string[] = []
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (/[\s\p{Cc}\p{Cf}]/u.test(char) || codepoints.has(code) || missing.includes(char)) continue
    missing.push(char)
  }
  return missing
}
