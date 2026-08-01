import { test, expect } from '@playwright/test'

test.describe('Cart drawer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('cart drawer is not visible on load', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).not.toBeVisible()
  })

  test('bag icon shows 0 items initially', async ({ page }) => {
    await expect(page.getByRole('button', { name: /open bag — 0 item/i })).toBeVisible()
  })

  test('opening cart drawer shows empty bag message', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByText(/your bag is empty/i)).toBeVisible()
  })

  test('empty cart shows Shop Now link', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('link', { name: /shop now/i })).toBeVisible()
  })

  test('Shop Now link in empty cart points to /shop', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    const link = dialog.getByRole('link', { name: /shop now/i })
    await expect(link).toHaveAttribute('href', '/shop')
  })

  test('empty cart does not show checkout button', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /checkout/i })).not.toBeVisible()
  })

  test('clicking backdrop closes cart', async ({ page }) => {
    await page.getByRole('button', { name: /open bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
    // Click the backdrop (outside the drawer)
    await page.mouse.click(100, 300)
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).not.toBeVisible()
  })
})

test.describe('Cart — with items', () => {
  test.beforeEach(async ({ page }) => {
    // Add a product to cart via the product page
    await page.goto('/products/arc-band-titanium')
    // Arc Band is a ring — Add to Bag stays disabled until a size is chosen.
    await page.getByRole('button', { name: /ring size 7/i }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    // Cart drawer opens automatically — wait for it
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('cart shows product after adding', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByText('Arc Band')).toBeVisible()
  })

  test('cart shows correct price', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByText(/\$89\.00/)).toBeVisible()
  })

  test('cart shows quantity 1 initially', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('1')
  })

  test('increase quantity button increments count', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog
      .getByRole('button', { name: /increase quantity/i })
      .first()
      .click()
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('2')
  })

  test('decrease quantity from 2 to 1', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog
      .getByRole('button', { name: /increase quantity/i })
      .first()
      .click()
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('2')
    await dialog
      .getByRole('button', { name: /decrease quantity/i })
      .first()
      .click()
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('1')
  })

  test('remove button removes item', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /remove arc band/i }).click()
    await expect(dialog.getByText(/your bag is empty/i)).toBeVisible()
  })

  test('checkout button is present with items in cart', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /checkout/i })).toBeVisible()
  })

  test('bag icon count updates after adding item', async ({ page }) => {
    const bagButton = page.getByRole('button', { name: /open bag/i })
    await expect(bagButton).not.toHaveAttribute('aria-label', /0 item/)
  })

  test('total price shown in cart footer', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    // Total price should be visible with $ prefix
    await expect(dialog.getByText(/\$\d+\.\d{2}/).first()).toBeVisible()
  })
})
