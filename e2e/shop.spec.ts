import { test, expect } from '@playwright/test'

test.describe('Shop page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop')
  })

  test('page has heading or title containing Shop', async ({ page }) => {
    await expect(page).toHaveTitle(/healthy jewelry/i)
    // Either a heading or the page renders products
    const heading = page.getByRole('heading')
    await expect(heading.first()).toBeVisible()
  })

  test('shows product cards', async ({ page }) => {
    // At least one product card should be visible (static data fallback)
    const articleCards = page.locator('article')
    await expect(articleCards.first()).toBeVisible()
  })

  test('each product card links to product detail', async ({ page }) => {
    // ProductCard renders `<Link><article>…</article></Link>`, so the link is
    // the card's *ancestor*, not a descendant. Searching inside the <article>
    // finds nothing and times out; filter the links by the card they contain.
    const cardLink = page
      .getByRole('link')
      .filter({ has: page.locator('article') })
      .first()
    await expect(cardLink).toHaveAttribute('href', /\/products\//)
  })

  test('each product card shows a price', async ({ page }) => {
    // Currency-agnostic on purpose — see product-detail.spec.ts.
    const firstCard = page.locator('article').first()
    await expect(firstCard.getByText(/[$€£₫]\s?[\d,]+/)).toBeVisible()
  })

  test('shows all 5 collection filter options', async ({ page }) => {
    // Collection links should be available for filtering
    await expect(page.getByRole('link', { name: /rings/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /necklaces/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /earrings/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /bracelets/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /charms/i }).first()).toBeVisible()
  })
})

test.describe('Collection pages', () => {
  const collections = ['rings', 'necklaces', 'earrings', 'bracelets', 'charms']

  for (const collection of collections) {
    test(`/shop/${collection} loads and shows products`, async ({ page }) => {
      await page.goto(`/shop/${collection}`)
      await expect(page).toHaveURL(`/shop/${collection}`)
      const cards = page.locator('article')
      await expect(cards.first()).toBeVisible()
    })
  }
})
