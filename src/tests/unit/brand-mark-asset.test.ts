import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from '@/tests/support/renderedStrings'
import { BRAND_LOGO_PATH, BRAND_MARK_PATH } from '@/config/site'

const {
  DERIVATIVES,
  MASTER_PATH,
  TILE_RGB,
  alphaBounds,
  decodePng,
  decontaminate,
  deriveAll,
  downscale,
  edgeMetrics,
  trimToSquare,
} = await import('../../../scripts/lib/brand-mark.mjs')

/**
 * **A logo is transparent when its edges are, not when its corners are.**
 *
 * The master's background was already α=0 — 73% of its pixels — and it still drew a grey ring
 * on `--bg`, because its 146,669 edge pixels had been keyed out of black and kept black's
 * colour in proportion to how transparent they were. Every check a person would think to run
 * ("are the corners transparent?") passed. These assert the property that failed instead, on
 * the files actually served, and then prove the assertion can tell a contaminated file from a
 * clean one. See docs/adr/041-a-transparent-logo-is-a-measurement.md.
 */

const ROOT = repoRoot()

/** `--bg`, read from the stylesheet so a palette change cannot leave this test measuring the old one. */
const BG = (() => {
  const hex = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8').match(/--bg:\s*#([0-9a-fA-F]{6})/)?.[1]
  if (!hex) throw new Error('--bg is not declared in globals.css')
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
})()

interface Rgba {
  width: number
  height: number
  data: Uint8Array
}

const decode = (rel: string): Rgba => decodePng(readFileSync(join(ROOT, rel)))

const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

/** Thresholds sit between the clean and the contaminated 512px file (see edgeMetrics). */
const FAINT_EDGE_FLOOR = 120 // clean 157.5, matte 48.4
const RIM_ON_BG_FLOOR = 196 // on the Pampas --bg: clean 200.1, matte 187.4

/**
 * Bytes. The 512px file reaches a browser only through next/image, which serves a 32–96px
 * AVIF or WebP of it; the raw PNG is fetched by search engines reading the Organization
 * logo. The icons are fetched as they are, on every first visit.
 */
const BYTE_BUDGET = { mark: 240_000, icon: 4_000, apple: 40_000, logo: 160_000 } as const

const master = decode(MASTER_PATH)
const committed = {
  mark: decode(DERIVATIVES.mark.path),
  icon: decode(DERIVATIVES.icon.path),
  apple: decode(DERIVATIVES.apple.path),
  logo: decode(DERIVATIVES.logo.path),
}

describe('the served knot mark', () => {
  it('is exactly what the master derives, pixel for pixel', () => {
    // So no derivative can be re-exported by hand: an image editor's file differs from the
    // pipeline's in every anti-aliased pixel. Fix: `node scripts/build-brand-mark.mjs`.
    const derived = deriveAll(master)
    for (const name of ['mark', 'icon', 'apple', 'logo'] as const) {
      expect([committed[name].width, committed[name].height], name).toEqual([derived[name].width, derived[name].height])
      expect(Buffer.compare(Buffer.from(committed[name].data), Buffer.from(derived[name].data)), name).toBe(0)
    }
  })

  it('is transparent at its corners', () => {
    const { mark } = committed
    const last = mark.width - 1
    expect([alphaAt(mark, 0, 0), alphaAt(mark, last, 0), alphaAt(mark, 0, last), alphaAt(mark, last, last)]).toEqual([
      0, 0, 0, 0,
    ])
  })

  it('is transparent at its edges: no black matte', () => {
    const metrics = edgeMetrics(committed.mark, BG)
    expect(metrics.partialPixels, 'an edge with no anti-aliasing would pass vacuously').toBeGreaterThan(5_000)
    expect(metrics.faintEdgeLum).toBeGreaterThanOrEqual(FAINT_EDGE_FLOOR)
    expect(metrics.rimOnBg).toBeGreaterThanOrEqual(RIM_ON_BG_FLOOR)
  })

  it('is cropped to the artwork, so a rendered size is the visible size', () => {
    const b = alphaBounds(committed.mark)
    const last = committed.mark.width - 1
    expect(committed.mark.width).toBe(committed.mark.height)
    expect(b).not.toBeNull()
    expect(b!.x0).toBeLessThanOrEqual(2)
    expect(b!.y0).toBeLessThanOrEqual(2)
    expect(b!.x1).toBeGreaterThanOrEqual(last - 2)
    expect(b!.y1).toBeGreaterThanOrEqual(last - 2)
  })

  it('is the file the site config points at, and the master is not served', () => {
    expect(`public${BRAND_MARK_PATH}`).toBe(DERIVATIVES.mark.path)
    expect(`public${BRAND_LOGO_PATH}`).toBe(DERIVATIVES.logo.path)
    expect(MASTER_PATH.startsWith('public/')).toBe(false)
    expect(existsSync(join(ROOT, 'public/logo.png')), 'the 1.1 MB master is back in public/').toBe(false)
  })

  it.each(Object.entries(BYTE_BUDGET))('%s stays inside its byte budget', (name, budget) => {
    const path = DERIVATIVES[name as keyof typeof DERIVATIVES].path
    expect(statSync(join(ROOT, path)).size).toBeLessThanOrEqual(budget)
  })
})

describe('the icons', () => {
  it.each(['icon', 'apple', 'logo'] as const)('%s is an opaque --black tile with the knot inside it', (name) => {
    const img = committed[name]
    const spec = DERIVATIVES[name]
    expect([img.width, img.height]).toEqual([spec.size, spec.size])
    // Opaque everywhere: iOS fills transparency with black anyway, and a light browser tab
    // strip would swallow a bare silver knot at 16px.
    let translucent = 0
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) translucent++
    expect(translucent, 'pixels that are not fully opaque').toBe(0)
    expect(Array.from(img.data.subarray(0, 3))).toEqual([...TILE_RGB])
    // Something light was drawn on it: the knot.
    let brightest = 0
    for (let i = 0; i < img.data.length; i += 4) brightest = Math.max(brightest, img.data[i])
    expect(brightest).toBeGreaterThan(180)
  })
})

describe('un-premultiplying keeps a pixel\'s hue', () => {
  it('scales all three channels together when the brightest would overflow', () => {
    // α=10 with R=15: R·255/α = 382, past 255. Clamping R alone (the first version) turned this
    // pixel from a faint warm grey into a saturated red; scaling keeps R:G:B at 15:10:10.
    const out = decontaminate({ width: 1, height: 1, data: new Uint8Array([15, 10, 10, 10]) }).data
    expect(out[0]).toBe(255)
    expect(out[1] / out[0]).toBeCloseTo(10 / 15, 2)
    expect(out[2] / out[0]).toBeCloseTo(10 / 15, 2)
    expect(out[3]).toBe(10)
  })

  it('leaves a pixel that fits alone: plain C·255/α', () => {
    const out = decontaminate({ width: 1, height: 1, data: new Uint8Array([40, 30, 20, 80]) }).data
    expect(Array.from(out)).toEqual([128, 96, 64, 80])
  })
})

describe('the edge check can fail (ADR 024)', () => {
  it('rejects the same pipeline with the matte left in', () => {
    // Everything deriveAll does except the un-premultiply: what an image editor's
    // "export with transparency" produced from this master.
    const contaminated = downscale(trimToSquare(master), DERIVATIVES.mark.size)
    const metrics = edgeMetrics(contaminated, BG)
    expect(metrics.faintEdgeLum).toBeLessThan(FAINT_EDGE_FLOOR)
    expect(metrics.rimOnBg).toBeLessThan(RIM_ON_BG_FLOOR)
  })

  it('rejects a file with transparent corners but a padded frame', () => {
    const padded = { width: 600, height: 600, data: new Uint8Array(600 * 600 * 4) }
    const mark = committed.mark
    for (let y = 0; y < mark.height; y++) {
      padded.data.set(mark.data.subarray(y * mark.width * 4, (y + 1) * mark.width * 4), ((y + 44) * 600 + 44) * 4)
    }
    const b = alphaBounds(padded)
    expect(b!.x0).toBeGreaterThan(2)
  })
})
