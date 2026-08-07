import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { HJ_SVG_TYPES } from '@/lib/shopify/types'
import { isHJSvgType, parseSvgType } from '@/lib/shopify/tags'

/**
 * Every illustration a product can ask for must actually draw something.
 *
 * `JewelrySVG` ended in `default: return null`, and two of the seventeen types
 * its own union declared — `charm-classic` and `charm-disc` — had no case at
 * all. The entire Charms collection rendered empty boxes, and had done since
 * charms were added. Nothing failed: not the type-checker (the union was
 * satisfied), not lint, not any test, and not the visual-assets E2E spec, which
 * checks `<img>` elements rather than inline SVG.
 *
 * The live Shopify catalog then made it worse. Nine products carry `svg:` tags
 * for shapes the union never contained (`ring-halo`, `charm-star`, …), and the
 * old mapper cast the tag straight to `HJSvgType`. A tag anyone can type in
 * Shopify Admin could blank out a product tile with no error anywhere.
 *
 * This is the cheapest possible guard against both: walk the list, render each
 * one, insist on real geometry.
 */

/** An `<svg>` with no drawing instructions inside is the same as none at all. */
function drawnShapeCount(container: HTMLElement): number {
  return container.querySelectorAll('circle, ellipse, path, rect, line, polygon').length
}

describe('every declared svg type draws something', () => {
  it.each(HJ_SVG_TYPES)('%s renders an svg with real geometry', (type) => {
    const { container } = render(<JewelrySVG type={type} />)

    const svg = container.querySelector('svg')
    expect(svg, `JewelrySVG returned nothing for "${type}"`).not.toBeNull()
    expect(drawnShapeCount(container), `"${type}" rendered an empty <svg>`).toBeGreaterThan(0)
  })

  it('covers every type with a real case, not the fallback', () => {
    // The fallback marks itself, so a type that silently falls through to it is
    // distinguishable from one that is genuinely drawn. Without this, adding a
    // member to HJ_SVG_TYPES and forgetting to draw it would still pass above.
    const usingFallback = HJ_SVG_TYPES.filter((type) => {
      const { container } = render(<JewelrySVG type={type} />)
      return container.querySelector('[data-svg-fallback]') !== null
    })
    expect(usingFallback, `these types have no case in JewelrySVG: ${usingFallback.join(', ')}`).toEqual([])
  })

  it('charms draw — the collection that shipped as empty boxes', () => {
    for (const type of ['charm-classic', 'charm-disc', 'charm-anchor', 'charm-star', 'charm-heart']) {
      const { container } = render(<JewelrySVG type={type} />)
      expect(drawnShapeCount(container), `${type} is blank`).toBeGreaterThan(0)
    }
  })
})

describe('an unknown type can never render nothing', () => {
  it('renders visible geometry for a type that does not exist', () => {
    const { container } = render(<JewelrySVG type="ring-does-not-exist" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(drawnShapeCount(container)).toBeGreaterThan(0)
  })

  it('renders visible geometry for an empty type', () => {
    const { container } = render(<JewelrySVG type="" />)
    expect(drawnShapeCount(container)).toBeGreaterThan(0)
  })
})

describe('parseSvgType validates rather than casts', () => {
  it('accepts every real Shopify tag in the live catalog', () => {
    // Captured from the connected store. These are the exact tag values on the
    // 22 published products; nine of them named shapes the union did not have.
    const liveTags = [
      'ring-arc',
      'ring-halo',
      'ring-facet',
      'ring-split',
      'necklace-disc',
      'necklace-bar',
      'earring-stud',
      'earring-hoop',
      'earring-threader',
      'bracelet-cuff',
      'bracelet-chain',
      'bracelet-bead',
      'charm-anchor',
      'charm-star',
      'charm-disc',
      'charm-heart',
    ]
    for (const tag of liveTags) {
      expect(isHJSvgType(tag), `"${tag}" is tagged in Shopify but not a known type`).toBe(true)
      expect(parseSvgType([`svg:${tag}`], 'rings').matched).toBe(true)
    }
  })

  it('falls back to the collection, not to a ring, for an unknown tag', () => {
    const result = parseSvgType(['svg:necklace-invented'], 'necklaces')
    expect(result.matched).toBe(false)
    expect(result.unknownTag).toBe('necklace-invented')
    expect(result.svgType).toBe('necklace-drop')
  })

  it('reports the collection fallback for each collection', () => {
    expect(parseSvgType([], 'rings').svgType).toBe('ring-arc')
    expect(parseSvgType([], 'necklaces').svgType).toBe('necklace-drop')
    expect(parseSvgType([], 'earrings').svgType).toBe('earring-hoop')
    expect(parseSvgType([], 'bracelets').svgType).toBe('bracelet-cuff')
    expect(parseSvgType([], 'charms').svgType).toBe('charm-classic')
  })

  it('still reads the handle when no tag is present', () => {
    expect(parseSvgType([], 'rings', 'orbit-pendant-necklace').svgType).toBe('necklace-drop')
    expect(parseSvgType([], 'rings', 'star-charm-titanium').svgType).toBe('charm-classic')
  })

  it('is case-insensitive — Shopify tags are free text', () => {
    expect(parseSvgType(['SVG:Ring-Halo'], 'rings').svgType).toBe('ring-halo')
  })
})
