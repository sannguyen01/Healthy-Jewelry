import { test, expect, type Locator, type Page } from './support/test'
import { SITE_NAME } from '../src/config/site'
import { heroMedia } from '../src/lib/catalog'

/**
 * The search control lives in two places depending on width, and these tests run
 * at both project defaults — 1280px in `chromium`, 412px in `mobile`.
 *
 * Below 769px the header sheds Search into the full-screen overlay, because keeping
 * four text controls in a 64px bar needed 435px of content and no phone is that wide
 * (see `e2e/header-fit.spec.ts`). Account used to move with it and has since been
 * removed outright, which leaves the header narrower than that measurement — the
 * breakpoint stays because the composition choice is still right. Resolving the control by
 * where it actually is, rather than pinning a viewport, keeps these tests
 * testing *search* rather than testing the breakpoint — which is what
 * `header-fit.spec.ts` is for.
 */
async function searchControl(page: Page): Promise<Locator> {
  const inHeader = page.locator('header').getByRole('button', { name: /search/i })
  const openMenu = page.getByRole('button', { name: /open menu/i })

  // Wait for the header to settle into *one* of its two compositions before asking
  // which one it is.
  //
  // `isVisible()` is a point-in-time question with no auto-wait — unlike almost every
  // other Playwright call in this suite. Asked before the header has rendered it
  // answers `false`, which is indistinguishable here from "this is the narrow
  // layout", and the helper then commits irreversibly to the mobile branch. At
  // 1280px there is no "open menu" button to click, so the failure surfaced 30
  // seconds later as `locator.click: Test timeout` on a control that was never
  // supposed to exist at that width — naming neither the race nor the real control.
  //
  // Observed on run 33306970766: of the three tests in this block that call this
  // helper, two passed and one failed, in the same project, in the same run. Same
  // code, same width, different answer — which is what a race looks like and what a
  // broken layout does not.
  //
  // `.or()` waits until either control is present, so the probe below is asked a
  // question the page has already finished answering. Resolving by *where the
  // control actually is* is deliberate and unchanged — pinning a viewport here would
  // make these tests assert the breakpoint, which is `header-fit.spec.ts`'s job.
  await inHeader.or(openMenu).first().waitFor({ state: 'visible' })

  if (await inHeader.isVisible()) return inHeader
  await openMenu.click()
  return page
    .getByRole('dialog', { name: /mobile navigation/i })
    .getByRole('button', { name: /search/i })
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('nav header is visible', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible()
  })

  test('brand wordmark and knot mark are visible', async ({ page }) => {
    // Scoped to the header: the footer carries the same lockup.
    const header = page.locator('header')
    await expect(header.getByText(SITE_NAME)).toBeVisible()
    await expect(header.locator('img[data-brand-mark]')).toBeVisible()
  })

  test('logo links to homepage', async ({ page }) => {
    // Scoped to the header: the footer carries an identically-labelled home
    // link, so a page-wide lookup resolves to two elements and trips strict
    // mode. Both links are correct — only the query was ambiguous.
    const homeLink = page.locator('header').getByRole('link', { name: `${SITE_NAME} — home` })
    await expect(homeLink).toBeVisible()
    await homeLink.click()
    await expect(page).toHaveURL('/')
  })

  test('the hero\'s primary action navigates to the pieces at /shop', async ({ page }) => {
    // It was "Collection nav link", and resolved to the hero's "Shop Collection" button by accident of its
    // label: the header has no such link. The control it meant is the hero's primary action (ADR 054 names it
    // "Explore the pieces"; the label itself is pinned by Hero.test.tsx).
    const link = page.locator('main > section').first().getByRole('link', { name: /explore the pieces/i })
    await link.click()
    await expect(page).toHaveURL(/\/shop/)
  })

  test('Our Story nav link navigates to /about', async ({ page }) => {
    const link = page.getByRole('link', { name: /our story/i }).first()
    await link.click()
    await expect(page).toHaveURL(/\/about/)
  })

  test('Contact nav link navigates to /contact', async ({ page }) => {
    const link = page.getByRole('link', { name: /contact/i }).first()
    await link.click()
    await expect(page).toHaveURL(/\/contact/)
  })

  /*
   * 'bag button opens cart drawer', 'cart drawer can be closed' and 'cart drawer closes on
   * Escape key' were here. All three went with the cart.
   *
   * Worth noting what they were actually covering, because it is not only the bag: the
   * Escape-key test was the suite's only assertion that a modal dialog in this app responds
   * to Escape at all. If a dialog is ever reintroduced — a size guide, an ambassador
   * enquiry form — that assertion needs to come back with it. `e2e/a11y.spec.ts` covers
   * axe rules, not keyboard dismissal.
   */

  test('search button is visible', async ({ page }) => {
    await expect(await searchControl(page)).toBeVisible()
  })

  test('search button navigates to /search', async ({ page }) => {
    await (await searchControl(page)).click()
    await expect(page).toHaveURL(/\/search/)
  })

  test('the search destination is usable, not just reachable', async ({ page }) => {
    // The button shipped for months with no click handler at all. Landing on
    // /search is only half of it — the page has to offer a working query input,
    // otherwise the control is still a dead end.
    await (await searchControl(page)).click()
    await expect(page).toHaveURL(/\/search/)

    // `searchbox`, not `textbox` — the input is `type="search"`.
    const input = page.getByRole('searchbox', { name: /search products/i })
    await expect(input).toBeVisible()
    await input.fill('titanium')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/search\?q=titanium/)
  })
})

test.describe('Search — a repeated query parameter', () => {
  test('?q=ring&q=band searches for the first value instead of failing', async ({ page }) => {
    // Next passes a repeated parameter as an array; the page called .trim() on it and
    // rendered "Something went wrong" (found 2026-10-04 by probing the running build).
    await page.goto('/search?q=ring&q=band')
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
    await expect(page.getByText(/results? for "ring"/i)).toBeVisible()
    await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible()
  })
})

test.describe('Navigation — mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('mobile menu toggle button is visible on small screens', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /open menu/i })
    await expect(toggle).toBeVisible()
  })

  test('clicking menu toggle opens mobile overlay', async ({ page }) => {
    await page.getByRole('button', { name: /open menu/i }).click()
    await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible()
  })

  test('mobile overlay shows nav links', async ({ page }) => {
    await page.getByRole('button', { name: /open menu/i }).click()
    const dialog = page.getByRole('dialog', { name: /mobile navigation/i })
    await expect(dialog.getByRole('link', { name: /^pieces$/i })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /^our story$/i })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /^contact$/i })).toBeVisible()
  })

  test('close button dismisses mobile overlay', async ({ page }) => {
    await page.getByRole('button', { name: /open menu/i }).click()
    await page.getByRole('button', { name: /close menu/i }).click()
    await expect(page.getByRole('dialog', { name: /mobile navigation/i })).not.toBeVisible()
  })
})

/**
 * **The header's state follows the hero it sits over, not a distance scrolled** (ADR 054).
 *
 * It read `scrollY > 60` on every route. That is wrong twice: a page with no hero was transparent for its
 * first 60px, and a hero taller than 60px went solid while the photograph was still under the bar. The state
 * now comes from the hero's own end marker, so these assert it at the moments the threshold got wrong.
 */
test.describe('Header — state follows the hero', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  const bar = (page: Page) => page.locator('header.hj-header')
  const hero = (page: Page) => page.locator('main > section').first()

  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      try { localStorage.setItem('hj-analytics-consent', 'denied') } catch { /* the notice shows; not what is measured here */ }
    })
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('on the home page it overlays the hero at the top', async ({ page }) => {
    await page.goto('/')
    await expect(bar(page)).toHaveAttribute('data-state', 'hero-overlay')
  })

  test('it says which tone the hero needs, as the record does', async ({ page }) => {
    await page.goto('/')
    await expect(bar(page)).toHaveAttribute('data-bar-tone', heroMedia().headerTone)
  })

  test('it is still an overlay well past the old 60px threshold, while the photograph is under it', async ({ page }) => {
    await page.goto('/')
    await expect(bar(page)).toHaveAttribute('data-state', 'hero-overlay')
    const reach = await hero(page).evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)
    expect(reach, 'the hero is taller than the old threshold plus the header').toBeGreaterThan(300)
    await page.evaluate(() => window.scrollTo(0, 200))
    await expect(bar(page), 'at 200px the photograph is still behind the bar').toHaveAttribute('data-state', 'hero-overlay')
  })

  test('it turns solid once the hero has passed', async ({ page }) => {
    await page.goto('/')
    const reach = await hero(page).evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, y + 40), reach)
    await expect(bar(page)).toHaveAttribute('data-state', 'solid')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(bar(page), 'and back to an overlay at the top').toHaveAttribute('data-state', 'hero-overlay')
  })

  test('a hero taller than the screen does not start solid', async ({ page }) => {
    // The hero's marker is below the fold here, so "not visible" is not "passed".
    await page.setViewportSize({ width: 390, height: 480 })
    await page.goto('/')
    await expect(bar(page)).toHaveAttribute('data-state', 'hero-overlay')
  })

  test('a page with no hero is solid from the first paint, not after 60px', async ({ page }) => {
    await page.goto('/about')
    await expect(bar(page)).toHaveAttribute('data-state', 'solid')
    await expect(bar(page)).not.toHaveAttribute('data-bar-tone', /.+/)
  })

  test('with the menu open it is menu-open, and it returns to the hero state when closed', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /open menu/i }).click()
    await expect(bar(page)).toHaveAttribute('data-state', 'menu-open')
    await page.keyboard.press('Escape')
    await expect(bar(page)).toHaveAttribute('data-state', 'hero-overlay')
  })

  test('while the menu is open the page behind it is inert, so the dialog is a true modal', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('main')).not.toHaveAttribute('inert', /.*/)
    await page.getByRole('button', { name: /open menu/i }).click()
    await expect(page.locator('main'), 'main is inert while the menu is open').toHaveAttribute('inert', /.*/)
    await expect(page.locator('footer').first()).toHaveAttribute('inert', /.*/)
    await page.keyboard.press('Escape')
    await expect(page.locator('main'), 'and it is restored when the menu closes').not.toHaveAttribute('inert', /.*/)
  })
})
