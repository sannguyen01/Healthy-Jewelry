import { test, expect, type Page } from '@playwright/test'

/**
 * Checkout hand-off to Shopify.
 *
 * The previous version of this file asserted that clicking Checkout navigated
 * *away from the product page* — and its own comment conceded "or /checkout
 * fallback when no store domain". So it passed while checkout was completely
 * broken: the customer was being sent to a page that spun and then told them to
 * connect a Shopify store. A green suite reported the feature as working.
 *
 * These assert the two outcomes that actually matter. On success the browser
 * must end up at the Shopify checkout URL — that is where payment happens and
 * what triggers Shopify's confirmation email; the site itself never takes a
 * card. On failure the customer must be told, in their own language, with the
 * bag intact.
 *
 * Shopify is reached through the `/api/shopify` persisted-query proxy, so
 * intercepting that one route controls the whole flow without needing real
 * credentials.
 */

const PRODUCT_URL = '/products/arc-band-titanium'
const FAKE_CHECKOUT_URL = 'https://test-shop.myshopify.com/checkouts/c/abc123'

/**
 * Stands in for Shopify's hosted checkout so the redirect can be asserted.
 *
 * Without this the browser genuinely tries to reach test-shop.myshopify.com and
 * fails TLS, which looks like a redirect failure but is only the sandbox. The
 * assertion we care about is that the browser was *sent* there.
 */
async function stubShopifyHostedCheckout(page: Page): Promise<void> {
  await page.route('https://test-shop.myshopify.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><h1>Shopify Checkout</h1></body></html>',
    })
  )
}

/** Answers CreateCart with a cart whose checkoutUrl is ours to assert on. */
async function mockShopifySuccess(page: Page): Promise<void> {
  await page.route('**/api/shopify', async (route) => {
    const body = route.request().postDataJSON() as { operation?: string }
    if (body?.operation === 'CreateCart') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            cartCreate: {
              cart: {
                id: 'gid://shopify/Cart/abc123',
                checkoutUrl: FAKE_CHECKOUT_URL,
                lines: { edges: [] },
              },
              userErrors: [],
            },
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { cart: null } }),
    })
  })
}

/** Answers every Shopify call with a server error. */
async function mockShopifyFailure(page: Page): Promise<void> {
  await page.route('**/api/shopify', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Failed to reach Shopify API' }),
    })
  )
}

/**
 * Puts a real Shopify variant id on the bag.
 *
 * The bundled fallback catalog ships placeholder ids
 * (`gid://shopify/ProductVariant/hj-001-default`), and the store now refuses to
 * sync those — correctly, since Shopify would reject them. Tests of the success
 * path therefore have to represent a bag built from real Shopify data.
 */
async function seedBag(
  page: Page,
  overrides: { price?: string; currencyCode?: string } = {}
): Promise<void> {
  const { price = '89.00', currencyCode = 'USD' } = overrides
  await page.addInitScript(
    ([seedPrice, seedCurrency]) => {
      const product = {
        id: 'hj-001',
        defaultVariantId: 'gid://shopify/ProductVariant/44123456789',
        handle: 'arc-band-titanium',
        title: 'Arc Band',
        collection: 'rings',
        material: 'titanium',
        tags: ['rings'],
        price: seedPrice,
        compareAtPrice: null,
        currencyCode: seedCurrency,
        badge: null,
        description: 'Test',
        spec: '2mm',
        svgType: 'ring-arc',
        variants: [],
      }
      localStorage.setItem(
        'hj-cart',
        JSON.stringify({
          state: {
            items: [
              { product, quantity: 1, variantId: 'gid://shopify/ProductVariant/44123456789' },
            ],
            shopifyCartId: null,
            checkoutUrl: null,
          },
          version: 0,
        })
      )
    },
    [price, currencyCode] as const
  )
}

/** The default bag: a real Shopify variant id, priced in the store's currency. */
async function seedBagWithRealVariant(page: Page): Promise<void> {
  await seedBag(page)
}

test.describe('Checkout — successful hand-off to Shopify', () => {
  test.beforeEach(async ({ page }) => {
    await seedBagWithRealVariant(page)
    await stubShopifyHostedCheckout(page)
    await mockShopifySuccess(page)
  })

  test('the checkout page redirects to the Shopify checkout URL', async ({ page }) => {
    await page.goto('/checkout')
    // The whole point of the feature: payment happens on Shopify, and this is
    // the only thing that gets the customer there.
    await page.waitForURL(FAKE_CHECKOUT_URL, { timeout: 10_000 })
    expect(page.url()).toBe(FAKE_CHECKOUT_URL)
  })

  test('the cart drawer checkout button redirects to Shopify', async ({ page }) => {
    await page.goto('/cart')
    await page.getByRole('button', { name: /open bag/i }).click()

    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /^checkout$/i }).click()

    await page.waitForURL(FAKE_CHECKOUT_URL, { timeout: 10_000 })
    expect(page.url()).toBe(FAKE_CHECKOUT_URL)
  })
})

test.describe('Checkout — failure is visible to the customer', () => {
  test.beforeEach(async ({ page }) => {
    await seedBagWithRealVariant(page)
    await mockShopifyFailure(page)
  })

  test('the checkout page explains the failure instead of spinning', async ({ page }) => {
    await page.goto('/checkout')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /couldn't start your order|couldn't reach checkout|temporarily unavailable/i,
      { timeout: 10_000 }
    )
    // The specific message that used to be shown to shoppers.
    await expect(page.getByText(/connect your shopify store/i)).toHaveCount(0)
    await expect(page.getByText(/preparing checkout/i)).toHaveCount(0)
  })

  test('offers a way through — retry, and a route to a human', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /email us/i })).toHaveAttribute(
      'href',
      /^mailto:hello@healthyjewellery\.com/
    )
    await expect(page.getByRole('link', { name: /back to bag/i })).toBeVisible()
  })

  test('the bag survives a failed checkout', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

    // Nothing was charged and nothing was cleared — the customer can retry or
    // walk away without rebuilding their bag.
    await page.getByRole('link', { name: /back to bag/i }).click()
    await expect(page).toHaveURL(/\/cart/)
    await expect(page.getByRole('button', { name: /open bag — 1 item/i })).toBeVisible()
  })

  test('the drawer surfaces the error rather than punting to /checkout', async ({ page }) => {
    await page.goto('/cart')
    await page.getByRole('button', { name: /open bag/i }).click()

    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog.getByRole('button', { name: /^checkout$/i }).click()

    // It used to navigate to /checkout on failure, where the same sync failed
    // again — two dead ends for one problem.
    await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/checkout/)
  })
})

test.describe('Checkout — the price quoted is the price charged', () => {
  /**
   * Every surface used to print `$` unconditionally, so a store selling in dong
   * would advertise "$89.00" and hand the customer to a Shopify checkout asking
   * for ₫. The unit guard covers each component in isolation; this covers the
   * chain — server render, hydration, persisted bag — on the two pages where a
   * customer reads a total before deciding to pay.
   */
  test('a bag priced in VND shows dong on the cart page, never dollars', async ({ page }) => {
    await seedBag(page, { price: '2290000', currencyCode: 'VND' })
    await page.goto('/cart')

    const main = page.locator('main')
    await expect(main.getByText(/₫/).first()).toBeVisible()
    await expect(main.getByText(/\$/)).toHaveCount(0)
  })

  test('a bag priced in VND shows dong in the cart drawer', async ({ page }) => {
    await seedBag(page, { price: '2290000', currencyCode: 'VND' })
    await page.goto('/cart')
    await page.getByRole('button', { name: /open bag/i }).click()

    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByText(/₫/).first()).toBeVisible()
    await expect(dialog.getByText(/\$/)).toHaveCount(0)
  })

  test('the catalog currency reaches the homepage strips and product page', async ({ page }) => {
    // The static catalog is USD, so this asserts the fallback still quotes a
    // real currency rather than proving VND twice — a blanket swap would be as
    // wrong as the hardcoded dollar it replaced.
    await page.goto('/')
    await expect(page.getByText('$89.00').first()).toBeVisible()

    await page.goto(PRODUCT_URL)
    await expect(page.getByText('$89.00').first()).toBeVisible()
  })
})

test.describe('Checkout — the bag itself', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRODUCT_URL)
    await page.getByRole('button', { name: /ring size 7/i }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
  })

  test('checkout button is present in the cart drawer with an item', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(dialog.getByRole('button', { name: /^checkout$/i })).toBeVisible()
  })

  test('bag icon count shows 1 after adding one item', async ({ page }) => {
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('button', { name: /open bag — 1 item/i })).toBeVisible()
  })

  test('adding two items increments badge to 2', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: /shopping bag/i })
    await dialog
      .getByRole('button', { name: /increase quantity/i })
      .first()
      .click()
    await expect(dialog.locator('[data-testid="qty-display"]').first()).toHaveText('2')
    await page.getByRole('button', { name: /close bag/i }).click()
    await expect(page.getByRole('button', { name: /open bag — 2 item/i })).toBeVisible()
  })
})
