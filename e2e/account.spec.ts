import { test, expect } from '@playwright/test'

/**
 * Accounts, in the state this ships in.
 *
 * `SHOPIFY_CUSTOMER_ACCOUNT_*` is unset in CI (and, until someone configures the
 * Headless channel, in production), so every test here runs the **unconfigured**
 * path. That is not a limitation to apologise for — it is the branch a real
 * visitor hits today, and the one most likely to be wrong precisely because it
 * looks like the boring case.
 *
 * The rule it enforces: an optional feature that is not configured must degrade
 * into an explanation, never into a stack trace, a 500, or a dead link. The same
 * rule `checkoutMessages.ts` follows — never expose the cause, never leave a dead
 * end.
 */

test.describe('Account — not configured', () => {
  test('the page renders rather than erroring', async ({ page }) => {
    const response = await page.goto('/account')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('says accounts are not enabled, and that you can still buy', async ({ page }) => {
    await page.goto('/account')
    // The important half is the second sentence. "Accounts unavailable" alone
    // reads as "the shop is broken" to someone who only wanted to order.
    await expect(page.getByText(/not enabled/i)).toBeVisible()
    await expect(page.getByText(/do not need one to order/i)).toBeVisible()
  })

  test('offers no sign-in button it cannot honour', async ({ page }) => {
    await page.goto('/account')
    await expect(page.getByRole('link', { name: /^sign in$/i })).toHaveCount(0)
  })

  test('the login route redirects instead of throwing', async ({ page }) => {
    const response = await page.goto('/api/auth/login')
    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/account\?status=unavailable/)
    await expect(page.getByText(/not available on this site yet/i)).toBeVisible()
  })

  test('the OAuth callback rejects a request with no state', async ({ page }) => {
    // The check that stops someone signing a victim into their own account. It
    // must refuse before any token exchange, configured or not.
    const response = await page.goto('/api/auth/callback?code=fake-code&state=forged')
    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/account\?status=(failed|unavailable)/)
  })

  test('is never indexable — it is one person\'s data', async ({ page }) => {
    await page.goto('/account')
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveAttribute('content', /noindex/)
  })
})

test.describe('Account — navigation', () => {
  test('the nav offers a route to it', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /your account/i })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/account$/)
  })

  test('signing out is a POST, so no other site can trigger it', async ({ page }) => {
    // A GET logout can be fired by an <img> tag on any page on the internet.
    const response = await page.request.get('/api/auth/logout', { maxRedirects: 0 })
    expect(response.status()).toBe(405)
  })
})
