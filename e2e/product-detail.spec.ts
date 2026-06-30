import { test, expect } from '@playwright/test'

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

  test('shows price with dollar sign', async ({ page }) => {
    await expect(page.getByText(/\$\d+/).first()).toBeVisible()
  })

  test('shows product description', async ({ page }) => {
    const desc = page
      .locator('p')
      .filter({ hasText: /titanium/i })
      .first()
    await expect(desc).toBeVisible()
  })

  test('shows "Grade 23 Titanium" material label', async ({ page }) => {
    await expect(page.getByText(/grade 23 titanium/i)).toBeVisible()
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

  test('clicking "Add to Bag" opens the cart drawer', async ({ page }) => {
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('cart shows product after adding to bag', async ({ page }) => {
    // Get the product title first
    const title = await page.getByRole('heading', { level: 1 }).textContent()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    if (title) {
      await expect(dialog.getByText(title)).toBeVisible()
    }
  })

  test('cart shows non-zero item count after adding', async ({ page }) => {
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    // Bag button count should be > 0
    const bagButton = page.getByRole('button', { name: /open bag/i })
    await expect(bagButton).not.toHaveAttribute('aria-label', /0 item/)
  })

  test('Checkout button is present in cart after adding item', async ({ page }) => {
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
})
