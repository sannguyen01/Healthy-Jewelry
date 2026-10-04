import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pngjs from 'pngjs'
import { repoRoot } from '@/tests/support/renderedStrings'
import { BRAND_MARK_PATH } from '@/config/site'

const { DERIVATIVES, MASTER_PATH, TILE_RGB, alphaBounds, deriveAll, downscale, edgeMetrics, trimToSquare } =
  await import('../../../scripts/lib/brand-mark.mjs')

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
const BG = [0xf7, 0xf5, 0xf1] as const // --bg

interface Rgba {
  width: number
  height: number
  data: Uint8Array
}

function decode(rel: string): Rgba {
  const png = pngjs.PNG.sync.read(readFileSync(join(ROOT, rel)))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

/** Thresholds sit between the clean and the contaminated 512px file (see edgeMetrics). */
const FAINT_EDGE_FLOOR = 120 // clean 157.6, matte 48.4
const RIM_ON_BG_FLOOR = 196 // clean 202.0, matte 189.3

/**
 * Bytes. The 512px file reaches a browser only through next/image, which serves a 32–96px
 * AVIF or WebP of it; the raw PNG is fetched by search engines reading the Organization
 * logo. The icons are fetched as they are, on every first visit.
 */
const BYTE_BUDGET = { mark: 240_000, icon: 4_000, apple: 40_000 } as const

const master = decode(MASTER_PATH)
const committed = {
  mark: decode(DERIVATIVES.mark.path),
  icon: decode(DERIVATIVES.icon.path),
  apple: decode(DERIVATIVES.apple.path),
}

describe('the served knot mark', () => {
  it('is exactly what the master derives, pixel for pixel', () => {
    // So no derivative can be re-exported by hand: an image editor's file differs from the
    // pipeline's in every anti-aliased pixel. Fix: `node scripts/build-brand-mark.mjs`.
    const derived = deriveAll(master)
    for (const name of ['mark', 'icon', 'apple'] as const) {
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
    expect(MASTER_PATH.startsWith('public/')).toBe(false)
    expect(existsSync(join(ROOT, 'public/logo.png')), 'the 1.1 MB master is back in public/').toBe(false)
  })

  it.each(Object.entries(BYTE_BUDGET))('%s stays inside its byte budget', (name, budget) => {
    const path = DERIVATIVES[name as keyof typeof DERIVATIVES].path
    expect(statSync(join(ROOT, path)).size).toBeLessThanOrEqual(budget)
  })
})

describe('the icons', () => {
  it.each(['icon', 'apple'] as const)('%s is an opaque --black tile with the knot inside it', (name) => {
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
