import { test, expect } from '@playwright/test'

test.describe('Legal pages', () => {
  const legalPages = [
    { path: '/privacy', name: 'Privacy Policy' },
    { path: '/terms', name: 'Terms of Service' },
    { path: '/shipping', name: 'Shipping' },
  ]

  for (const { path, name } of legalPages) {
    test(`${name} page loads without error`, async ({ page }) => {
      const response = await page.goto(path)
      // Should return 200 (or redirect) — never a 500
      expect(response?.status()).not.toBe(500)
    })

    test(`${name} page has a heading`, async ({ page }) => {
      await page.goto(path)
      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible()
    })
  }
})

test.describe('About and Materials pages', () => {
  test('About page loads', async ({ page }) => {
    await page.goto('/about')
    await expect(page).toHaveURL('/about')
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('Materials page loads and mentions titanium', async ({ page }) => {
    await page.goto('/materials')
    await expect(page).toHaveURL('/materials')
    await expect(page.getByText(/titanium/i).first()).toBeVisible()
  })

  test('Contact page loads with form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page).toHaveURL('/contact')
    // Should have some form elements or contact info
    const formOrSection = page.locator('form, section').first()
    await expect(formOrSection).toBeVisible()
  })
})
