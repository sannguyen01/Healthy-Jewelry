import { test, expect } from '@playwright/test'

const PRODUCT_URL = '/products/arc-band-titanium'

test.describe('Checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRODUCT_URL)
    await page.getByRole('radio', { name: 'Size 7' }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('checkout button is present in cart drawer with item', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /^checkout$/i })).toBeVisible()
  })

  // Against a placeholder store the Shopify cart mutation cannot succeed, so
  // this exercises the failure path. It used to send the customer to /checkout
  // regardless, where the same sync failed again and left them on a spinner
  // reading "Connect your Shopify store to enable checkout" with no way back.
  // Failing in place, with the bag still visible, is the correct behaviour.
  test('a checkout that cannot be prepared reports the failure in the bag', async ({ page }) => {
    await page.getByRole('button', { name: /^checkout$/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-error')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(PRODUCT_URL)
  })

  test('the checkout failure message is written for a customer, not a developer', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /^checkout$/i }).click()
    const error = page.getByTestId('cart-error')
    await expect(error).toBeVisible({ timeout: 15000 })
    await expect(error).not.toContainText(/shopify store/i)
  })

  test('the bag survives a failed checkout attempt', async ({ page }) => {
    await page.getByRole('button', { name: /^checkout$/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-error')).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByTestId('cart-line')).toHaveCount(1)
  })

  test('/checkout with an empty bag redirects to the cart page', async ({ page }) => {
    await page.getByRole('button', { name: /remove arc band, size 7/i }).click()
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/cart$/, { timeout: 15000 })
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
