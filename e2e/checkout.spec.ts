import { test, expect } from '@playwright/test'

const PRODUCT_URL = '/products/arc-band-titanium'

test.describe('Checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRODUCT_URL)
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('checkout button is present in cart drawer with item', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /^checkout$/i })).toBeVisible()
  })

  test('checkout button triggers navigation away from product page', async ({ page }) => {
    // Checkout navigates to Shopify URL (or /checkout fallback when no store domain)
    await page.getByRole('button', { name: /^checkout$/i }).click()
    await expect(page).not.toHaveURL(PRODUCT_URL, { timeout: 8000 })
  })

  test('bag icon count shows 1 after adding one item', async ({ page }) => {
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('button', { name: /open bag — 1 item/i })).toBeVisible()
  })

  test('adding two items increments badge to 2', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /increase quantity/i }).first().click()
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('2')
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('button', { name: /open bag — 2 item/i })).toBeVisible()
  })
})
