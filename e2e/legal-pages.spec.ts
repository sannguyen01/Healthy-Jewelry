import { test, expect } from '@playwright/test'

/**
 * The static content pages, smoke-covered as a set.
 *
 * `/faq`, `/legal` and `/stores` were absent from this table until 2026-08-28 and had
 * **zero** automated coverage of any kind — not one E2E spec navigated to them and no
 * unit test renders them. Vitest coverage is scoped to `src/lib`, `src/store` and
 * `src/config` on purpose, so E2E is the only automated coverage the UI layer has: a
 * route no spec visits is a route nothing checks at all. `src/tests/unit/spec-anchor-contract.test.ts`
 * now fails on a route that is neither visited nor listed in `e2e/COVERAGE.md`, which is
 * what surfaced these three.
 *
 * The assertions are deliberately shallow — renders without a 500, has a heading. That is
 * a smoke test, not a specification, and it is worth having: every one of these pages is
 * a `PageHeader` and a body of copy, so "it renders and has an h1" is most of what there
 * is to be wrong.
 */
test.describe('Static content pages', () => {
  const contentPages = [
    { path: '/privacy', name: 'Privacy Policy' },
    { path: '/terms', name: 'Terms of Service' },
    { path: '/shipping', name: 'Shipping' },
    { path: '/faq', name: 'FAQ' },
    { path: '/legal', name: 'Legal' },
    { path: '/stores', name: 'Stores' },
  ]

  for (const { path, name } of contentPages) {
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
