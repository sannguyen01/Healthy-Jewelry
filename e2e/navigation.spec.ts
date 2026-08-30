import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * The search control lives in two places depending on width, and these tests run
 * at both project defaults — 1280px in `chromium`, 412px in `mobile`.
 *
 * Below 769px the header sheds Search and Account into the full-screen overlay,
 * because keeping four text controls in a 64px bar needs 435px of content and no
 * phone is that wide (see `e2e/header-fit.spec.ts`). Resolving the control by
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

  test('brand wordmark is visible', async ({ page }) => {
    await expect(page.getByText('HEALTHY JEWELLERY')).toBeVisible()
  })

  test('logo links to homepage', async ({ page }) => {
    // Scoped to the header: the footer carries an identically-labelled home
    // link, so a page-wide lookup resolves to two elements and trips strict
    // mode. Both links are correct — only the query was ambiguous.
    const homeLink = page.locator('header').getByRole('link', { name: /healthy jewelry.*home/i })
    await expect(homeLink).toBeVisible()
    await homeLink.click()
    await expect(page).toHaveURL('/')
  })

  test('Collection nav link navigates to /shop', async ({ page }) => {
    const link = page.getByRole('link', { name: /collection/i }).first()
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

  test('bag button opens cart drawer', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('cart drawer can be closed', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).not.toBeVisible()
  })

  test('cart drawer closes on Escape key', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).not.toBeVisible()
  })

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
    await expect(dialog.getByRole('link', { name: /collection/i })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /our story/i })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /contact/i })).toBeVisible()
  })

  test('mobile overlay shows materials tagline', async ({ page }) => {
    await page.getByRole('button', { name: /open menu/i }).click()
    const dialog = page.getByRole('dialog', { name: /mobile navigation/i })
    await expect(dialog.getByText(/titanium.*niobium.*surgical steel/i)).toBeVisible()
  })

  test('close button dismisses mobile overlay', async ({ page }) => {
    await page.getByRole('button', { name: /open menu/i }).click()
    await page.getByRole('button', { name: /close menu/i }).click()
    await expect(page.getByRole('dialog', { name: /mobile navigation/i })).not.toBeVisible()
  })
})
