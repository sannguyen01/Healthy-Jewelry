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
import { claimText, getAllProducts } from '@/lib/catalog'
import { SITE_NAME } from '@/config/site'
import { describeSfnt, uncoveredCharacters } from '@/lib/design/fontFile'

/**
 * **This file was `opengraph-vnd-font.test.tsx`, and the glyph it was named for is no
 * longer on the card.**
 *
 * The production defect: `next/og`'s automatic per-glyph Google Fonts fetch returned 400
 * for ₫ (U+20AB DONG SIGN) in a VND price — 23 failures across 18 users, logged as "Failed
 * to load dynamic font for ₫" — while every other character rendered fine. The fix was to
 * bundle two Noto Sans files and hand Satori bytes it already has, removing the
 * request-time dependency entirely. Since 2026-10-09 (ADR 051) the bundle is the site's own three
 * voices as TTF, because Satori reads TTF and not the WOFF2 the site ships.
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
const FILES = {
  display: 'public/fonts/barlow-condensed-500.ttf',
  body: 'public/fonts/dm-sans-9pt-300.ttf',
  label: 'public/fonts/dm-sans-9pt-500.ttf',
} as const

async function bundled() {
  const [display, body, label] = await Promise.all(
    Object.values(FILES).map((file) => readFile(path.join(process.cwd(), file)))
  )
  return { display, body, label }
}

async function bundledFonts() {
  const { display, body, label } = await bundled()
  return [
    { name: 'Barlow Condensed', data: display, weight: 500 as const, style: 'normal' as const },
    { name: 'DM Sans', data: body, weight: 300 as const, style: 'normal' as const },
    { name: 'DM Sans', data: label, weight: 500 as const, style: 'normal' as const },
  ]
}

/**
 * What each voice sets on the cards (ADR 052): the title and the brand name in Barlow Condensed
 * capitals, the sentence in DM Sans 300, the material chips in DM Sans 500. The display text is
 * checked in both cases: the cards write `textTransform: 'uppercase'`, and a glyph missing from the
 * capital forms is as visible as one missing from the written ones.
 */
function cardText() {
  const products = getAllProducts()
  return {
    display: [
      SITE_NAME.toUpperCase(),
      'Grade 23',
      'Titanium',
      ...products.map((p) => p.title),
      ...products.map((p) => p.title.toUpperCase()),
    ].join('\n'),
    body: claimText('brand-positioning', { kind: 'site' }),
    label: [
      'GRADE 23 TITANIUM',
      'NIOBIUM',
      '316L SURGICAL STEEL',
      ...products.map((p) => p.materialLabel.toUpperCase()),
    ].join('\n'),
  }
}

/** Every character the cards can be asked to draw. */
function cardCharacters(): string {
  return [...new Set(Object.values(cardText()).join('').split(''))].join('')
}

describe('the OG card rasterises with the bundled font, no network', () => {
  it('finds catalogue content to render', () => {
    // A vacuous pass here would be a test that rendered an empty string and declared the
    // font sufficient for it.
    expect(getAllProducts().length).toBeGreaterThan(0)
    expect(cardCharacters().length).toBeGreaterThan(10)
  })

  it('has a glyph in each voice for every character that voice sets', async () => {
    // Satori does not fail on a missing glyph: it draws .notdef, a box, and the card unfurls with
    // a hole in a word. So coverage is read from the files' own cmap tables, voice by voice.
    const files = await bundled()
    const text = cardText()
    for (const voice of ['display', 'body', 'label'] as const) {
      const font = describeSfnt(files[voice])
      expect(uncoveredCharacters(text[voice], font.codepoints), `${FILES[voice]} lacks glyphs the cards set in it`).toEqual([])
    }
  })

  it('renders every character the card can carry, in all three roles, and produces a non-empty PNG', async () => {
    const fonts = await bundledFonts()
    const text = cardText()

    const response = new ImageResponse(
      (
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 40 }}>
          <div style={{ display: 'flex', fontFamily: 'Barlow Condensed', fontWeight: 500 }}>{text.display}</div>
          <div style={{ display: 'flex', fontFamily: 'DM Sans', fontWeight: 300 }}>{text.body}</div>
          <div style={{ display: 'flex', fontFamily: 'DM Sans', fontWeight: 500 }}>{text.label}</div>
        </div>
      ),
      { width: 1200, height: 630, fonts }
    )

    expect(response.headers.get('content-type')).toBe('image/png')
    const bytes = await response.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('ships exactly the weight each voice asks for, so Satori synthesises none', async () => {
    // The cards ask Barlow Condensed for 500, DM Sans for 300 (the sentence) and 500 (the chips), and
    // each bundle holds that one weight. A bundle missing the weight would let Satori synthesise it,
    // the same silent substitution CLAUDE.md records for Barlow Condensed at weight 700 across nine pages.
    const files = await bundled()
    expect(describeSfnt(files.display).weight).toBe(500)
    expect(describeSfnt(files.body).weight).toBe(300)
    expect(describeSfnt(files.label).weight).toBe(500)
  })
})
