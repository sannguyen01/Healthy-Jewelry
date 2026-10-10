import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllProducts, heroMedia } from '@/lib/catalog'
import { loadHeroMedia } from '@/lib/catalog/hero-media-schema'
import { rawHeroMedia } from '@/lib/catalog/manifest'
import { imageSize } from '../support/imageSize'

/**
 * The home page's hero is art-directed by a record, and the record is only worth anything if it
 * cannot say a thing the bytes contradict (ADR 054).
 *
 * What is held here: the shape (so a malformed record stops the build, like a product does), the
 * provenance rules (a photograph names real pieces; an AI-origin image names none; an approval names a
 * person), and two checks against the file itself: its dimensions, and whether the manifest embedded in
 * its bytes agrees with the record's `origin`.
 */

const ROOT = resolve(__dirname, '../../..')
const handles = getAllProducts().map((p) => p.handle)
const known = { productHandles: handles }

type MutableCrop = {
  src: string
  width: number
  height: number
  focal: { x: number; y: number }
  subject: { x0: number; y0: number; x1: number; y1: number }
  copyZone: string
  variant: string
  extra?: boolean
}
type MutableRecord = {
  alt: string
  headerTone: string
  extra?: boolean
  desktop: MutableCrop
  mobile: MutableCrop
  provenance: {
    origin: string
    source: string
    rights: unknown
    subjectConsent: unknown
    pieces: string[]
    extra?: boolean
  }
}

/** A fresh, mutable copy of the committed record. */
const base = (): MutableRecord => structuredClone(rawHeroMedia) as MutableRecord

/** A rejection must name the field it rejects: an error about something else is not the rule under test. */
const rejects = (mutate: (r: MutableRecord) => void, field: RegExp): void => {
  const record = base()
  mutate(record)
  expect(() => loadHeroMedia(record, known)).toThrowError(field)
}

const accepts = (mutate: (r: MutableRecord) => void): void => {
  const record = base()
  mutate(record)
  expect(() => loadHeroMedia(record, known)).not.toThrow()
}

describe('the committed hero record', () => {
  it('is the only record in src/content/hero, and the manifest serves it', () => {
    expect(readdirSync(resolve(ROOT, 'src/content/hero'))).toEqual(['home.json'])
    expect(JSON.parse(readFileSync(resolve(ROOT, 'src/content/hero/home.json'), 'utf8'))).toEqual(rawHeroMedia)
  })

  it('validates, and is what the catalogue reader serves', () => {
    expect(() => loadHeroMedia(rawHeroMedia, known)).not.toThrow()
    expect(heroMedia().id).toBe('home')
    expect(heroMedia()).toEqual(loadHeroMedia(rawHeroMedia, known))
  })

  it('declares the width and height of the file each crop names', () => {
    for (const crop of [heroMedia().desktop, heroMedia().mobile]) {
      const bytes = readFileSync(resolve(ROOT, 'public' + crop.src))
      expect({ width: crop.width, height: crop.height }, crop.src).toEqual(imageSize(bytes))
    }
  })

  it('does not call an image photographed when the manifest inside its bytes says an algorithm made it', () => {
    for (const crop of [heroMedia().desktop, heroMedia().mobile]) {
      const bytes = readFileSync(resolve(ROOT, 'public' + crop.src))
      const algorithmic = Buffer.from(bytes).includes('trainedAlgorithmicMedia')
      if (algorithmic) {
        expect(heroMedia().provenance.origin, `${crop.src} carries an algorithmic-source manifest`).toBe('ai-generated')
      }
    }
  })

  it('keeps the subject inside the frame and the focal point on the image', () => {
    for (const crop of [heroMedia().desktop, heroMedia().mobile]) {
      expect(crop.subject.x0).toBeLessThan(crop.subject.x1)
      expect(crop.subject.y0).toBeLessThan(crop.subject.y1)
      for (const n of [crop.focal.x, crop.focal.y, crop.subject.x0, crop.subject.y0, crop.subject.x1, crop.subject.y1]) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('the shape', () => {
  it('rejects an unknown key anywhere, since a typo would otherwise be ignored', () => {
    rejects((r) => { r.extra = true }, /unrecognized/i)
    rejects((r) => { r.desktop.extra = true }, /unrecognized/i)
    rejects((r) => { r.provenance.extra = true }, /unrecognized/i)
  })

  it('rejects a source that is not a local file under /images/', () => {
    for (const src of ['https://example.com/a.jpg', '/other/a.jpg', '/images/../secret.jpg', '/images/a.svg', 'images/a.jpg', '/images/a.jpg?x=1']) {
      rejects((r) => { r.desktop.src = src }, /src/)
    }
    accepts((r) => { r.desktop.src = '/images/lifestyle/hero-banner.jpg' })
  })

  it('rejects a focal point or a subject coordinate outside 0..1', () => {
    rejects((r) => { r.mobile.focal.x = 1.2 }, /focal/)
    rejects((r) => { r.mobile.focal.y = -0.1 }, /focal/)
    rejects((r) => { r.mobile.subject.x1 = 1.01 }, /subject/)
  })

  it('rejects a subject box with no area, or an inverted one', () => {
    rejects((r) => { r.mobile.subject = { x0: 0.5, y0: 0.2, x1: 0.5, y1: 0.4 } }, /subject/)
    rejects((r) => { r.mobile.subject = { x0: 0.8, y0: 0.2, x1: 0.6, y1: 0.4 } }, /subject/)
    rejects((r) => { r.mobile.subject = { x0: 0.6, y0: 0.5, x1: 0.8, y1: 0.4 } }, /subject/)
  })

  it('rejects a variant, a copy corner or a header tone that does not exist', () => {
    rejects((r) => { r.desktop.variant = 'banner' }, /variant/)
    rejects((r) => { r.desktop.copyZone = 'top-start' }, /copyZone/)
    rejects((r) => { r.headerTone = 'auto' }, /headerTone/)
  })

  it('rejects an empty alt text, because a literal description is the point, and an essay', () => {
    rejects((r) => { r.alt = '' }, /alt/)
    rejects((r) => { r.alt = '   ' }, /alt/)
    rejects((r) => { r.alt = 'x'.repeat(201) }, /alt/)
  })

  it('rejects non-positive or fractional dimensions', () => {
    rejects((r) => { r.desktop.width = 0 }, /width/)
    rejects((r) => { r.mobile.height = 768.5 }, /height/)
  })
})

describe('provenance rules', () => {
  const real = 'arc-hoops-titanium'

  it('requires a photographed image to name the pieces it shows, and every one must exist', () => {
    rejects((r) => { r.provenance.origin = 'photographed'; r.provenance.pieces = [] }, /pieces/)
    rejects((r) => { r.provenance.origin = 'photographed'; r.provenance.pieces = ['not-a-piece'] }, /not-a-piece/)
    accepts((r) => { r.provenance.origin = 'photographed'; r.provenance.pieces = [real] })
    expect(handles).toContain(real)
  })

  it('forbids an AI-origin image from naming real pieces, because it cannot depict one', () => {
    rejects((r) => { r.provenance.origin = 'ai-generated'; r.provenance.pieces = [real] }, /pieces/)
  })

  it('forbids an AI-origin image from carrying a subject-consent state of its own', () => {
    rejects((r) => { r.provenance.origin = 'ai-generated'; r.provenance.subjectConsent = { state: 'unreviewed' } }, /subjectConsent/)
  })

  it('needs a named reviewer and a date for any approval, as a claim does', () => {
    rejects((r) => { r.provenance.rights = { state: 'approved' } }, /reviewer|decidedOn/)
    rejects((r) => { r.provenance.rights = { state: 'approved', reviewer: 'ab', decidedOn: '2026-10-10' } }, /reviewer/)
    rejects((r) => { r.provenance.rights = { state: 'approved', reviewer: 'A. Reviewer', decidedOn: 'yesterday' } }, /decidedOn/)
    accepts((r) => { r.provenance.rights = { state: 'approved', reviewer: 'A. Reviewer', decidedOn: '2026-10-10' } })
  })

  it('accepts photographed pieces whose subject has consented, and rejects an unknown consent state', () => {
    accepts((r) => {
      r.provenance.origin = 'photographed'
      r.provenance.pieces = [real]
      r.provenance.subjectConsent = { state: 'approved', reviewer: 'A. Reviewer', decidedOn: '2026-10-10' }
    })
    rejects((r) => { r.provenance.subjectConsent = 'granted' }, /subjectConsent/)
  })

  it('names its failures, so the build output says which record and which field', () => {
    const record = base()
    record.mobile.focal.x = 3
    expect(() => loadHeroMedia(record, known)).toThrowError(/hero media record/i)
    expect(() => loadHeroMedia(record, known)).toThrowError(/focal/)
  })
})

describe('imageSize (the reader the check above stands on)', () => {
  it('reads a JPEG start-of-frame past other segments, and refuses what it cannot read', () => {
    // SOI, an APP0 segment (length 4: two bytes of payload), SOF0: length 11, precision 8, 40 high, 50 wide.
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x28, 0x00, 0x32, 0x01, 0x01, 0x11, 0x00,
    ])
    expect(imageSize(jpeg)).toEqual({ width: 50, height: 40 })
    expect(() => imageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]))).toThrow(/no start-of-frame/)
    expect(() => imageSize(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/unsupported/)
  })

  it('reads a PNG header', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    new DataView(png.buffer).setUint32(16, 640)
    new DataView(png.buffer).setUint32(20, 480)
    expect(imageSize(png)).toEqual({ width: 640, height: 480 })
  })
})
