import { test, expect, type Page } from './support/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainNav } from '../src/config/navigation'
import { nameShownFromPx } from '../src/lib/design/lockupBreakpoint'
import {
  describeOffenders,
  minimumFittingWidth,
  offendersPastViewport,
  settle,
  sweep,
  LAYOUT_SEGMENTS,
  type FitProbe,
  type Offender,
} from './support/viewportFit'

/**
 * The header has to fit the phone it is rendered on.
 *
 * It did not. On the build this spec was written against, `<header>` required
 * **434px** to lay out — 40px padding, a 182px brand lockup pinned at
 * `flexShrink: 0`, and a 212px cluster of four text controls with no shrink
 * capacity anywhere — so every viewport below 434px pushed the excess past the
 * right edge instead of absorbing it. With one item in the bag the count badge
 * took it to 455px. Measured overhang: 114px at 320px, 74px at 360px, 24px at
 * 390px, 2px at 412px. The casualty was the MENU button, which on a phone is
 * the only route to navigation at all.
 *
 * Three separate things in this suite could have caught it and did not, which is
 * why the assertions below are shaped the way they are:
 *
 *   - `navigation.spec.ts` asserts the menu toggle `toBeVisible()` at a 390px
 *     viewport. It passed, while `document.elementFromPoint()` at that button's
 *     own centre returned `null`. Visibility is a rendering predicate, not a
 *     containment predicate.
 *   - The same file `.click()`s that button and passed too: Playwright picks an
 *     in-viewport point inside the element rather than its geometric centre.
 *   - A `document.scrollWidth` guard would have been blind twice over. See the
 *     header comment in `support/viewportFit.ts`.
 *
 * So every check here is geometric, and the interesting one is not "does it
 * overflow at the widths we happened to list" but "what is the narrowest width
 * at which it fits" — a number that can be compared against the floor and that
 * names its own regression when it moves.
 */

/** The narrowest viewport the storefront supports. iPhone SE / small Android. */
const SUPPORTED_FLOOR_PX = 320

/**
 * 8px is finer than any real device gap and coarse enough to stay cheap: the
 * page is resized, not reloaded, so 141 widths cost 141 reflows.
 */
const SWEEP = { from: SUPPORTED_FLOOR_PX, to: 1440, step: 8 }

/** Real device widths, plus the two either side of the nav's own breakpoint. */
const DEVICE_WIDTHS = [320, 360, 375, 390, 412, 414, 768, 769, 1024, 1440]

const headerFits: FitProbe = (page) => offendersPastViewport(page, 'header')

/**
 * Below this the header shows the knot mark without the name. Read out of `globals.css` by the
 * same function the unit tests use, so the stylesheet is the one place it is decided; this spec
 * checks that the browser renders what the stylesheet says, at the breakpoint's own two pixels
 * as well as across the sweep (whose 8px step would otherwise straddle a small drift).
 */
const NAME_SHOWN_FROM_PX = (() => {
  const px = nameShownFromPx(readFileSync(join(__dirname, '../src/app/globals.css'), 'utf8'))
  if (px === undefined) throw new Error('the lockup breakpoint rule is missing from globals.css')
  return px
})()

/**
 * How far above the measured fit the breakpoint may sit. The measurement bounds it from below
 * (never show a name that crowds a control); this bounds it from above, so hiding the name on
 * phones where it fits comfortably — a breakpoint raised to 700px, say — fails too. 16px is two
 * sweep steps: room for font-rendering variance, not for a different decision.
 */
const BREAKPOINT_HEADROOM_MAX_PX = 16

/** The header mark's rendered width: 30px alone, 24px beside the name on phones, 28px on desktop. */
const MARK_PX = { min: 24, max: 30 }

interface LockupState {
  viewport: number
  shown: boolean
  /** How much of the name the box hides: `scrollWidth - clientWidth`. 0 when whole. */
  cutPx: number
  /**
   * The narrower of the two gaps between the lockup and its neighbours (MENU on the left, the
   * first visible control on the right). Fitting is not the same as not overlapping: at 320px
   * the whole name fits with under 8px of air either side, and reads as one run-on line.
   */
  clearancePx: number
  /** The gap the header's own controls keep between each other (`.hj-header-right`). */
  controlGapPx: number
  mark: { left: number; right: number; width: number }
}

/** The lockup's geometry, or the name of the part that could not be found. */
async function lockupState(page: Page): Promise<LockupState> {
  const state = await page.evaluate((): LockupState | string => {
    const link = document.querySelector('header a.hj-lockup')
    const mark = link?.querySelector('img[data-brand-mark]')
    const text = link?.querySelector<HTMLElement>('.hj-lockup-text')
    if (!link) return 'header a.hj-lockup'
    if (!mark) return 'img[data-brand-mark] inside the lockup'
    if (!text) return '.hj-lockup-text inside the lockup'
    const box = mark.getBoundingClientRect()
    const shown = getComputedStyle(text).display !== 'none'
    const lockup = link.getBoundingClientRect()
    const menu = document.querySelector('header .hj-menu-btn')?.getBoundingClientRect()
    const rightCluster = document.querySelector<HTMLElement>('header .hj-header-right')
    const firstRight = [...(rightCluster?.children ?? [])]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.width > 0)
    if (!menu) return 'header .hj-menu-btn'
    if (!rightCluster) return 'header .hj-header-right'
    if (!firstRight) return 'a visible control in .hj-header-right'
    // `gap` is how the cluster spaces its controls. If that ever moves to margins, columnGap
    // reads "normal", parses as NaN, and `clearance < NaN` is false for every width: the check
    // would pass having compared nothing. So a NaN is reported as a missing part.
    if (Number.isNaN(Number.parseFloat(getComputedStyle(rightCluster).columnGap)))
      return 'a numeric column-gap on .hj-header-right'
    return {
      viewport: window.innerWidth,
      shown,
      cutPx: shown ? text.scrollWidth - text.clientWidth : 0,
      clearancePx: Math.min(lockup.left - menu.right, firstRight.left - lockup.right),
      controlGapPx: Number.parseFloat(getComputedStyle(rightCluster).columnGap),
      mark: { left: box.left, right: box.right, width: Math.round(box.width) },
    }
  })
  if (typeof state === 'string') throw new Error(`brand lockup probe: no ${state} at ${page.viewportSize()?.width}px`)
  return state
}

test.describe('Header fit', () => {
  // The nav changes state (overlay, solid) as the hero's end marker passes the top, and the hero
  // staggers its children in with CSS. Neither moves the header's own box, but measuring 141 widths
  // through live transitions invites a torn frame for no benefit — and
  // `globals.css` already collapses every transition under reduced motion, so
  // this exercises a path the site ships.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  // One state, not two. There used to be an 'empty bag' / 'bag with an item' pair, because
  // the Bag control carried a count badge worth an extra ~21px and the header had to fit
  // with it. The Bag control is gone with the cart, so the second state cannot be reached
  // and measuring it would assert on a header the site cannot render.
  //
  // CLAUDE.md's 414px/435px figures stay: they are classified HISTORICAL and are the record
  // of what the defect cost against a four-control header. The live number is the
  // `minimum fitting width` annotation this spec prints on every run.
  for (const state of ['default'] as const) {
    test(`no header control leaves the viewport at any supported width — ${state}`, async ({
      page,
    }) => {
      // A 141-width sweep: ~11-13s alone, a third of the default budget. See the note on the
      // lockup sweep below for what that costs under the full suite.
      test.slow()
      await page.goto('/')
      await expect(page.locator('header')).toBeVisible()

      const findings = await sweep(page, SWEEP, headerFits)
      // A sweep that measured nothing would pass silently — the same vacuity
      // `homepage-fetch-budget.test.ts` guards against by asserting its parse.
      expect(findings.length).toBe(Math.floor((SWEEP.to - SWEEP.from) / SWEEP.step) + 1)

      const failures = findings.filter((f) => f.offenders.length > 0)
      expect(
        failures.map((f) => describeOffenders(f.width, f.offenders)),
        `The header overflows at ${failures.length} of ${findings.length} sampled widths ` +
          `(${state}). Narrowest failing width: ${failures[0]?.width}px.`
      ).toEqual([])
    })
  }

  test('the header fits the narrowest supported phone, in every layout mode', async ({ page }) => {
    await page.goto('/')

    const report: string[] = []
    for (const segment of LAYOUT_SEGMENTS) {
      const minimum = await minimumFittingWidth(page, headerFits, segment)
      report.push(`${segment.label}: ${minimum === null ? 'never fits' : `${minimum}px`}`)

      // `null` is a different finding from a high threshold and must not be
      // reported as one: it means the header does not fit even at the widest
      // width in this mode.
      expect(
        minimum,
        `The header never fits anywhere in ${segment.label} — not even at ` +
          `${segment.hi}px. Measured: ${report.join(' · ')}`
      ).not.toBeNull()

      const ceiling = Math.max(SUPPORTED_FLOOR_PX, segment.lo)
      expect(
        minimum as number,
        `The header needs ${minimum}px in ${segment.label}, but the narrowest viewport it has ` +
          `to serve there is ${ceiling}px. The header is sized by its own contents — the brand ` +
          `wordmark, the control labels, the letter-spacing, and whether the bag badge is ` +
          `showing — so this usually means a label got longer or a control was added. Either ` +
          `shorten it, move it into the mobile overlay as Search already is, or ` +
          `make the change deliberately in src/components/layout/Nav.tsx. Measured: ` +
          report.join(' · ')
      ).toBeLessThanOrEqual(ceiling)
    }

    // Recorded on success too, not only on failure. The number is the artifact:
    // "the header needs 435px" is what made this defect legible in the first
    // place, and a passing run that discards it leaves the next reader with no
    // idea how much headroom they have before the floor.
    test.info().annotations.push({ type: 'minimum fitting width', description: report.join(' · ') })
  })

  test('every header control can be tapped where a thumb would aim', async ({ page }) => {
    // The assertion `toBeVisible()` does not make and `.click()` routes around:
    // the control's own centre point must resolve to the control. A control
    // whose centre is off-screen is not reachable by a thumb, however green
    // Playwright's actionability check comes back.
    await page.goto('/')
    const height = page.viewportSize()?.height ?? 844

    const unreachable: string[] = []
    for (const width of DEVICE_WIDTHS) {
      await page.setViewportSize({ width, height })
      await settle(page)
      const misses = await page.evaluate(() => {
        const header = document.querySelector('header')
        if (!header) return null
        const out: string[] = []
        for (const control of header.querySelectorAll('a, button')) {
          const style = getComputedStyle(control)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const box = control.getBoundingClientRect()
          if (box.width === 0 && box.height === 0) continue
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          if (!hit || !(control === hit || control.contains(hit) || hit.contains(control))) {
            out.push(
              `${control.getAttribute('aria-label') || (control.textContent || '').trim()} ` +
                `(centre ${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)} ` +
                `resolves to ${hit ? hit.nodeName.toLowerCase() : 'nothing — off-screen'})`
            )
          }
        }
        return out
      })
      expect(misses, `no <header> to measure at ${width}px`).not.toBeNull()
      for (const miss of misses as string[]) unreachable.push(`${width}px — ${miss}`)
    }

    expect(unreachable, `Header controls unreachable:\n  ${unreachable.join('\n  ')}`).toEqual([])
  })

  test('the brand lockup is whole or absent at every width — never cut off', async ({ page }) => {
    // The same 141-width sweep plus the breakpoint's two pixels: 10.6-11.7s alone (eight runs,
    // 2026-10-04), and once past 30s inside the full two-worker suite, where it shares the
    // machine with the 14-route glyph-coverage pass. Its cost is the width count, not a wait
    // that can hang, so the budget is tripled rather than the sweep thinned.
    test.slow()
    // ADR 016 makes the brand the thing that gives. Since 2026-10-04 it gives in two steps: the
    // name stays whole while it fits, and below NAME_SHOWN_FROM_PX it is not rendered at all and
    // the knot mark carries the brand alone. What must never happen is the third state an
    // ellipsis allows — "HEALTHY JEWEL…" — which reads as a fault rather than a choice.
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()

    const judge = async (p: Page): Promise<Offender[]> => {
      const state = await lockupState(p)
      const out: Offender[] = []
      if (state.shown && state.cutPx > 0)
        out.push({ label: `the name, cut off by ${state.cutPx}px`, overhangPx: state.cutPx, edge: 'right' })
      if (state.shown && state.clearancePx < state.controlGapPx)
        out.push({
          label: `the name has ${state.clearancePx.toFixed(1)}px of air beside a control (needs ${state.controlGapPx}px)`,
          overhangPx: 0,
          edge: 'right',
        })
      if (state.shown !== state.viewport >= NAME_SHOWN_FROM_PX)
        out.push({ label: `the name is ${state.shown ? 'shown' : 'hidden'} at ${state.viewport}px`, overhangPx: 0, edge: 'right' })
      if (state.mark.width < MARK_PX.min || state.mark.width > MARK_PX.max)
        out.push({ label: `the knot mark is ${state.mark.width}px wide`, overhangPx: 0, edge: 'right' })
      if (state.mark.left < 0) out.push({ label: 'the knot mark', overhangPx: -state.mark.left, edge: 'left' })
      if (state.mark.right > state.viewport)
        out.push({ label: 'the knot mark', overhangPx: state.mark.right - state.viewport, edge: 'right' })
      return out
    }
    const findings = await sweep(page, SWEEP, judge)
    expect(findings.length).toBe(Math.floor((SWEEP.to - SWEEP.from) / SWEEP.step) + 1)
    // The breakpoint's own two pixels: the last width without the name and the first with it.
    for (const width of [NAME_SHOWN_FROM_PX - 1, NAME_SHOWN_FROM_PX]) {
      findings.push(...(await sweep(page, { from: width, to: width, step: 1 }, judge)))
    }

    const failures = findings.filter((f) => f.offenders.length > 0)
    expect(
      failures.map((f) => `${f.width}px — ${f.offenders.map((o) => o.label).join('; ')}`),
      'The header lockup must show the whole name or none of it, with the mark inside the viewport.'
    ).toEqual([])
  })

  test('the name is shown only where it fits whole with room around it, and hidden only just below that', async ({
    page,
  }) => {
    // The breakpoint is a measurement, not a guess: force the name visible, find the narrowest
    // width at which it is uncut, pushes no control off-screen, and keeps at least the gap the
    // controls keep between themselves on both sides — then require the breakpoint to sit at or
    // above that width. Printed on every run so the headroom is visible before it is spent.
    //
    // The first estimate, made before this test existed, said the name could not fit at 320px
    // at all. Measured, it fits there with 4.9px to spare each side: not a cut, but not a
    // composition either. "Fits" had to mean "fits with air", or the test would pass a header a
    // designer would reject.
    await page.goto('/')
    // Force the configuration that would render if the name were kept: the name shown, and the
    // mark at its beside-the-name size rather than the larger size it takes when alone.
    await page.addStyleTag({
      content:
        '.hj-lockup[data-variant="inline"] .hj-lockup-text { display: inline !important; } ' +
        `.hj-lockup[data-variant="inline"] .hj-lockup-mark { width: ${MARK_PX.min}px !important; height: ${MARK_PX.min}px !important; }`,
    })

    const fitsWhole: FitProbe = async (p) => {
      const offenders = await headerFits(p)
      const state = await lockupState(p)
      if (state.cutPx > 0) offenders.push({ label: 'the name, cut off', overhangPx: state.cutPx, edge: 'right' })
      if (state.clearancePx < state.controlGapPx)
        offenders.push({ label: 'the name, crowding a control', overhangPx: 0, edge: 'right' })
      return offenders
    }
    const mobile = LAYOUT_SEGMENTS[0]
    const fitsFrom = await minimumFittingWidth(page, fitsWhole, mobile)
    test.info().annotations.push({
      type: 'brand lockup',
      description:
        `whole name fits with the controls' spacing from ${fitsFrom ?? 'never'}px; ` +
        `shown from ${NAME_SHOWN_FROM_PX}px` +
        (fitsFrom === null ? '' : `; ${NAME_SHOWN_FROM_PX - fitsFrom}px of headroom`),
    })
    expect(fitsFrom, `the whole name never fits in ${mobile.label}`).not.toBeNull()
    expect(fitsFrom as number, 'the name is shown where it crowds a control').toBeLessThanOrEqual(NAME_SHOWN_FROM_PX)
    expect(
      NAME_SHOWN_FROM_PX - (fitsFrom as number),
      `the name is hidden on ${NAME_SHOWN_FROM_PX - (fitsFrom as number)}px of widths where it fits`
    ).toBeLessThanOrEqual(BREAKPOINT_HEADROOM_MAX_PX)
  })

  /**
   * **The open menu has to fit the screen it is opened on, in height as well as in width.**
   *
   * Every probe above, and the drawer's control checks in `layout-invariants.spec.ts`, ask about
   * *width*. Nothing asked about height, and the menu this guard was first written against
   * (the dark overlay of six links at up to 72px on the body's 1.65 line-height, 2026-10-09) failed
   * it on eight of twelve real screens: at 1440x900 the first link started at 14px, under the header,
   * with its top half drawn over the brand name; at 1366x768 it started 52px *above the viewport*
   * and the last ended 52px below it; on a landscape phone 219px above. That drawer had
   * `overflow: visible`, so the part off the screen could be neither seen nor scrolled to, and
   * `toBeVisible()` passed on all of them because the links were rendered. The ADR 016 predicate is
   * containment, not rendering.
   *
   * The archive that replaced it scrolls and starts below the bar. This holds it there: at each real
   * screen no control may start above the bottom of the header, and every control must end inside the
   * viewport, or, on a screen too short for the menu, the drawer must scroll and the last control must
   * be reachable by scrolling it. The sizes include the laptop heights (768, 720) and the small phones
   * (667, 640, 568) that a tall list fails on first.
   */
  const MENU_SCREENS: Array<[number, number]> = [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [844, 390],
    [430, 932],
    [390, 844],
    [375, 667],
    [360, 640],
    [320, 568],
  ]

  test('the open menu fits the screen: no control under the header, none out of reach', async ({ page }) => {
    const failures: string[] = []
    for (const [width, height] of MENU_SCREENS) {
      await page.setViewportSize({ width, height })
      await page.goto('/about')
      await page.getByRole('button', { name: /open menu/i }).click()
      await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible()
      // The archive rises 16px into place as the drawer opens; measure it where it rests.
      await page.waitForFunction(() => {
        const inner = document.querySelector('.hj-archive')
        return inner !== null && ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(inner).transform)
      })

      const m = await page.evaluate(() => {
        const header = (document.querySelector('header') as HTMLElement).getBoundingClientRect().bottom
        const drawer = document.querySelector('.hj-menu-drawer') as HTMLElement
        const controls = () =>
          [...drawer.querySelectorAll('a[href], button, input')]
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { label: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || el.tagName).trim().slice(0, 24), top: r.top, bottom: r.bottom, height: r.height }
            })
            .filter((c) => c.height > 0)
        drawer.scrollTop = 0
        const atTop = controls()
        const scrolls = ['auto', 'scroll'].includes(getComputedStyle(drawer).overflowY) && drawer.scrollHeight > drawer.clientHeight
        drawer.scrollTop = drawer.scrollHeight
        const atEnd = controls()
        return { header, vh: window.innerHeight, atTop, atEnd, scrolls }
      })

      const where = `${width}x${height}`
      const first = m.atTop[0]
      if (first.top < m.header - 0.5)
        failures.push(`${where}: "${first.label}" starts at ${first.top.toFixed(0)}px, above the header's bottom edge (${m.header.toFixed(0)}px)`)
      const last = m.atTop[m.atTop.length - 1]
      if (last.bottom > m.vh + 0.5) {
        // Past the bottom: only acceptable if the drawer scrolls and the end of the menu can be reached.
        const reachable = m.scrolls && m.atEnd[m.atEnd.length - 1].bottom <= m.vh + 0.5
        if (!reachable)
          failures.push(
            `${where}: "${last.label}" ends at ${last.bottom.toFixed(0)}px, past the viewport (${m.vh}px)` +
              (m.scrolls ? ', and scrolling the drawer does not bring it in' : ', and the drawer does not scroll')
          )
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  test('the mobile overlay carries everything the header sheds', async ({ page }) => {
    // Search is hidden from the header below 769px. That is only safe if it is
    // somewhere else, and nothing else in the suite would notice a control that
    // quietly stopped existing on phones — the overlay shipped for months with no
    // account entry at all, which is the defect this assertion was written for.
    // Account itself has since been removed outright; Search is what remains to
    // protect, and the shape of the protection is unchanged.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: /open menu/i }).click()

    const overlay = page.getByRole('dialog', { name: /mobile navigation/i })
    await expect(overlay).toBeVisible()

    for (const link of mainNav) {
      await expect(
        overlay.getByRole('link', { name: new RegExp(`^${link.label}$`, 'i') }),
        `the mobile overlay is missing "${link.label}"`
      ).toBeVisible()
    }
    await expect(
      overlay.getByRole('button', { name: /search/i }),
      'Search is hidden from the header below 769px and must be reachable in the overlay'
    ).toBeVisible()
  })
})
