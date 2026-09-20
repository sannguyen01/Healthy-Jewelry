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
import { getAllProducts } from '@/lib/catalog'

/**
 * **This file was `opengraph-vnd-font.test.tsx`, and the glyph it was named for is no
 * longer on the card.**
 *
 * The production defect: `next/og`'s automatic per-glyph Google Fonts fetch returned 400
 * for ₫ (U+20AB DONG SIGN) in a VND price — 23 failures across 18 users, logged as "Failed
 * to load dynamic font for ₫" — while every other character rendered fine. The fix was to
 * bundle two Noto Sans files and hand Satori bytes it already has, removing the
 * request-time dependency entirely.
 *
 * The card no longer renders a price, so U+20AB is not on it. Testing that specific glyph
 * would now be testing a character the route cannot produce — green forever, proving
 * nothing, which is the fossil shape
 * [ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md) describes.
 *
 * What has not changed is the property worth protecting: **this route has no fallback when
 * font loading fails.** The response throws, and a link unfurl shows nothing at all. So the
 * subject moves from one glyph to the card's real content — every product title and
 * material label in the catalogue, rendered through the actual rasteriser with the actual
 * bundled files.
 *
 * `opengraph-satori.test.tsx` mocks `next/og` entirely to check layout rules without paying
 * for real rendering. That mock would pass a font failure: the failure is in font loading,
 * which only happens when Satori actually runs. This one does not mock it.
 */
async function bundledFonts() {
  const [regular, bold] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/NotoSans-regular.ttf')),
    readFile(path.join(process.cwd(), 'public/fonts/NotoSans-bold.ttf')),
  ])
  return [
    { name: 'Noto Sans', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Noto Sans', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

/** Every character the card can be asked to draw, from the catalogue itself. */
function cardCharacters(): string {
  const parts: string[] = ['HEALTHY JEWELRY']
  for (const product of getAllProducts()) {
    parts.push(product.title.toUpperCase())
    parts.push(product.materialLabel.toUpperCase())
  }
  return [...new Set(parts.join('').split(''))].join('')
}

describe('the OG card rasterises with the bundled font, no network', () => {
  it('finds catalogue content to render', () => {
    // A vacuous pass here would be a test that rendered an empty string and declared the
    // font sufficient for it.
    expect(getAllProducts().length).toBeGreaterThan(0)
    expect(cardCharacters().length).toBeGreaterThan(10)
  })

  it('renders every character the card can carry, and produces a non-empty PNG', async () => {
    const fonts = await bundledFonts()

    const response = new ImageResponse(
      (
        <div style={{ display: 'flex', fontFamily: 'Noto Sans', fontSize: 40 }}>
          {cardCharacters()}
        </div>
      ),
      { width: 1200, height: 630, fonts }
    )

    expect(response.headers.get('content-type')).toBe('image/png')
    const bytes = await response.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('renders both weights, because the card uses 400 and 700', async () => {
    // The title is `fontWeight: 700` and the eyebrow and material label are 400. A bundle
    // missing one weight would let Satori synthesise it — the same silent substitution
    // CLAUDE.md records for Barlow Condensed at weight 700 across nine pages.
    const fonts = await bundledFonts()

    const response = new ImageResponse(
      (
        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Noto Sans' }}>
          <div style={{ display: 'flex', fontWeight: 400, fontSize: 14 }}>{cardCharacters()}</div>
          <div style={{ display: 'flex', fontWeight: 700, fontSize: 72 }}>{cardCharacters()}</div>
        </div>
      ),
      { width: 1200, height: 630, fonts }
    )

    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })
})
