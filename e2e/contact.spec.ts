import { test, expect } from '@playwright/test'

test.describe('Contact page — layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact')
  })

  test('page title includes Healthy Jewelry', async ({ page }) => {
    await expect(page).toHaveTitle(/healthy jewelry/i)
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('heading mentions response time', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/24 hours/i)
  })

  test('contact info shows email address', async ({ page }) => {
    await expect(page.getByText(/hello@healthyjewellery\.com/)).toBeVisible()
  })

  test('contact info shows response time label', async ({ page }) => {
    await expect(page.getByText(/Response time/i)).toBeVisible()
  })

  test('materials guide CTA section is visible', async ({ page }) => {
    await expect(page.getByText(/questions about our metals/i)).toBeVisible()
  })

  test('materials guide link navigates to /materials', async ({ page }) => {
    await expect(page.getByRole('link', { name: /view materials guide/i })).toHaveAttribute(
      'href',
      '/materials'
    )
  })
})

test.describe('Contact page — form fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact')
  })

  test('name field is visible and focusable', async ({ page }) => {
    const input = page.getByLabel(/^name$/i)
    await expect(input).toBeVisible()
    await input.focus()
    await expect(input).toBeFocused()
  })

  test('email field is visible and accepts email input', async ({ page }) => {
    const input = page.getByLabel(/^email$/i)
    await expect(input).toBeVisible()
    await input.fill('san@example.com')
    await expect(input).toHaveValue('san@example.com')
  })

  test('subject dropdown is visible with expected options', async ({ page }) => {
    const select = page.getByLabel(/^subject$/i)
    await expect(select).toBeVisible()
    await expect(select.locator('option', { hasText: /general inquiry/i })).toHaveCount(1)
    await expect(select.locator('option', { hasText: /product question/i })).toHaveCount(1)
    await expect(select.locator('option', { hasText: /order support/i })).toHaveCount(1)
    await expect(select.locator('option', { hasText: /custom order/i })).toHaveCount(1)
  })

  test('message textarea is visible and accepts text', async ({ page }) => {
    const textarea = page.getByLabel(/^message$/i)
    await expect(textarea).toBeVisible()
    await textarea.fill('Hello, I have a question about titanium rings.')
    await expect(textarea).toHaveValue('Hello, I have a question about titanium rings.')
  })

  test('submit button is visible and not disabled initially', async ({ page }) => {
    const btn = page.getByRole('button', { name: /send message/i })
    await expect(btn).toBeVisible()
    await expect(btn).not.toBeDisabled()
  })
})

test.describe('Contact form — submission', () => {
  test('valid submission shows success message', async ({ page }) => {
    await page.goto('/contact')

    await page.getByLabel(/^name$/i).fill('San Nguyen')
    await page.getByLabel(/^email$/i).fill('san@example.com')
    await page
      .getByLabel(/^message$/i)
      .fill('Hello, I have a question about titanium rings and sizing.')

    await page.getByRole('button', { name: /send message/i }).click()

    // RESEND_API_KEY is not set in E2E env — API returns 200 via graceful degradation
    await expect(page.getByText(/message sent/i)).toBeVisible({ timeout: 8000 })

    // Form is replaced by success state — submit button should be gone
    await expect(page.getByRole('button', { name: /send message/i })).not.toBeVisible()
  })

  test('success message includes follow-up copy', async ({ page }) => {
    await page.goto('/contact')

    await page.getByLabel(/^name$/i).fill('Test User')
    await page.getByLabel(/^email$/i).fill('test@example.com')
    await page.getByLabel(/^message$/i).fill('A question about materials and biocompatibility.')

    await page.getByRole('button', { name: /send message/i }).click()

    // Scoped to the success block: the page <h1> also promises a reply within
    // 24 hours, so a page-wide match resolves to two nodes. The point of this
    // test is that the *confirmation* repeats the promise.
    const success = page.getByText(/message sent/i).locator('..')
    await expect(success.getByText(/24 hours/i)).toBeVisible({ timeout: 8000 })
  })

  // The form validates in the browser before it ever calls the API
  // (ContactForm's FIELD_VALIDATORS run on submit and return early), so an
  // invalid field produces an inline message and no network request at all.
  // These tests used to assert the opposite — a 400 from /api/contact and a
  // generic banner — which is behaviour the form no longer has.
  test('empty name field is rejected in the browser, with no request sent', async ({ page }) => {
    await page.goto('/contact')

    let requested = false
    await page.route('**/api/contact', async (route) => {
      requested = true
      await route.continue()
    })

    // Leave name empty, fill only email + message
    await page.getByLabel(/^email$/i).fill('san@example.com')
    await page
      .getByLabel(/^message$/i)
      .fill('Hello, this message is long enough to pass the minimum.')

    await page.getByRole('button', { name: /send message/i }).click()

    // The exact copy from validateName() in src/lib/utils/contactValidation.ts.
    await expect(page.getByText('Name must be 2-100 characters')).toBeVisible({ timeout: 8000 })
    // Still on the form, and the network was never touched.
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible()
    expect(requested, 'client-side validation should short-circuit the request').toBe(false)
  })

  test('malformed email is rejected in the browser', async ({ page }) => {
    await page.goto('/contact')

    await page.getByLabel(/^name$/i).fill('San Nguyen')
    await page.getByLabel(/^email$/i).fill('not-an-email')
    await page.getByLabel(/^message$/i).fill('Hello there, a long enough message.')

    await page.getByRole('button', { name: /send message/i }).click()

    // The exact copy from validateEmail().
    await expect(page.getByText('Valid email required')).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible()
  })

  // A server failure is the only path to the generic error state, and it cannot
  // be reached through the UI now that the client validates first. Intercepting
  // the route is what makes that branch — and its mailto fallback — testable.
  test('a failing API shows the error state with a direct email fallback', async ({ page }) => {
    await page.goto('/contact')

    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      })
    )

    await page.getByLabel(/^name$/i).fill('San Nguyen')
    await page.getByLabel(/^email$/i).fill('san@example.com')
    await page.getByLabel(/^message$/i).fill('A perfectly valid message about titanium rings.')

    await page.getByRole('button', { name: /send message/i }).click()

    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /hello@healthyjewellery\.com/i })).toBeVisible()
  })
})
