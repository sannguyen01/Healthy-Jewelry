import { describe, it, expect, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * Satori — the renderer behind `next/og` — has no block layout. Any `<div>`
 * with more than one child **must** declare `display: 'flex'` or
 * `display: 'none'`, or rendering throws:
 *
 *   Expected <div> to have explicit "display: flex" or "display: none"
 *
 * The throw happens at request time, not build time, so the route compiles,
 * type-checks, deploys, and then fails on every social-share crawl. It logged
 * 33 times in production before anyone looked, and the cost is invisible: a
 * broken share card does not error for the customer, it just makes the link
 * look dead.
 *
 * Checking the rule rather than the one instance is the point. The defect was a
 * single unstyled wrapper, but nothing stopped the next one — every future
 * `<div>` added to these files is subject to the same constraint, and no type
 * expresses it.
 *
 * `next/og` is mocked so the real element tree can be walked without invoking
 * Satori or rasterising anything.
 */

let captured: ReactNode = null

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      captured = element
    }
  },
}))

interface StyledProps {
  style?: Record<string, unknown>
  children?: ReactNode
}

/** Every `<div>` in the tree that needs `display` and does not declare it. */
function findUndeclaredDivs(node: ReactNode, path = 'root'): string[] {
  if (!isValidElement(node)) return []

  const element = node as ReactElement<StyledProps>
  const { style, children } = element.props
  const problems: string[] = []

  // `Children.toArray` drops null, undefined and booleans, so a conditionally
  // rendered child (`{price && <div/>}`) does not inflate the count when the
  // condition is false — which is the state Satori would actually see.
  const childList = Children.toArray(children)

  if (element.type === 'div' && childList.length > 1) {
    const display = style?.display
    if (display !== 'flex' && display !== 'none') {
      problems.push(`${path}: <div> with ${childList.length} children, display=${String(display)}`)
    }
  }

  childList.forEach((child, i) => {
    problems.push(...findUndeclaredDivs(child, `${path} > [${i}]`))
  })

  return problems
}

/**
 * Invoke a route's default export and hand back the element the mocked
 * `ImageResponse` captured. The return value of the route itself is discarded —
 * it is a (mocked) `ImageResponse`, not a React node.
 */
async function treeFor(load: () => Promise<unknown>): Promise<ReactNode> {
  captured = null
  await load()
  return captured
}

describe('Open Graph images satisfy Satori layout rules', () => {
  it('the site-wide card declares display on every multi-child div', async () => {
    const { default: Image } = await import('@/app/opengraph-image')
    const tree = await treeFor(async () => Image())

    expect(tree, 'ImageResponse was never constructed — the mock did not capture').not.toBeNull()
    expect(findUndeclaredDivs(tree)).toEqual([])
  })

  it('the product card declares display on every multi-child div', async () => {
    const { default: Image } = await import('@/app/products/[handle]/opengraph-image')
    // Any handle resolves: without Shopify credentials `getProduct` falls back
    // to the static catalogue, and the layout under test is data-independent.
    const tree = await treeFor(async () =>
      Image({ params: Promise.resolve({ handle: 'dome-ring-titanium' }) }),
    )

    expect(tree, 'ImageResponse was never constructed — the mock did not capture').not.toBeNull()
    expect(findUndeclaredDivs(tree)).toEqual([])
  })

  it('the walker actually detects a violation', async () => {
    // Without this, a walker that silently returned [] would make both
    // assertions above pass while checking nothing.
    const bad = (
      <div>
        <span>one</span>
        <span>two</span>
      </div>
    )
    expect(findUndeclaredDivs(bad)).toHaveLength(1)

    const good = (
      <div style={{ display: 'flex' }}>
        <span>one</span>
        <span>two</span>
      </div>
    )
    expect(findUndeclaredDivs(good)).toEqual([])
  })
})
