#!/usr/bin/env node
// Healthy Jewellery — derive every served copy of the knot mark from the master.
//
//   node scripts/build-brand-mark.mjs           write public/brand/knot-silver.png and the icons
//   node scripts/build-brand-mark.mjs --check   exit 1 if any committed copy differs from what
//                                                the master derives, pixel for pixel
//
// The master is the only file anyone edits by hand. Never export a derivative from an image
// editor: that is how the black matte reached the page (see scripts/lib/brand-mark.mjs and
// docs/adr/041-a-transparent-logo-is-a-measurement.md).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngjs from 'pngjs'
import { DERIVATIVES, MASTER_PATH, deriveAll } from './lib/brand-mark.mjs'

const { PNG } = pngjs
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string} rel */
function decode(rel) {
  const png = PNG.sync.read(readFileSync(join(ROOT, rel)))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

/** @param {{ width: number, height: number, data: Uint8Array }} img */
function encode(img) {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data)
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 })
}

const check = process.argv.includes('--check')
const derived = deriveAll(decode(MASTER_PATH))
let stale = 0

for (const [name, spec] of Object.entries(DERIVATIVES)) {
  const img = derived[/** @type {keyof typeof DERIVATIVES} */ (name)]
  if (check) {
    const committed = existsSync(join(ROOT, spec.path)) ? decode(spec.path) : null
    const same =
      committed !== null &&
      committed.width === img.width &&
      committed.height === img.height &&
      Buffer.compare(Buffer.from(committed.data), Buffer.from(img.data)) === 0
    console.log(`${same ? 'ok   ' : 'STALE'} ${spec.path} (${img.width}×${img.height})`)
    if (!same) stale++
    continue
  }
  const bytes = encode(img)
  mkdirSync(dirname(join(ROOT, spec.path)), { recursive: true })
  writeFileSync(join(ROOT, spec.path), bytes)
  console.log(`wrote ${spec.path} (${img.width}×${img.height}, ${bytes.length} bytes)`)
}

if (stale > 0) {
  console.error(`${stale} derivative(s) differ from the master. Run: node scripts/build-brand-mark.mjs`)
  process.exit(1)
}
