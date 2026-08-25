import type { Page } from '@playwright/test'

/**
 * Geometry helpers shared by the width-sensitive specs.
 *
 * **Why every probe here measures element boxes against `window.innerWidth`, and
 * never `document.documentElement.scrollWidth`.** The obvious overflow detector
 * is blind on this site, for two compounding reasons that are each sufficient on
 * their own:
 *
 *   1. The header is `position: fixed`. Fixed boxes are positioned against the
 *      viewport and do not contribute to the document's scrollable overflow
 *      region, so a fixed element 114px wider than the viewport produces no
 *      horizontal scroll and no change in `scrollWidth`.
 *   2. `src/app/globals.css` sets `overflow-x: hidden` on both `html` and
 *      `body`, which clamps `scrollWidth` to `clientWidth` regardless of what
 *      overflows. That rule is also what turns this whole class of bug from a
 *      visible scrollbar into silent amputation: the content is not pushed
 *      off-screen-but-reachable, it is cut off.
 *
 * Measured on the build that shipped the header-overflow defect:
 * `document.documentElement.scrollWidth === window.innerWidth` at every width
 * from 320px to 1440px, including the widths where the MENU button — the only
 * route to navigation on a phone — hung 114px past the right edge.
 *
 * The same measurement is why nothing else caught it either. Playwright's
 * `toBeVisible()` is a rendering predicate, not a containment predicate: at a
 * 390px viewport it returned true for a button whose own centre point resolved
 * `document.elementFromPoint()` to `null`. And `.click()` deliberately picks an
 * in-viewport point inside the element rather than its geometric centre, so the
 * click test passed too. A thumb has neither affordance.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Overlap smaller than this is a sub-pixel rounding artefact, not a defect. */
export const OVERLAP_TOLERANCE_PX = 2

/**
 * Sub-pixel slack on the viewport edge. Smaller than OVERLAP_TOLERANCE_PX on
 * purpose: an overlap needs area before it means anything, whereas a control
 * hanging a whole pixel past the edge is already cut.
 */
export const OVERHANG_TOLERANCE_PX = 0.5

export function intersection(
  a: Box,
  b: Box,
  tolerancePx: number = OVERLAP_TOLERANCE_PX
): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right - x <= tolerancePx || bottom - y <= tolerancePx) return null
  return { x, y, width: right - x, height: bottom - y }
}

export interface Offender {
  /** Accessible name where there is one, so a failure names what a visitor lost. */
  label: string
  /** How far past the nearest viewport edge the element reaches, in CSS pixels. */
  overhangPx: number
  edge: 'left' | 'right'
}

/** A width-independent question asked of the page at one viewport width. */
export type FitProbe = (page: Page) => Promise<Offender[]>

/**
 * Guarantees a layout change has been painted before anything is measured.
 * Same double-`requestAnimationFrame` idiom `hero-legibility.spec.ts` uses
 * before its screenshots, for the same reason: one frame is not enough.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

/**
 * Every interactive control under `rootSelector` — plus the root itself — that
 * reaches past a viewport edge.
 *
 * Throws when the root is not present. A probe that quietly returns "no
 * offenders" because it could not find the thing it was measuring is the
 * failure mode `hero-legibility.spec.ts` hit when it read a deleted custom
 * property, got NaN, and kept passing.
 */
export async function offendersPastViewport(
  page: Page,
  rootSelector: string,
  tolerancePx: number = OVERHANG_TOLERANCE_PX
): Promise<Offender[]> {
  const found = await page.evaluate(
    ({ selector, tolerance }) => {
      const root = document.querySelector(selector)
      if (!root) return null

      const viewportWidth = window.innerWidth
      const offenders: Array<{ label: string; overhangPx: number; edge: 'left' | 'right' }> = []

      const nameOf = (el: Element): string => {
        const aria = el.getAttribute('aria-label')
        if (aria) return aria
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        if (text) return text.slice(0, 40)
        return el.tagName.toLowerCase()
      }

      const consider = (el: Element) => {
        const style = getComputedStyle(el)
        // `display: none` yields a zero box; `visibility: hidden` does not, and
        // a hidden control cannot be cut off because it is not there.
        if (style.visibility === 'hidden' || style.display === 'none') return
        const box = el.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) return

        const rightOverhang = box.right - viewportWidth
        const leftOverhang = -box.left
        if (rightOverhang > tolerance) {
          offenders.push({ label: nameOf(el), overhangPx: rightOverhang, edge: 'right' })
        } else if (leftOverhang > tolerance) {
          offenders.push({ label: nameOf(el), overhangPx: leftOverhang, edge: 'left' })
        }
      }

      consider(root)
      for (const el of root.querySelectorAll('a, button')) consider(el)
      return offenders
    },
    { selector: rootSelector, tolerance: tolerancePx }
  )

  if (found === null) {
    throw new Error(
      `offendersPastViewport: no element matches ${JSON.stringify(rootSelector)}. ` +
        'This probe has no default to fall back to — a missing root must fail the test, ' +
        'never silently report that nothing overflows.'
    )
  }
  return found
}

export function describeOffenders(width: number, offenders: readonly Offender[]): string {
  return (
    `${width}px — ${offenders.length} element(s) outside the viewport:\n  ` +
    offenders
      .map((o) => `${o.label}: ${o.overhangPx.toFixed(1)}px past the ${o.edge} edge`)
      .join('\n  ')
  )
}

export interface WidthRange {
  from: number
  to: number
  step: number
}

export interface Finding {
  width: number
  offenders: Offender[]
}

/**
 * Runs `probe` at every width in `range`, on a page that is resized rather than
 * reloaded — 141 navigations would dominate the suite's runtime, 141 reflows do
 * not.
 *
 * The invariant a sweep is for is width-*independent*: "nothing a visitor must
 * tap leaves the viewport" is true or false at each width on its own terms. It
 * is deliberately not a discontinuity detector — the hero recomposes at 900px
 * and the nav collapses at 769px by design, and a check that flagged layout
 * changes would flag those.
 */
export async function sweep(page: Page, range: WidthRange, probe: FitProbe): Promise<Finding[]> {
  const findings: Finding[] = []
  const height = page.viewportSize()?.height ?? 844
  for (let width = range.from; width <= range.to; width += range.step) {
    await page.setViewportSize({ width, height })
    await settle(page)
    findings.push({ width, offenders: await probe(page) })
  }
  return findings
}

export interface Segment {
  label: string
  lo: number
  hi: number
}

/**
 * Fit is monotonic in width only *within* one layout mode, and this site has two
 * width discontinuities: `Nav` swaps its centre links for the menu toggle at
 * 769px (`src/components/layout/Nav.tsx`), and the hero swaps a full-bleed
 * composition for a stacked one at 901px (`src/components/home/Hero.tsx`).
 * Binary-searching across either boundary would be searching a non-monotonic
 * predicate and could return any answer at all, so the search runs per segment
 * and `sweep` is what establishes that monotonicity actually holds inside each.
 */
export const LAYOUT_SEGMENTS: Segment[] = [
  { label: 'mobile nav (<=768px)', lo: 320, hi: 768 },
  { label: 'desktop nav, full-bleed hero (769-900px)', lo: 769, hi: 900 },
  { label: 'desktop nav, split hero (>=901px)', lo: 901, hi: 1440 },
]

/**
 * The narrowest width in `segment` at which `probe` reports nothing.
 *
 * Binary search rather than sampling, because the number itself is the
 * actionable output: "the header requires 434px" is a fact someone can act on,
 * where "something failed somewhere between 320 and 414" is a bisect to run by
 * hand. Sampling still has a job — see `sweep` — it is just the wrong instrument
 * for a monotonic threshold.
 *
 * Returns `null` when even `segment.hi` does not fit, which is a different
 * finding from a high threshold and must not be reported as one.
 */
export async function minimumFittingWidth(
  page: Page,
  probe: FitProbe,
  segment: Segment
): Promise<number | null> {
  const height = page.viewportSize()?.height ?? 844
  const fitsAt = async (width: number): Promise<boolean> => {
    await page.setViewportSize({ width, height })
    await settle(page)
    return (await probe(page)).length === 0
  }

  if (!(await fitsAt(segment.hi))) return null
  if (await fitsAt(segment.lo)) return segment.lo

  // Invariant: `lo` does not fit, `hi` does. Converges on the boundary between.
  let lo = segment.lo
  let hi = segment.hi
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await fitsAt(mid)) hi = mid
    else lo = mid
  }
  return hi
}
