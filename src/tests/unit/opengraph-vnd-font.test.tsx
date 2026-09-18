/**
 * @vitest-environment node
 *
 * **Node, not jsdom, and for a reason that is about faithfulness rather than
 * convenience.**
 *
 * This is the one test that runs `next/og` for real. Next 16's rasteriser
 * checks `instanceof Uint8Array` on the buffer it hands to resvg, and under
 * jsdom that check fails across realms — jsdom's `Uint8Array` is not Node's —
 * so the SVG is stringified and resvg reports
 * `Unsupported input '60,115,118,103,...'`, which is `<svg width=...` as char
 * codes. The same realm mismatch bit `coverage-gate-contract.test.ts` in this
 * repository from the other direction, where esbuild refused to initialise
 * under jsdom because `new TextEncoder().encode('') instanceof Uint8Array` was
 * false.
 *
 * The OG route is a server route. Rendering it in a Node environment is what
 * production does; rendering it in a simulated browser was always the less
 * faithful of the two and only worked by accident.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { formatPrice } from '@/lib/utils/formatPrice'

/**
 * Regression test for the production defect this project actually hit:
 * `next/og`'s automatic per-glyph Google Fonts fetch returned 400 for ₫
 * (U+20AB DONG SIGN) in a VND price — 23 failures across 18 users, logged as
 * "Failed to load dynamic font for ₫" — while every other character on the
 * card rendered fine.
 *
 * `opengraph-satori.test.tsx` mocks `next/og` entirely to check layout rules
 * without paying for real rendering. That mock would pass this exact bug: the
 * failure was in font loading, which only happens when Satori actually runs.
 * This test does not mock `next/og` — it exercises the real rendering path,
 * with the bundled font files, against the specific glyph that broke.
 */
describe('OG image renders a VND price with the bundled font', () => {
  it('does not throw when rendering ₫, and produces a non-empty PNG response', async () => {
    const [regular, bold] = await Promise.all([
      readFile(path.join(process.cwd(), 'public/fonts/NotoSans-regular.ttf')),
      readFile(path.join(process.cwd(), 'public/fonts/NotoSans-bold.ttf')),
    ])

    const price = formatPrice(1450000, 'VND')
    // Sanity: the fixture actually contains the glyph under test. If a future
    // formatPrice change stops emitting ₫, this test would otherwise pass
    // for the wrong reason.
    expect(price).toContain('₫')

    const response = new ImageResponse(
      (
        <div style={{ display: 'flex', fontFamily: 'Noto Sans', fontSize: 40 }}>
          {price}
        </div>
      ),
      {
        width: 400,
        height: 200,
        fonts: [
          { name: 'Noto Sans', data: regular, weight: 400, style: 'normal' },
          { name: 'Noto Sans', data: bold, weight: 700, style: 'normal' },
        ],
      },
    )

    expect(response.headers.get('content-type')).toBe('image/png')
    const bytes = await response.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})
