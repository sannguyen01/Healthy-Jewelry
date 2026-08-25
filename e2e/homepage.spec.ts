import { test, expect, type Page } from '@playwright/test'

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
    await expect(page.getByText(/science before aesthetics/i)).toBeVisible()
  })

  /**
   * Scoped to the materials section, not to the page.
   *
   * These three read `page.getByText(...).first()` until 2026-08-25, which does not mean
   * "the materials section says this" — it means "the first node anywhere on the homepage
   * says this", and on this page that is never the materials section. `/niobium/i` matched
   * the **hero eyebrow** ("Implant-Grade Titanium · Niobium · 316L Steel"); the other two
   * matched **product cards in the first scroll strip**, which render their material as a
   * line of card metadata. Measured: with `<MaterialsSection />` deleted from `page.tsx`,
   * all twelve tests in this file still passed.
   *
   * Same family as the `--hj-hero-fade` bug — a guardrail that passes on the wrong thing —
   * and it is the reason `e2e/homepage-composition.spec.ts` exists: a homepage assertion
   * that never says *which section* cannot notice a section going missing.
   *
   * Located by its heading rather than a test id, matching the convention in
   * hero-legibility.spec.ts: a failure then names copy a visitor could not find.
   */
  const materialsSection = (page: Page) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: /built from the inside out/i }) })

  test('materials section mentions Grade 23 Titanium', async ({ page }) => {
    await expect(materialsSection(page).getByText(/grade 23 titanium/i)).toBeVisible()
  })

  test('materials section mentions Niobium', async ({ page }) => {
    await expect(materialsSection(page).getByText(/^niobium$/i)).toBeVisible()
  })

  test('materials section mentions 316L Surgical Steel', async ({ page }) => {
    await expect(materialsSection(page).getByText(/316L surgical steel/i)).toBeVisible()
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

  test('collection grid has all 5 collection links', async ({ page }) => {
    const collectionNames = [/rings/i, /necklaces/i, /earrings/i, /bracelets/i, /charms/i]
    for (const name of collectionNames) {
      await expect(page.getByRole('link', { name }).first()).toBeVisible()
    }
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
      (e) => !e.includes('font') && !e.includes('favicon') && !e.includes('Not implemented')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
