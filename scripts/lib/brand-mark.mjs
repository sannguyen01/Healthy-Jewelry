// Healthy Jewellery — every served copy of the knot mark, derived from one master.
//
// ## Why this exists
//
// The master (`assets/brand/knot-master.png`, 2560² RGBA) has a transparent background: 73% of
// its pixels are α=0. It is still not transparent where it matters. Its 146,669 edge pixels
// (0 < α < 255) were keyed out of a black backdrop, so their colour is *premultiplied against
// black*: stored luminance rises linearly with alpha (≈31 at α=10%, ≈161 at α=90%) instead of
// staying near the metal's own grey. On black that is invisible. On `--bg` every edge
// composites to a darker ring — a grey hairline around the whole knot, visible in the owner's own
// screenshot. "The corners are transparent" was true and was not the question; the question is
// whether the *edges* are, and they were not.
//
// The repair is arithmetic, not retouching: a pixel stored as C = α·F is un-premultiplied as
// F = C / α. Doing it here, in code, means it is done identically every time and can be checked.
//
// ## Why pure JavaScript and not sharp
//
// sharp is in the tree only as Next's optional dependency and is not importable from the root.
// Adding it would buy Lanczos resampling — the wrong filter for a 4× to 64× reduction anyway,
// where an area average (every source pixel weighted by the fraction of it each output pixel
// covers) is the exact answer and cannot ring. And integer-in, float-arithmetic, `Math.round`-out
// is deterministic on every platform, which libvips' SIMD paths do not promise. So the derivation
// is reproducible to the pixel, which `brand-mark-asset.test.ts` relies on: it re-runs this
// pipeline from the master and compares the committed files pixel for pixel.

import pngjs from 'pngjs'

/**
 * @typedef {object} RgbaImage
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} data   RGBA, row-major, straight (non-premultiplied) alpha
 */

/** `--black`, the campaign-band dark. The icon tile, chosen rather than inherited: iOS fills a
 *  transparent apple-touch-icon with black anyway, and a bare silver knot is near-invisible on
 *  a light browser tab strip at 16px. */
export const TILE_RGB = /** @type {const} */ ([0x0a, 0x0a, 0x0a])

/** Every derivative, its size, and how far the knot sits in from the tile edge (0 = no tile). */
export const DERIVATIVES = /** @type {const} */ ({
  mark: { path: 'public/brand/knot-silver.png', size: 512, tile: false, inset: 0 },
  icon: { path: 'src/app/icon.png', size: 32, tile: true, inset: 3 },
  apple: { path: 'src/app/apple-icon.png', size: 180, tile: true, inset: 25 },
  // What search engines show as the Organization logo. They lay it on white, where the bare
  // silver mark is a pale smudge, so it sits on the same tile as the icons.
  logo: { path: 'public/brand/knot-tile.png', size: 512, tile: true, inset: 72 },
})

export const MASTER_PATH = 'assets/brand/knot-master.png'

/**
 * Un-premultiply every partially transparent pixel against black: F = C·255/α.
 * Fully opaque and fully transparent pixels are untouched.
 *
 * Not every edge pixel was premultiplied exactly: 5,814 of the master's 146,669 have a channel
 * *brighter* than their alpha (α 9–50), so C·255/α exceeds 255 for them. Clamping each channel
 * on its own, as the first version did, flattens the brightest channel while the others keep
 * scaling, which shifts the pixel's hue — by up to 74 levels in one channel on this master. So
 * when the brightest channel would overflow, all three are scaled by the same factor instead:
 * the pixel keeps its hue and is as bright as it can be.
 * @param {RgbaImage} img
 * @returns {RgbaImage}
 */
export function decontaminate(img) {
  const data = Uint8Array.from(img.data)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0 || a === 255) continue
    const f = [0, 1, 2].map((k) => (data[i + k] * 255) / a)
    const scale = Math.max(...f) > 255 ? 255 / Math.max(...f) : 1
    for (let k = 0; k < 3; k++) data[i + k] = Math.round(f[k] * scale)
  }
  return { width: img.width, height: img.height, data }
}

/**
 * The tight box around every pixel with α > 0, inclusive. `null` for an empty image.
 * @param {RgbaImage} img
 */
export function alphaBounds(img) {
  let x0 = img.width
  let y0 = img.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/**
 * Crop to the alpha bounds, then pad the short axis with transparency so the result is square
 * and the artwork is centred. With padded bounds, a rendered size would not mean the visible
 * size — the lesson `src/lib/svg/viewbox.ts` records for the product illustrations.
 * @param {RgbaImage} img
 * @returns {RgbaImage}
 */
export function trimToSquare(img) {
  const b = alphaBounds(img)
  if (!b) throw new Error('trimToSquare: the image has no visible pixels')
  const w = b.x1 - b.x0 + 1
  const h = b.y1 - b.y0 + 1
  const side = Math.max(w, h)
  const offX = Math.floor((side - w) / 2)
  const offY = Math.floor((side - h) / 2)
  const data = new Uint8Array(side * side * 4)
  for (let y = 0; y < h; y++) {
    const from = ((b.y0 + y) * img.width + b.x0) * 4
    data.set(img.data.subarray(from, from + w * 4), ((offY + y) * side + offX) * 4)
  }
  return { width: side, height: side, data }
}

/**
 * For each output index, the source indices it covers and the fraction of each it covers.
 * @param {number} from  source length
 * @param {number} to    output length (≤ from)
 */
function coverage(from, to) {
  const scale = from / to
  /** @type {Array<Array<[number, number]>>} */
  const taps = []
  for (let o = 0; o < to; o++) {
    const start = o * scale
    const end = start + scale
    /** @type {Array<[number, number]>} */
    const row = []
    for (let s = Math.floor(start); s < Math.min(from, Math.ceil(end)); s++) {
      const w = Math.min(end, s + 1) - Math.max(start, s)
      if (w > 0) row.push([s, w / scale])
    }
    taps.push(row)
  }
  return taps
}

/**
 * @typedef {object} Premultiplied
 * @property {number} side      the square's side
 * @property {Float64Array} px  [A·R/255, A·G/255, A·B/255, A] per pixel
 */

/**
 * The square image in premultiplied form, computed once and shared by every derivative: at the
 * master's 2053² that is ~135 MB, and the first version rebuilt it for each output.
 * @param {RgbaImage} img
 * @returns {Premultiplied}
 */
export function premultiply(img) {
  if (img.width !== img.height) throw new Error('premultiply: expects a square image')
  const n = img.width
  const px = new Float64Array(n * n * 4)
  for (let i = 0; i < n * n; i++) {
    const a = img.data[i * 4 + 3]
    px[i * 4] = (img.data[i * 4] * a) / 255
    px[i * 4 + 1] = (img.data[i * 4 + 1] * a) / 255
    px[i * 4 + 2] = (img.data[i * 4 + 2] * a) / 255
    px[i * 4 + 3] = a
  }
  return { side: n, px }
}

/**
 * Area-average downscale of a square image to `size`², in premultiplied space so transparent
 * pixels contribute no colour. Separable: rows, then columns.
 * @param {RgbaImage | Premultiplied} source
 * @param {number} size
 * @returns {RgbaImage}
 */
export function downscale(source, size) {
  const { side: n, px: pre } = 'px' in source ? source : premultiply(source)
  if (size > n) throw new Error(`downscale: ${size} is larger than ${n}`)
  const taps = coverage(n, size)

  const rows = new Float64Array(n * size * 4) // n rows × size columns
  for (let y = 0; y < n; y++) {
    for (let ox = 0; ox < size; ox++) {
      const out = (y * size + ox) * 4
      for (const [sx, w] of taps[ox]) {
        const src = (y * n + sx) * 4
        for (let k = 0; k < 4; k++) rows[out + k] += pre[src + k] * w
      }
    }
  }

  const data = new Uint8Array(size * size * 4)
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (const [sy, w] of taps[oy]) {
        const src = (sy * size + ox) * 4
        r += rows[src] * w
        g += rows[src + 1] * w
        b += rows[src + 2] * w
        a += rows[src + 3] * w
      }
      const out = (oy * size + ox) * 4
      const alpha = Math.round(a)
      data[out + 3] = alpha
      if (alpha === 0) continue
      data[out] = Math.min(255, Math.round((r * 255) / a))
      data[out + 1] = Math.min(255, Math.round((g * 255) / a))
      data[out + 2] = Math.min(255, Math.round((b * 255) / a))
    }
  }
  return { width: size, height: size, data }
}

/**
 * The mark, downscaled to `size - 2·inset` and laid centred on an opaque tile.
 * @param {RgbaImage | Premultiplied} square  the trimmed, decontaminated master
 * @param {number} size
 * @param {number} inset
 * @param {readonly [number, number, number]} [tile]
 * @returns {RgbaImage}
 */
export function onTile(square, size, inset, tile = TILE_RGB) {
  const inner = size - 2 * inset
  const mark = downscale(square, inner)
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data.set([tile[0], tile[1], tile[2], 255], i * 4)
  }
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const src = (y * inner + x) * 4
      const a = mark.data[src + 3] / 255
      if (a === 0) continue
      const out = ((y + inset) * size + (x + inset)) * 4
      for (let k = 0; k < 3; k++) data[out + k] = Math.round(mark.data[src + k] * a + tile[k] * (1 - a))
    }
  }
  return { width: size, height: size, data }
}

/**
 * Every derivative, from a decoded master.
 * @param {RgbaImage} master
 * @returns {Record<keyof typeof DERIVATIVES, RgbaImage>}
 */
export function deriveAll(master) {
  const square = premultiply(trimToSquare(decontaminate(master)))
  return {
    mark: downscale(square, DERIVATIVES.mark.size),
    icon: onTile(square, DERIVATIVES.icon.size, DERIVATIVES.icon.inset),
    apple: onTile(square, DERIVATIVES.apple.size, DERIVATIVES.apple.inset),
    logo: onTile(square, DERIVATIVES.logo.size, DERIVATIVES.logo.inset),
  }
}

/**
 * Decode a PNG to straight-alpha RGBA.
 * @param {Uint8Array} bytes
 * @returns {RgbaImage}
 */
export function decodePng(bytes) {
  const png = pngjs.PNG.sync.read(Buffer.from(bytes))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

/**
 * Encode straight-alpha RGBA as a PNG, at the strongest compression.
 * @param {RgbaImage} img
 * @returns {Buffer}
 */
export function encodePng(img) {
  const png = new pngjs.PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data)
  return pngjs.PNG.sync.write(png, { colorType: 6, deflateLevel: 9 })
}

/**
 * What a black matte looks like, measured.
 *
 * - `faintEdgeLum`: mean 8-bit luminance, (R+G+B)/3, of the pixels with 0 < α < 128. A matte
 *   drags these toward black because their colour was multiplied by their own small alpha; a
 *   clean edge keeps the metal's grey. Measured 2026-10-04: 27.8 on the master itself; on the
 *   512px derivative, 48.4 if the matte is left in and 157.5 once it is removed.
 * - `rimOnBg`: mean luminance of every partially transparent pixel composited onto `bg` — what
 *   the visitor actually sees at the edge. On the 512px derivative over the Pampas `--bg`:
 *   187.4 with the matte, 200.1 without, against 240.3 for the ground itself.
 *
 * The matte's cost grows with the size the mark is drawn at. At the header's 30px raster the
 * same comparison is 157 against 172 — real, but a hairline; at 512px it is a ring. So the
 * thresholds are asserted on the 512px file, which is the one search engines show.
 * @param {RgbaImage} img
 * @param {readonly [number, number, number]} bg
 */
export function edgeMetrics(img, bg) {
  let faint = 0
  let faintSum = 0
  let rim = 0
  let rimSum = 0
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]
    if (a === 0 || a === 255) continue
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
    if (a < 128) {
      faint++
      faintSum += lum
    }
    const f = a / 255
    let composite = 0
    for (let k = 0; k < 3; k++) composite += img.data[i + k] * f + bg[k] * (1 - f)
    rim++
    rimSum += composite / 3
  }
  return {
    partialPixels: rim,
    faintEdgeLum: faint === 0 ? 255 : faintSum / faint,
    rimOnBg: rim === 0 ? 255 : rimSum / rim,
  }
}
