import { test, expect, type Page } from './support/test'
import { LEGAL_ENTITY_NAME, SITE_NAME } from '../src/config/site'

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders page title', async ({ page }) => {
    await expect(page).toHaveTitle(new RegExp(SITE_NAME))
  })

  test('hero section is visible', async ({ page }) => {
    const hero = page.locator('section').first()
    await expect(hero).toBeVisible()
  })

  test('the hero\'s primary action leads to the pieces', async ({ page }) => {
    // It matched the first link anywhere whose name said "shop", which was the hero's "Shop Collection" until
    // the label stopped saying it (nothing here can be bought). The control it meant is the hero's first action.
    const action = page.locator('main > section').first().getByRole('link').first()
    await expect(action).toBeVisible()
    await expect(action).toHaveAttribute('href', '/shop')
  })

  test('the dark care band is present (ADR 040)', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /care\s*&\s*craft/i })).toBeVisible()
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
    await expect(page.getByText(`© 2026 ${LEGAL_ENTITY_NAME}`)).toBeVisible()
  })

  test('horizontal scroll strip shows product cards', async ({ page }) => {
    // A product card is identified by where it goes, not by a price on it.
    //
    // This used to filter links by `hasText: /\$/`, which found a card only because every
    // card quoted a dollar amount. That is two assertions wearing one coat: *a strip
    // exists* and *cards carry prices*. When the second stopped being true the first
    // reported a missing strip, which is not what changed.
    //
    // Matched on `href` rather than on a contained `<article>`: the strip's card is a
    // `<Link>` wrapping two `<div>`s (`HorizontalScroll.tsx`), while `/shop`'s card is a
    // `<Link>` wrapping an `<article>` (`ProductCard.tsx`). The destination is the one
    // property both have, and it is the property that makes a card a card.
    const productLinks = page.locator('a[href^="/products/"]')
    await expect(productLinks.first()).toBeVisible()
    await expect(await productLinks.count()).toBeGreaterThan(1)
  })

  test('the strip offers a mouse a scrollbar, and leaves touch without one', async ({ page }, testInfo) => {
    // A plain wheel scrolls vertically only. With the bar hidden everywhere, the cards past
    // the strip's edge (2 of 6 at 1280px) were reachable by mouse only with Shift+wheel
    // (found 2026-10-04). Fine pointers get a hairline bar; touch scrolls sideways natively.
    //
    // Asserted on the computed `scrollbar-width`, not on the bar's box: Playwright launches
    // headless Chromium with --hide-scrollbars, so no scrollbar ever takes layout space here
    // and `offsetHeight - clientHeight` reads 0 whatever the stylesheet says.
    const strip = page.locator('.hj3-noscroll').first()
    await expect(strip).toBeVisible()
    const m = await strip.evaluate((el: HTMLElement) => ({
      fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
      overflow: el.scrollWidth - el.clientWidth,
      scrollbar: getComputedStyle(el).scrollbarWidth,
    }))
    // Each project must exercise the branch it is here for, or this proves nothing.
    expect(m.fine, `pointer media in ${testInfo.project.name}`).toBe(testInfo.project.name !== 'mobile')
    expect(m.overflow, 'the strip no longer overflows, so this checks nothing').toBeGreaterThan(0)
    expect(m.scrollbar).toBe(m.fine ? 'thin' : 'none')
  })

  test('the homepage quotes no prices', async ({ page }) => {
    // The other half, asserted deliberately rather than left as the absence that broke
    // the test above. `src/tests/unit/price-absence-contract.test.tsx` owns this at the
    // component level; this is the rendered page, which is where a price would actually
    // be read by a customer.
    await expect(page.getByText(/[$€£¥₫]\s?[\d,]+/)).toHaveCount(0)
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
