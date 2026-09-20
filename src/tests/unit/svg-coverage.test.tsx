import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { HJ_SVG_TYPES } from '@/lib/svg/types'
import { getAllProducts } from '@/lib/catalog'

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
 * The live Shopify catalog then made it worse. Nine products carried `svg:` tags
 * for shapes the union never contained (`ring-halo`, `charm-star`, …), and the
 * old mapper cast the tag straight to `HJSvgType`. A tag anyone could type in
 * Shopify Admin could blank out a product tile with no error anywhere.
 *
 * That second failure mode is gone with the tag parser: `svgType` is a field in a
 * reviewed JSON record now, not a free-text tag from an admin console. What replaces the
 * parser check is the last block in this file — every `svgType` the *catalogue* names must
 * be a type `JewelrySVG` draws. The channel changed; the question did not.
 *
 * This is the cheapest possible guard against all of it: walk the list, render each
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

/**
 * **The catalogue's side of the same question.**
 *
 * The blocks above prove every *declared* type draws. This proves every *used* type is
 * declared — the direction the old `parseSvgType` tests covered, asked of the channel that
 * replaced Shopify tags.
 *
 * Both directions are needed and neither implies the other. A type declared and never used
 * is dead artwork, which is harmless; a type used and never declared renders the fallback
 * mark on a real product page, which is the defect that shipped nine times.
 */
describe('every illustration the catalogue names is one JewelrySVG draws', () => {
  const named = getAllProducts()
    .map((product) => (product.media.kind === 'illustration' ? product.media.svgType : null))
    .filter((svgType): svgType is string => svgType !== null)

  it('finds illustrations in the catalogue to check', () => {
    // Without this the assertion below is vacuously green on an empty list — the same
    // failure `cache-tag-contract.test.ts` records from reading a file by name.
    expect(named.length).toBeGreaterThan(0)
  })

  it.each([...new Set(named)])('%s is a declared type', (svgType) => {
    expect(
      (HJ_SVG_TYPES as readonly string[]).includes(svgType),
      `A catalogue record names svgType "${svgType}", which JewelrySVG does not draw. ` +
        `It would render the fallback mark on a real product page. Either add the ` +
        `illustration and a measured viewBox entry, or correct the record.`
    ).toBe(true)
  })

  it('renders real geometry for every illustration the catalogue actually uses', () => {
    // The end-to-end version: not "is this string in a list" but "does this product's
    // tile draw something". Cheap, and it is the assertion a reader of a blank tile would
    // have wanted to exist.
    for (const svgType of new Set(named)) {
      const { container } = render(<JewelrySVG type={svgType} />)
      expect(drawnShapeCount(container), `${svgType} is blank`).toBeGreaterThan(0)
      expect(
        container.querySelector('[data-svg-fallback]'),
        `${svgType} fell through to the fallback mark`
      ).toBeNull()
    }
  })
})
