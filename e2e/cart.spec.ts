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
    // A ring is sized: a size must resolve to a variant before it can be added.
    await page.getByRole('radio', { name: 'Size 7' }).click()
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
    // The unit price and the subtotal are both $89.00 for a single item, so
    // this asserts against the subtotal specifically rather than any match.
    await expect(dialog.getByTestId('cart-subtotal')).toHaveText('$89.00')
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
    await dialog.getByRole('button', { name: /remove arc band, size 7/i }).click()
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

  test('subtotal shown in cart footer', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-subtotal')).toBeVisible()
  })

  // The bag showed only the product name, so a customer had no way to confirm
  // which size they were about to buy — the one fact that matters for a ring.
  test('cart line states which size was chosen', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-line-variant').first()).toHaveText('Size 7')
  })
})

// Lines used to be keyed by product id, so two sizes of one ring merged into a
// single line and only the first size shipped.
test.describe('Cart — two sizes of one product', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products/arc-band-titanium')
    await page.getByRole('radio', { name: 'Size 7' }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
    await page.getByRole('button', { name: /close bag/i }).click()
    await page.getByRole('radio', { name: 'Size 9' }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('keeps them as two separate lines', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-line')).toHaveCount(2)
  })

  test('labels each line with its own size', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByTestId('cart-line-variant')).toHaveText(['Size 7', 'Size 9'])
  })

  test('the bag count reflects both items', async ({ page }) => {
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('button', { name: /open bag — 2 item/i })).toBeVisible()
  })

  test('removing one size leaves the other in the bag', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /remove arc band, size 7/i }).click()
    await expect(dialog.getByTestId('cart-line')).toHaveCount(1)
    await expect(dialog.getByTestId('cart-line-variant')).toHaveText('Size 9')
  })

  test('changing one size quantity does not affect the other', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /increase quantity of arc band, size 9/i }).click()
    await expect(dialog.locator('[data-testid="qty-display"]').nth(0)).toHaveText('1')
    await expect(dialog.locator('[data-testid="qty-display"]').nth(1)).toHaveText('2')
  })
})
