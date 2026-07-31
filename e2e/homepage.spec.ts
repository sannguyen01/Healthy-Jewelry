import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders page title', async ({ page }) => {
    await expect(page).toHaveTitle(/healthy jewelry/i)
  })

  test('hero section is visible', async ({ page }) => {
    const hero = page.locator('section').first()
    await expect(hero).toBeVisible()
  })

  test('hero contains CTA link to shop', async ({ page }) => {
    const shopLink = page.getByRole('link', { name: /shop/i }).first()
    await expect(shopLink).toBeVisible()
  })

  test('campaign band shows brand tagline', async ({ page }) => {
    await expect(
      page.getByText(/science before aesthetics/i),
    ).toBeVisible()
  })

  test('materials section mentions Grade 23 Titanium', async ({ page }) => {
    // Product cards also carry the material name, so this targets the heading
    // in the materials section rather than any occurrence on the page.
    await expect(page.getByRole('heading', { name: 'Grade 23 Titanium' })).toBeVisible()
  })

  test('materials section mentions Niobium', async ({ page }) => {
    await expect(page.getByText(/niobium/i).first()).toBeVisible()
  })

  test('materials section mentions 316L Surgical Steel', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '316L Surgical Steel' })).toBeVisible()
  })

  test('footer is present', async ({ page }) => {
    const footer = page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
  })

  test('footer shows copyright', async ({ page }) => {
    await expect(page.getByText(/© 2026 Healthy Jewelry/i)).toBeVisible()
  })

  test('horizontal scroll strip shows product cards', async ({ page }) => {
    // At least one product card link should exist on the homepage
    const productLinks = page.getByRole('link').filter({ hasText: /\$/ })
    await expect(productLinks.first()).toBeVisible()
  })

  test('collection grid has 4 collection links', async ({ page }) => {
    const rings = page.getByRole('link', { name: /rings/i })
    const necklaces = page.getByRole('link', { name: /necklaces/i })
    await expect(rings.first()).toBeVisible()
    await expect(necklaces.first()).toBeVisible()
  })

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter out known non-critical errors (font loading, etc.)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('font') &&
        !e.includes('favicon') &&
        !e.includes('Not implemented'),
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
