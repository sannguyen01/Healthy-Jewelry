import { test, expect } from '@playwright/test'

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
    const homeLink = page
      .getByRole('banner')
      .getByRole('link', { name: /healthy jewelry.*home/i })
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

  test('search control is visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: /^search$/i })).toBeVisible()
  })

  // It used to be a <button> with no handler — the header's only discovery
  // control did nothing when clicked.
  test('search control navigates to /search', async ({ page }) => {
    await page.getByRole('link', { name: /^search$/i }).click()
    await expect(page).toHaveURL(/\/search/)
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
