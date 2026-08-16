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
