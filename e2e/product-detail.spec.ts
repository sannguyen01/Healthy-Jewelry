import { test, expect } from '@playwright/test'

/**
 * What a product page shows, now that it no longer sells anything.
 *
 * The Add to Bag control was removed, and with it six tests that drove it: the button's
 * presence, its size gate, the drawer it opened, and the three cart assertions that
 * followed a click. They are deleted rather than skipped — the control does not exist, so
 * there is nothing for them to be pending on.
 *
 * The size picker stays and stays covered. It still tells a visitor which sizes a piece
 * comes in and which one they have picked; it simply no longer has to resolve that choice
 * to a purchasable variant. `selectRingSize` went with the deleted tests, as the only
 * caller of it here.
 */

// Use a known product from the static data catalog
const RING_HANDLE = 'arc-band-titanium'
const EARRING_HANDLE = 'disc-studs-titanium'
const BRACELET_HANDLE = 'cable-cuff-titanium'

test.describe('Product detail — ring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
  })

  test('renders the product title as h1', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
  })

  test('shows no price, because nothing on this page can be bought', async ({ page }) => {
    // The inversion of what stood here. This asserted that *a formatted amount is shown at
    // all*, currency-agnostically, so it would not turn red the day a non-USD store
    // connected — a good rule for a storefront and the wrong question for a catalogue.
    //
    // PR #75 removed Add to Bag on 2026-09-19 and this test kept passing, which is the
    // point worth recording: for that window the detail page quoted a number against no way
    // to pay it, and the suite reported the number's presence as correct.
    //
    // Asserted over the whole page rather than one element: a price returning in a tooltip,
    // a meta line or a badge is the same claim in a different box.
    await expect(page.getByText(/[$€£¥₫]\s?[\d,]+/)).toHaveCount(0)
  })

  test('shows no Add to Bag control', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add to bag|add to cart|buy now/i })).toHaveCount(
      0
    )
  })

  test('shows product description', async ({ page }) => {
    const desc = page
      .locator('p')
      .filter({ hasText: /titanium/i })
      .first()
    await expect(desc).toBeVisible()
  })

  test('shows "Grade 23 Titanium" material label', async ({ page }) => {
    // Scoped to the material tag, not the page: the product description also
    // says "Grade 23 titanium", so a page-wide text match resolves to two
    // elements and trips strict mode. This asserts the label specifically.
    await expect(page.locator('.material-tag')).toHaveText(/grade 23 titanium/i)
  })

  test('shows trust signals', async ({ page }) => {
    await expect(page.getByText(/IMPLANT GRADE/)).toBeVisible()
    await expect(page.getByText(/HYPOALLERGENIC/)).toBeVisible()
    await expect(page.getByText(/MRI SAFE/)).toBeVisible()
  })

  test('shows US ring size picker for rings', async ({ page }) => {
    await expect(page.getByText(/US Ring Size/i)).toBeVisible()
  })

  test('ring size options are selectable', async ({ page }) => {
    // Size buttons should be clickable
    const sizeButtons = page.getByRole('button').filter({ hasText: /^[5-9]$|^1[0-2]$/ })
    await expect(sizeButtons.first()).toBeVisible()
  })

})

test.describe('Product detail — earring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/products/${EARRING_HANDLE}`)
  })

  test('does NOT show ring size picker for earrings', async ({ page }) => {
    await expect(page.getByText('US Ring Size')).not.toBeVisible()
  })

  test('does NOT show bracelet size picker for earrings', async ({ page }) => {
    await expect(page.getByText('Bracelet Size')).not.toBeVisible()
  })
})

test.describe('Product detail — bracelet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/products/${BRACELET_HANDLE}`)
  })

  test('shows Bracelet Size picker for bracelets', async ({ page }) => {
    await expect(page.getByText('Bracelet Size')).toBeVisible()
  })
})

test.describe('Product detail — size selection', () => {
  test('clicking a ring size marks it as selected (aria-pressed="true")', async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
    const size7 = page.getByRole('button', { name: 'Ring size 7' })
    await size7.click()
    await expect(size7).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking a different ring size deselects the previous one', async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
    const size7 = page.getByRole('button', { name: 'Ring size 7' })
    const size9 = page.getByRole('button', { name: 'Ring size 9' })
    await size7.click()
    await expect(size7).toHaveAttribute('aria-pressed', 'true')
    await size9.click()
    await expect(size9).toHaveAttribute('aria-pressed', 'true')
    await expect(size7).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking a bracelet size marks it as selected', async ({ page }) => {
    await page.goto(`/products/${BRACELET_HANDLE}`)
    const sizeM = page.getByRole('button', { name: 'Bracelet size M' })
    await sizeM.click()
    await expect(sizeM).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Product detail — breadcrumb navigation', () => {
  test('breadcrumb nav is present with aria-label', async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible()
  })

  test('breadcrumb Shop link navigates to /shop', async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
    const shopLink = page
      .getByRole('navigation', { name: /breadcrumb/i })
      .getByRole('link', { name: /^shop$/i })
    await shopLink.click()
    await expect(page).toHaveURL('/shop')
  })

  test('breadcrumb collection link navigates to collection page', async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
    const collectionLink = page
      .getByRole('navigation', { name: /breadcrumb/i })
      .getByRole('link', { name: /rings/i })
    await collectionLink.click()
    await expect(page).toHaveURL('/shop/rings')
  })

  /**
   * **No breadcrumb may link to a 404, on any product.**
   *
   * The three tests above check `arc-band-titanium` specifically, and would have
   * passed while the bug was live — locally `arc-band-titanium` resolves from the
   * static catalogue, where its collection is `rings` by construction. Against the
   * real store it is in Shopify's built-in `frontpage` collection as well, returned
   * first, and the old unvalidated cast put `frontpage` into the breadcrumb — a link
   * to `/shop/frontpage`, which `dynamicParams = false` answers with a hard 404.
   *
   * So this asserts the property rather than the instance: every breadcrumb href on
   * every product page must resolve. That holds whatever Shopify returns, and it does
   * not depend on anybody remembering which collection is the awkward one.
   *
   * `dynamicParams = false` is what makes this cheap to check — an unserved collection
   * is a real 404 status, not a soft one, so `response.status()` is the whole test.
   */
  for (const handle of [RING_HANDLE, EARRING_HANDLE, BRACELET_HANDLE]) {
    test(`every breadcrumb link on /products/${handle} resolves`, async ({ page, request }) => {
      await page.goto(`/products/${handle}`)

      const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i })

      // Wait for the breadcrumb before reading it. `evaluateAll` is the one locator
      // method that does NOT auto-wait — it resolves against whatever matches at
      // that instant and returns [] if nothing does — so without this the next line
      // races page render and the assertion below fails with `Received: 0`.
      //
      // That is not hypothetical: this test failed exactly that way on CI for
      // `disc-studs-titanium` (run 32801022396) and was recorded as `1 flaky` for
      // `cable-cuff-titanium` in the run before it, while passing locally every
      // time. 418 tests across 2 workers against one `next start` is the load that
      // makes it show. The 30s timeout below was added for the same symptom and
      // guards the wrong line — a slow *link response* was never the problem.
      await expect(breadcrumb.getByRole('link').first()).toBeVisible()

      const hrefs = await breadcrumb
        .getByRole('link')
        .evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''))

      // A breadcrumb with no links at all would make the loop below vacuous — the
      // shape of green that proves nothing.
      expect(hrefs.length).toBeGreaterThan(0)

      for (const href of hrefs) {
        // An explicit, generous timeout. This fires N extra requests per test
        // while 374 others run in parallel against one `next start`, and it
        // flaked once under exactly that load — a slow response is not a dead
        // link, and a check that reports one as the other is worse than no check.
        const response = await request.get(href, { timeout: 30_000 })
        expect(response.status(), `breadcrumb link ${href} is a dead end`).toBeLessThan(400)
      }
    })
  }
})
