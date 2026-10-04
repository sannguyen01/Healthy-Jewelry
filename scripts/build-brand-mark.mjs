#!/usr/bin/env node
// Healthy Jewellery — derive every served copy of the knot mark from the master.
//
//   node scripts/build-brand-mark.mjs           write the served mark, the tab icon, the tiled logo and the home-screen icon
//   node scripts/build-brand-mark.mjs --check   exit 1 if any committed copy differs from what
//                                                the master derives, pixel for pixel
//
// The master is the only file anyone edits by hand. Never export a derivative from an image
// editor: that is how the black matte reached the page (see scripts/lib/brand-mark.mjs and
// docs/adr/041-a-transparent-logo-is-a-measurement.md).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DERIVATIVES, MASTER_PATH, decodePng, deriveAll, encodePng } from './lib/brand-mark.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string} rel */
const decode = (rel) => decodePng(readFileSync(join(ROOT, rel)))

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
  const bytes = encodePng(img)
  mkdirSync(dirname(join(ROOT, spec.path)), { recursive: true })
  writeFileSync(join(ROOT, spec.path), bytes)
  console.log(`wrote ${spec.path} (${img.width}×${img.height}, ${bytes.length} bytes)`)
}

if (stale > 0) {
  console.error(`${stale} derivative(s) differ from the master. Run: node scripts/build-brand-mark.mjs`)
  process.exit(1)
}
