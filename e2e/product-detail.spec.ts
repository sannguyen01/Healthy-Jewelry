import { test, expect, type Page } from '@playwright/test'

// Use a known product from the static data catalog
const RING_HANDLE = 'arc-band-titanium'
const EARRING_HANDLE = 'disc-studs-titanium'
const BRACELET_HANDLE = 'cable-cuff-titanium'

/**
 * Rings keep "Add to Bag" disabled until a size is chosen, so every add-to-bag
 * journey has to pass through the size picker first. Named rather than inlined
 * so the requirement is stated once — `cart.spec.ts` and `checkout.spec.ts`
 * carry the same step.
 */
async function selectRingSize(page: Page, size = 7): Promise<void> {
  await page.getByRole('button', { name: `Ring size ${size}` }).click()
}

test.describe('Product detail — ring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/products/${RING_HANDLE}`)
  })

  test('renders the product title as h1', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
  })

  test('shows a formatted price in the store currency', async ({ page }) => {
    // Not `/\$\d+/`. The price is now rendered in whatever currency Shopify
    // charges, so pinning the dollar sign here would turn red the day a
    // non-USD store connects — failing for correct behaviour. What matters is
    // that a formatted amount is shown at all; `currency-consistency.test.tsx`
    // owns the question of *which* currency.
    await expect(page.getByText(/[$€£₫]\s?[\d,]+/).first()).toBeVisible()
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

  test('"Add to Bag" button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add.*to bag/i })).toBeVisible()
  })

  test('"Add to Bag" is gated until a size is chosen', async ({ page }) => {
    // The gate is a feature, not an obstacle — a ring cannot be added without a
    // size. It is asserted here so the size-selection steps in the tests below
    // read as deliberate rather than as incidental setup.
    const addToBag = page.getByRole('button', { name: /add.*to bag/i })
    await expect(addToBag).toBeDisabled()
    await expect(addToBag).toHaveAttribute('aria-label', /select a size/i)

    await selectRingSize(page)
    await expect(addToBag).toBeEnabled()
  })

  test('clicking "Add to Bag" opens the cart drawer', async ({ page }) => {
    await selectRingSize(page)
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('cart shows product after adding to bag', async ({ page }) => {
    // Get the product title first
    const title = await page.getByRole('heading', { level: 1 }).textContent()
    await selectRingSize(page)
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    if (title) {
      await expect(dialog.getByText(title)).toBeVisible()
    }
  })

  test('cart shows non-zero item count after adding', async ({ page }) => {
    await selectRingSize(page)
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    // Bag button count should be > 0
    const bagButton = page.getByRole('button', { name: /open bag/i })
    await expect(bagButton).not.toHaveAttribute('aria-label', /0 item/)
  })

  test('Checkout button is present in cart after adding item', async ({ page }) => {
    await selectRingSize(page)
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /checkout/i })).toBeVisible()
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

      const hrefs = await page
        .getByRole('navigation', { name: /breadcrumb/i })
        .getByRole('link')
        .evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''))

      // A breadcrumb with no links at all would make the loop below vacuous — the
      // shape of green that proves nothing.
      expect(hrefs.length).toBeGreaterThan(0)

      for (const href of hrefs) {
        const response = await request.get(href)
        expect(response.status(), `breadcrumb link ${href} is a dead end`).toBeLessThan(400)
      }
    })
  }
})
