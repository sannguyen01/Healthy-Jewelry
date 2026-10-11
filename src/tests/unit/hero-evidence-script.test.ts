import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONSENT_STORAGE_KEY } from '@/lib/analytics/consent'

/**
 * `scripts/capture-hero-evidence.mjs` is plain JavaScript that runs under `node` with no loader, so it cannot import the
 * TypeScript the specs take their facts from (the repository pins `22.x`, and type-stripping is only on by default from a
 * later minor). Two facts are therefore typed in it again: the consent storage key, and the table of viewports the
 * receipt's matrix is taken at. This test is the tie between the copies, so changing one alone fails here and not a
 * screenshot set that quietly stopped answering the notice or stopped covering a width the spec holds.
 */

const ROOT = resolve(__dirname, '../../..')
const script = readFileSync(resolve(ROOT, 'scripts/capture-hero-evidence.mjs'), 'utf8')
const spec = readFileSync(resolve(ROOT, 'e2e/hero-legibility.spec.ts'), 'utf8')

const pairs = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((m) => `${m[1]}x${m[2]}`)

describe('the evidence script and the application agree', () => {
  it('answers the consent notice under the key the application stores it with', () => {
    const typed = /const CONSENT_KEY = '([^']+)'/.exec(script)?.[1]
    expect(typed, 'the script names a consent key').toBeDefined()
    expect(typed).toBe(CONSENT_STORAGE_KEY)
  })

  it('captures only at viewports the hero spec holds, and at eleven distinct widths', () => {
    const captured = pairs(script, /\{ width: (\d+), height: (\d+), dpr: \d+ \}/g)
    const held = new Set(pairs(spec, /width: (\d+), height: (\d+), clearsNotice/g))
    expect(captured.length, 'the script lists its viewports').toBeGreaterThanOrEqual(11)
    expect(held.size, 'the spec lists its viewports').toBeGreaterThanOrEqual(11)
    expect(
      captured.filter((viewport) => !held.has(viewport)),
      'viewports in the evidence matrix that no spec measures'
    ).toEqual([])
    expect(new Set(captured.map((viewport) => viewport.split('x')[0])).size).toBe(11)
  })

  it('would notice if the script drifted (the parse is not vacuous)', () => {
    const drifted = script.replace("const CONSENT_KEY = '", "const CONSENT_KEY = 'x-")
    expect(/const CONSENT_KEY = '([^']+)'/.exec(drifted)?.[1]).not.toBe(CONSENT_STORAGE_KEY)
    const moved = script.replace('{ width: 360, height: 640,', '{ width: 360, height: 641,')
    const held = new Set(pairs(spec, /width: (\d+), height: (\d+), clearsNotice/g))
    expect(pairs(moved, /\{ width: (\d+), height: (\d+), dpr: \d+ \}/g).filter((v) => !held.has(v))).toEqual(['360x641'])
  })
})
