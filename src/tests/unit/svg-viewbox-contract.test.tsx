import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { HJ_SVG_TYPES } from '@/lib/shopify/types'
import { FALLBACK_VIEWBOX, SVG_VIEWBOX, viewBoxFor } from '@/lib/svg/viewbox'

/**
 * The viewBox map and the component that draws with it must not drift apart.
 *
 * They were the same thing until recently: 25 `viewBox` literals inside `JewelrySVG`,
 * which meant nothing outside the component could know how a mark was proportioned, and
 * so no sizing decision anywhere accounted for the fact that they disagreed — in ratio
 * and, more damagingly, in how much empty air each box held around its drawing. One
 * `svgScale="70%"` produced a 7x spread in rendered optical weight.
 *
 * Now the map is the source and the component reads it. That is only an improvement
 * while the two agree, which is what this file checks. `HJ_SVG_TYPES` is walked at
 * runtime rather than trusted at compile time for the same reason it is an array and
 * not a bare union: a union cannot be enumerated, so nothing could check that the set
 * the parser can produce is the set the map covers.
 */

/** `x y w h`, the four numbers an SVG viewBox is. */
function parse(viewBox: string): [number, number, number, number] {
  const parts = viewBox.trim().split(/\s+/).map(Number)
  expect(parts, `"${viewBox}" is not four numbers`).toHaveLength(4)
  expect(parts.every(Number.isFinite), `"${viewBox}" has a non-numeric part`).toBe(true)
  return parts as [number, number, number, number]
}

describe('every drawable type has a declared coordinate space', () => {
  it.each(HJ_SVG_TYPES)('%s has a viewBox in the map', (type) => {
    expect(SVG_VIEWBOX[type], `"${type}" is drawable but has no viewBox`).toBeDefined()
  })

  it('declares no viewBox for a type that cannot be drawn', () => {
    // The other direction. A leftover entry for a deleted type is dead data that looks
    // like coverage, and `Record<HJSvgType, string>` cannot catch it on its own.
    const declared = Object.keys(SVG_VIEWBOX)
    const drawable = new Set<string>(HJ_SVG_TYPES)
    const orphans = declared.filter((type) => !drawable.has(type))
    expect(orphans, `these viewBoxes name types nothing can draw: ${orphans.join(', ')}`).toEqual(
      []
    )
  })

  it.each(HJ_SVG_TYPES)('%s declares a viewBox with real area', (type) => {
    const [, , width, height] = parse(SVG_VIEWBOX[type])
    expect(width, `"${type}" has a zero-width viewBox`).toBeGreaterThan(0)
    expect(height, `"${type}" has a zero-height viewBox`).toBeGreaterThan(0)
  })
})

describe('the component draws in the space the map declares', () => {
  it.each(HJ_SVG_TYPES)('%s renders the mapped viewBox', (type) => {
    const { container } = render(<JewelrySVG type={type} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(SVG_VIEWBOX[type])
  })

  it.each(HJ_SVG_TYPES)('%s labels itself so a failing probe can name it', (type) => {
    // e2e/product-image-fit.spec.ts reports `data-svg-type` when a mark is mis-sized.
    // Without it a geometry failure says "an svg", which is not an actionable report.
    const { container } = render(<JewelrySVG type={type} />)
    expect(container.querySelector('svg')?.getAttribute('data-svg-type')).toBe(type)
  })
})

describe('an unknown type still gets a usable coordinate space', () => {
  it.each(['ring-does-not-exist', '', 'SVG:RING-ARC'])(
    'falls back for "%s" rather than rendering without a viewBox',
    (type) => {
      expect(viewBoxFor(type)).toBe(FALLBACK_VIEWBOX)

      // The failure this guards is quiet: an <svg> with no viewBox does not scale its
      // contents at all, so the fallback that exists to guarantee an unknown type still
      // draws something would render at one user unit per pixel and be invisible.
      const { container } = render(<JewelrySVG type={type} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe(FALLBACK_VIEWBOX)
      expect(
        svg?.querySelectorAll('circle, ellipse, path, rect, line, polygon').length
      ).toBeGreaterThan(0)
    }
  )
})

describe('the marks are proportioned to their own artwork', () => {
  /**
   * The point of the whole change: each box is the tight bounds of what is drawn in it,
   * so `preserveAspectRatio="xMidYMid meet"` gives every mark the same maximum extent
   * and `svgScale` means what its name says.
   *
   * This cannot verify the tightness itself — jsdom has no SVG layout, so `getBBox()`
   * is unavailable and ink is unmeasurable here. That is E2E's job
   * (`e2e/product-image-fit.spec.ts` measures ink against the tile in a real browser).
   * What is checkable here is the arithmetic consequence: boxes that were padded to a
   * shared 80x80 grid all had integer origins at 0, and tight ones do not.
   */
  it('no longer pads every mark into the same 80-unit grid', () => {
    const onTheOldGrid = HJ_SVG_TYPES.filter((type) => {
      const [x, y, width] = parse(SVG_VIEWBOX[type])
      return x === 0 && y === 0 && width === 80
    })
    expect(
      onTheOldGrid,
      `these still use the old padded grid, so their ink does not fill their box: ${onTheOldGrid.join(', ')}`
    ).toEqual([])
  })

  it('keeps every declared ratio inside the range real jewellery occupies', () => {
    // A guard on the data, not the drawing: a transposed or mistyped tuple shows up as
    // an absurd ratio long before anyone looks at the page. The extremes today are
    // earring-threader (very long and thin) and bracelet-chain (wide and flat).
    for (const type of HJ_SVG_TYPES) {
      const [, , width, height] = parse(SVG_VIEWBOX[type])
      const ratio = width / height
      expect(ratio, `"${type}" declares a ratio of ${ratio.toFixed(3)}`).toBeGreaterThan(0.05)
      expect(ratio, `"${type}" declares a ratio of ${ratio.toFixed(3)}`).toBeLessThan(20)
    }
  })
})
