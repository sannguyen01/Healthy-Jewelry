import { test, expect, type Page } from '@playwright/test'
import { mainNav } from '../src/config/navigation'
import {
  describeOffenders,
  minimumFittingWidth,
  offendersPastViewport,
  settle,
  sweep,
  LAYOUT_SEGMENTS,
  type FitProbe,
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
 * Puts a real item in the bag through the UI rather than by writing
 * `localStorage`, so the badge under test is the one the store actually
 * produces. It is worth +21px of header width, and the production screenshot
 * that prompted this spec was a `BAG (4)` state — a fit test run only on an
 * empty bag measures the header 21px narrower than visitors experience it.
 */
async function seedBag(page: Page): Promise<void> {
  await page.goto('/products/arc-band-titanium')
  // Arc Band is a ring: Add to Bag stays disabled until a size is chosen.
  await page.getByRole('button', { name: /ring size 7/i }).click()
  await page.getByRole('button', { name: /add.*to bag/i }).click()
  await expect(page.getByRole('button', { name: /open bag — 1 item/i })).toBeVisible()
  await page.keyboard.press('Escape')
}

/**
 * Loads the homepage with a seeded bag and waits for the badge to actually be
 * on screen before anything is measured.
 *
 * The wait is the whole point. The bag is persisted to `localStorage` and read
 * back after mount (`hasHydrated` in `src/store/cart.tsx`), so a sweep that
 * starts as soon as the header is visible races that read and measures the
 * empty-bag header under a seeded-bag name. The first run of this spec did
 * exactly that: it reported a 435px requirement — the empty-bag number — for
 * the case that exists specifically to measure the extra 21px.
 */
async function gotoHomeWithSeededBag(page: Page): Promise<void> {
  await seedBag(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: /open bag — 1 item/i })).toBeVisible()
}

test.describe('Header fit', () => {
  // The nav crossfades its background at scrollY > 60 and the hero staggers its
  // children in. Neither moves the header's own box, but measuring 141 widths
  // through live transitions invites a torn frame for no benefit — and
  // `globals.css` already collapses every transition under reduced motion, so
  // this exercises a path the site ships.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  for (const state of ['empty bag', 'bag with an item'] as const) {
    test(`no header control leaves the viewport at any supported width — ${state}`, async ({
      page,
    }) => {
      if (state === 'bag with an item') await gotoHomeWithSeededBag(page)
      else await page.goto('/')
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
    await gotoHomeWithSeededBag(page)

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
          `shorten it, move it into the mobile overlay as Search and Account already are, or ` +
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
    await gotoHomeWithSeededBag(page)
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

  test('the mobile overlay carries everything the header sheds', async ({ page }) => {
    // Search and Account are hidden from the header below 769px. That is only
    // safe if they are somewhere else, and nothing else in the suite would
    // notice a control that quietly stopped existing on phones — the overlay
    // shipped for months with no account entry at all.
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
      overlay.getByRole('link', { name: /account/i }),
      'Account is hidden from the header below 769px and must be reachable in the overlay'
    ).toBeVisible()
    await expect(
      overlay.getByRole('button', { name: /search/i }),
      'Search is hidden from the header below 769px and must be reachable in the overlay'
    ).toBeVisible()
  })
})
